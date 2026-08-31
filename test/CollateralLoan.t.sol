// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";
import {CollateralLoan, IERC20, IUniswapV3Factory} from "../src/CollateralLoan.sol";

contract Coin is ERC20 {
    uint8 private immutable _dec;
    constructor(string memory n, uint8 d) ERC20(n, n) { _dec = d; }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract MockPool {
    uint160 public price;
    function set(uint160 p) external { price = p; }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (price, 0, 0, 0, 0, 0, true);
    }
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

contract CollateralLoanTest is Test {
    CollateralLoan loan;
    MockFactory factory;
    MockPool pool;
    Coin usdg;
    Coin stock;
    address alice = makeAddr("alice");   // borrower
    address bob = makeAddr("bob");        // lender
    address liq = makeAddr("liquidator");

    uint256 constant Q192 = 2 ** 192;
    uint160 constant Q96 = uint160(2 ** 96);
    uint24 constant FEE = 3000;

    function setUp() public {
        factory = new MockFactory();
        pool = new MockPool();
        usdg = new Coin("USDG", 6);
        stock = new Coin("NVDA", 18);
        factory.put(address(stock), address(usdg), FEE, address(pool));
        loan = new CollateralLoan(IERC20(address(usdg)), IUniswapV3Factory(address(factory)));

        setPricePerShare(100e6); // $100 per whole share

        usdg.mint(bob, 100_000e6);
        usdg.mint(alice, 10_000e6);
        usdg.mint(liq, 100_000e6);
        stock.mint(alice, 100e18);

        vm.prank(bob); usdg.approve(address(loan), type(uint256).max);
        vm.prank(alice); usdg.approve(address(loan), type(uint256).max);
        vm.prank(alice); stock.approve(address(loan), type(uint256).max);
        vm.prank(liq); usdg.approve(address(loan), type(uint256).max);

        // Bob funds the reserve so there is USDG to borrow.
        vm.prank(bob); loan.supply(50_000e6);
    }

    /// Set the pool sqrt so 1e18 stock is worth `valuePer6dec` USDG (6-dec raw).
    function setPricePerShare(uint256 valuePer6dec) internal {
        bool stockIsToken0 = address(stock) < address(usdg);
        uint256 sqrtSq = stockIsToken0
            ? Math.mulDiv(valuePer6dec, Q192, 1e18)      // value = 1e18 * sq/2^192
            : Math.mulDiv(1e18, Q192, valuePer6dec);     // value = 1e18 * 2^192/sq
        pool.set(uint160(Math.sqrt(sqrtSq)));
    }

    function _collateralize(uint256 shares) internal {
        vm.prank(alice);
        loan.depositCollateral(address(stock), FEE, shares);
    }

    // ---------------------------------------------------------------- pricing

    function test_prices_collateral_from_the_pool() public {
        _collateralize(10e18); // 10 shares @ $100 = ~$1000
        assertApproxEqRel(loan.collateralValue(alice), 1_000e6, 1e15); // within 0.1%
    }

    // ----------------------------------------------------------------- borrow

    function test_borrow_is_capped_at_max_ltv() public {
        _collateralize(10e18); // $1000 collateral
        vm.prank(alice);
        loan.borrow(490e6); // under 50% — fine
        assertEq(usdg.balanceOf(alice), 10_000e6 + 490e6);

        vm.prank(alice);
        vm.expectRevert(CollateralLoan.Undercollateralized.selector);
        loan.borrow(60e6); // would push past $500
    }

    function test_repay_reduces_debt() public {
        _collateralize(10e18);
        vm.prank(alice); loan.borrow(400e6);
        vm.prank(alice); uint256 paid = loan.repay(150e6);
        assertEq(paid, 150e6);
        assertApproxEqAbs(loan.debtOf(alice), 250e6, 1);
    }

    // --------------------------------------------------------------- interest

    function test_interest_accrues_to_lenders_and_borrowers() public {
        _collateralize(10e18);
        vm.prank(alice); loan.borrow(400e6);

        uint256 before = loan.reserveValue();
        vm.warp(vm.getBlockTimestamp() + 365 days);
        loan.accrue();

        // ~8% APR on 400 borrowed ≈ 32 USDG of interest.
        assertApproxEqRel(loan.debtOf(alice), 432e6, 2e16); // within 2%
        assertGt(loan.reserveValue(), before);              // lenders' value grew
    }

    // ------------------------------------------------------ collateral safety

    function test_cannot_withdraw_collateral_that_breaks_health() public {
        _collateralize(10e18);
        vm.prank(alice); loan.borrow(490e6); // near the 50% cap of $1000

        // Removing a share drops value below the borrow limit (490 > $900*50%).
        vm.prank(alice);
        vm.expectRevert(CollateralLoan.Undercollateralized.selector);
        loan.withdrawCollateral(1e18);

        // With no debt, all collateral comes back.
        vm.prank(alice); loan.repay(500e6);
        vm.prank(alice); loan.withdrawCollateral(10e18);
        assertEq(loan.collateralValue(alice), 0);
    }

    // ------------------------------------------------------------ liquidation

    function test_healthy_positions_cannot_be_liquidated() public {
        _collateralize(10e18);
        vm.prank(alice); loan.borrow(400e6);
        vm.prank(liq);
        vm.expectRevert(CollateralLoan.Healthy.selector);
        loan.liquidate(alice, 100e6);
    }

    function test_liquidation_when_the_stock_falls() public {
        _collateralize(10e18);
        vm.prank(alice); loan.borrow(490e6); // near 50% at $1000

        // Stock drops to $70/share -> collateral $700, debt 490 > 60% (420).
        setPricePerShare(70e6);
        assertApproxEqRel(loan.collateralValue(alice), 700e6, 1e15);

        uint256 liqStockBefore = stock.balanceOf(liq);
        vm.prank(liq);
        uint256 seized = loan.liquidate(alice, 245e6); // close half

        assertGt(seized, 0);
        assertEq(stock.balanceOf(liq), liqStockBefore + seized);
        assertApproxEqAbs(loan.debtOf(alice), 245e6, 1); // debt halved
    }
}
