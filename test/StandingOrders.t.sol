// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {StandingOrders} from "../src/StandingOrders.sol";

contract Coin is ERC20 {
    constructor() ERC20("USDG", "USDG") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract StandingOrdersTest is Test {
    StandingOrders so;
    Coin usdg;
    address alice = makeAddr("alice");   // payer
    address landlord = makeAddr("landlord");
    address keeper = makeAddr("keeper");

    function setUp() public {
        so = new StandingOrders();
        usdg = new Coin();
        usdg.mint(alice, 10_000e6);
        vm.prank(alice);
        usdg.approve(address(so), type(uint256).max);
    }

    function test_create_escrows_the_whole_budget() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 200e6, 30 days, 6, 0, 0); // 6 x 200

        assertEq(usdg.balanceOf(address(so)), 1_200e6);
        assertEq(usdg.balanceOf(alice), 10_000e6 - 1_200e6);
        assertEq(so.orderOf(id).remaining, 1_200e6);
    }

    function test_pays_the_recipient_on_schedule_and_not_before() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 200e6, 30 days, 3, 0, 0);

        // First payment is due immediately (startDelay 0).
        vm.prank(keeper);
        so.execute(id);
        assertEq(usdg.balanceOf(landlord), 200e6);
        assertEq(usdg.balanceOf(keeper), 0); // caller gains nothing

        // Not a second sooner.
        vm.prank(keeper);
        vm.expectRevert(StandingOrders.TooSoon.selector);
        so.execute(id);

        vm.warp(vm.getBlockTimestamp() + 30 days);
        so.execute(id);
        vm.warp(vm.getBlockTimestamp() + 30 days);
        so.execute(id); // third and final
        assertEq(usdg.balanceOf(landlord), 600e6);

        // Budget exhausted.
        vm.warp(vm.getBlockTimestamp() + 30 days);
        vm.expectRevert(StandingOrders.NotOpen.selector);
        so.execute(id);
    }

    function test_start_delay_defers_the_first_payment() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 100e6, 7 days, 4, 7 days, 0);
        vm.expectRevert(StandingOrders.TooSoon.selector);
        so.execute(id);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        so.execute(id);
        assertEq(usdg.balanceOf(landlord), 100e6);
    }

    function test_cancel_refunds_the_rest_to_the_owner() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 200e6, 30 days, 6, 0, 0);
        so.execute(id); // 200 paid, 1000 left

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        so.cancel(id);
        assertEq(usdg.balanceOf(alice), before + 1_000e6);

        vm.prank(alice);
        vm.expectRevert(StandingOrders.NotOpen.selector);
        so.cancel(id);
    }

    function test_only_the_owner_cancels() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 200e6, 30 days, 6, 0, 0);
        vm.prank(keeper);
        vm.expectRevert(StandingOrders.NotOwner.selector);
        so.cancel(id);
    }

    function test_expiry_stops_execution_but_never_the_refund() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 200e6, 30 days, 6, 0, uint64(block.timestamp + 10 days));

        vm.warp(vm.getBlockTimestamp() + 20 days);
        vm.expectRevert(StandingOrders.Expired.selector);
        so.execute(id);

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        so.cancel(id);
        assertEq(usdg.balanceOf(alice), before + 1_200e6);
    }

    function test_final_payment_closes_the_order() public {
        vm.prank(alice);
        uint256 id = so.create(address(usdg), landlord, 100e6, 1 days, 3, 0, 0); // 300 budget

        so.execute(id);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        so.execute(id);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        so.execute(id); // third — budget spent

        assertEq(usdg.balanceOf(landlord), 300e6);
        assertEq(so.orderOf(id).remaining, 0);

        vm.warp(vm.getBlockTimestamp() + 1 days);
        vm.expectRevert(StandingOrders.NotOpen.selector);
        so.execute(id);
    }
}
