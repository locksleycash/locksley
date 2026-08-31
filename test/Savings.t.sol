// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Savings, ISwapRouter02, IUniswapV3Factory} from "../src/Savings.sol";

contract Coin is ERC20 {
    uint8 private immutable _dec;
    constructor(string memory n, uint8 d) ERC20(n, n) { _dec = d; }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract MockFactory {
    mapping(bytes32 => address) public pools;
    function put(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }
    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

/// A router with a settable USDG<->SGOV rate that honours amountOutMinimum by
/// reverting, exactly as the real one does.
contract MockRouter {
    address public usdg;
    address public sgov;
    // out = in * num / den, chosen per direction.
    uint256 public buyNum = 1;  uint256 public buyDen = 1;   // USDG->SGOV
    uint256 public sellNum = 1; uint256 public sellDen = 1;  // SGOV->USDG
    error TooLittleReceived();
    function set(address u, address s) external { usdg = u; sgov = s; }
    function setBuy(uint256 n, uint256 d) external { buyNum = n; buyDen = d; }
    function setSell(uint256 n, uint256 d) external { sellNum = n; sellDen = d; }
    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        if (p.tokenIn == usdg) out = (p.amountIn * buyNum) / buyDen;
        else out = (p.amountIn * sellNum) / sellDen;
        if (out < p.amountOutMinimum) revert TooLittleReceived();
        ERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        Coin(p.tokenOut).mint(p.recipient, out);
    }
}

contract SavingsTest is Test {
    Savings sv;
    MockRouter router;
    MockFactory factory;
    Coin usdg;
    Coin sgov;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    // SGOV ~ $1 with tiny yield: buy 1 USDG(6dec) -> ~1 SGOV(18dec). Scale
    // 1e6 USDG -> 1e18 SGOV means num/den = 1e12.
    function setUp() public {
        router = new MockRouter();
        factory = new MockFactory();
        usdg = new Coin("USDG", 6);
        sgov = new Coin("SGOV", 18);
        router.set(address(usdg), address(sgov));
        factory.put(address(usdg), address(sgov), 3000, address(0xBEEF));
        sv = new Savings(ISwapRouter02(address(router)), IUniswapV3Factory(address(factory)), address(usdg), address(sgov), 3000);

        // 1 USDG(1e6) -> 1 SGOV(1e18): num=1e12, den=1
        router.setBuy(1e12, 1);
        // 1 SGOV(1e18) -> 1 USDG(1e6): num=1, den=1e12
        router.setSell(1, 1e12);

        usdg.mint(alice, 10_000e6);
        usdg.mint(bob, 10_000e6);
        vm.prank(alice); usdg.approve(address(sv), type(uint256).max);
        vm.prank(bob); usdg.approve(address(sv), type(uint256).max);
    }

    // --------------------------------------------------------------- deposit

    function test_deposit_buys_sgov_and_credits_the_saver() public {
        vm.prank(alice);
        uint256 out = sv.deposit(100e6, 99e18); // want >= 99 SGOV for 100 USDG

        assertEq(out, 100e18);
        assertEq(sv.shares(alice), 100e18);
        assertEq(sgov.balanceOf(address(sv)), 100e18); // held by the vault
        assertEq(sgov.balanceOf(alice), 0);            // not paid out
        assertEq(usdg.balanceOf(alice), 10_000e6 - 100e6);
    }

    function test_deposit_respects_the_buy_floor() public {
        router.setBuy(9e11, 1); // 100 USDG -> only 90 SGOV
        vm.prank(alice);
        vm.expectRevert(MockRouter.TooLittleReceived.selector);
        sv.deposit(100e6, 99e18); // demanded 99
    }

    // -------------------------------------------------------------- withdraw

    function test_withdraw_sells_back_and_pays_the_saver_the_yield() public {
        vm.prank(alice);
        sv.deposit(100e6, 100e18); // holds 100 SGOV

        // SGOV appreciated 5%: each SGOV now sells for 1.05 USDG.
        router.setSell(105, 100 * 1e12);

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 out = sv.withdraw(100e18, 104e6); // expect ~105 USDG

        assertEq(out, 105e6);
        assertEq(usdg.balanceOf(alice), before + 105e6); // grew from 100 -> 105
        assertEq(sv.shares(alice), 0);
    }

    function test_withdraw_respects_the_sell_floor_and_balance() public {
        vm.prank(alice);
        sv.deposit(100e6, 100e18);

        vm.prank(alice);
        vm.expectRevert(Savings.Insufficient.selector);
        sv.withdraw(101e18, 0); // more than held

        router.setSell(90, 100 * 1e12); // 100 SGOV -> 90 USDG
        vm.prank(alice);
        vm.expectRevert(MockRouter.TooLittleReceived.selector);
        sv.withdraw(100e18, 99e6); // demanded 99
    }

    function test_one_savers_balance_is_isolated_from_another() public {
        vm.prank(alice); sv.deposit(100e6, 100e18);
        vm.prank(bob); sv.deposit(50e6, 50e18);

        // Bob cannot touch Alice's shares — he only has his own 50.
        vm.prank(bob);
        vm.expectRevert(Savings.Insufficient.selector);
        sv.withdraw(60e18, 0);

        vm.prank(bob);
        sv.withdraw(50e18, 0);
        assertEq(sv.shares(alice), 100e18); // untouched
    }

    // ---------------------------------------------------------------- locked

    function test_locked_deposit_cannot_be_withdrawn_before_the_term() public {
        vm.prank(alice);
        sv.depositLocked(100e6, 100e18, 30 days);

        assertEq(sv.lockedShares(alice), 100e18);
        assertEq(sv.unlockAt(alice), uint64(block.timestamp + 30 days));

        vm.prank(alice);
        vm.expectRevert(Savings.StillLocked.selector);
        sv.withdrawLocked(100e18, 0);

        vm.warp(block.timestamp + 30 days);
        vm.prank(alice);
        uint256 out = sv.withdrawLocked(100e18, 99e6);
        assertEq(out, 100e6);
        assertEq(sv.lockedShares(alice), 0);
    }

    function test_locking_again_extends_to_the_later_unlock() public {
        vm.startPrank(alice);
        sv.depositLocked(100e6, 100e18, 30 days);
        uint64 firstUnlock = sv.unlockAt(alice);
        sv.depositLocked(100e6, 100e18, 90 days); // longer term
        vm.stopPrank();

        assertGt(sv.unlockAt(alice), firstUnlock);
        assertEq(sv.unlockAt(alice), uint64(block.timestamp + 90 days));
        assertEq(sv.lockedShares(alice), 200e18);
    }

    function test_rejects_absurd_lock_term() public {
        vm.prank(alice);
        vm.expectRevert(Savings.TermTooLong.selector);
        sv.depositLocked(100e6, 100e18, 731 days);
    }
}
