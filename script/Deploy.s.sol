// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Savings, ISwapRouter02, IUniswapV3Factory} from "../src/Savings.sol";
import {StandingOrders} from "../src/StandingOrders.sol";
// Each contract declares its own factory interface, so these are two distinct
// types that happen to share a name - the loan's needs its own alias.
import {CollateralLoan, IUniswapV3Factory as ILoanFactory} from "../src/CollateralLoan.sol";

/// Deploys the three bank contracts to RH Chain. None of them takes an owner,
/// so there is nothing to hand over afterwards - what lands on-chain is final.
contract Deploy is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant SGOV = 0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5;
    address constant FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    uint24 constant SGOV_FEE = 3000;

    function run() external {
        vm.startBroadcast();

        Savings savings = new Savings(ISwapRouter02(ROUTER), IUniswapV3Factory(FACTORY), USDG, SGOV, SGOV_FEE);
        StandingOrders payments = new StandingOrders();
        CollateralLoan loan = new CollateralLoan(IERC20(USDG), ILoanFactory(FACTORY));

        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_SAVINGS_ADDRESS=%s", address(savings));
        console.log("NEXT_PUBLIC_PAYMENTS_ADDRESS=%s", address(payments));
        console.log("NEXT_PUBLIC_LOAN_ADDRESS=%s", address(loan));
    }
}
