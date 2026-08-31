// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256 amountOut);
}

interface IUniswapV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}

/// @title Savings — a non-custodial USDG savings account backed by a
/// short-treasury token (SGOV).
///
/// Deposit USDG and it is swapped into SGOV, which the vault holds for you; the
/// yield is simply SGOV appreciating against USDG, so a balance grows on its
/// own. Withdraw swaps your SGOV back and pays you the USDG. You may also lock
/// a deposit for a term — the same account, just not withdrawable until the
/// clock runs out, as a commitment device.
///
/// The two prices — what you buy at, what you sell at — are enforced as the
/// swap's minimum outputs, which you pass, so a bad fill is impossible by
/// construction. Deliberately no owner, no pause, no fee switch: the only power
/// over your balance is your own withdraw.
contract Savings is ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable router;
    IUniswapV3Factory public immutable factory;
    address public immutable usdg;
    address public immutable sgov;
    uint24 public immutable fee;

    /// Longest a deposit can be locked: two years.
    uint64 public constant MAX_TERM = 730 days;

    /// SGOV held per account, freely withdrawable.
    mapping(address => uint256) public shares;
    /// SGOV held per account behind a lock.
    mapping(address => uint256) public lockedShares;
    /// When an account's locked shares become withdrawable.
    mapping(address => uint64) public unlockAt;

    event Deposited(address indexed user, uint256 usdgIn, uint256 sgovOut, bool locked);
    event Withdrawn(address indexed user, uint256 sgovIn, uint256 usdgOut, bool locked);

    error ZeroAmount();
    error NoPool();
    error Insufficient();
    error TermTooLong();
    error StillLocked();

    constructor(ISwapRouter02 router_, IUniswapV3Factory factory_, address usdg_, address sgov_, uint24 fee_) {
        if (factory_.getPool(usdg_, sgov_, fee_) == address(0)) revert NoPool();
        router = router_;
        factory = factory_;
        usdg = usdg_;
        sgov = sgov_;
        fee = fee_;
    }

    // ---------------------------------------------------------------- deposit

    /// Save `usdgIn`, accepting at least `minSgovOut` SGOV for it.
    function deposit(uint256 usdgIn, uint256 minSgovOut) external nonReentrant returns (uint256 out) {
        out = _buy(usdgIn, minSgovOut);
        shares[msg.sender] += out;
        emit Deposited(msg.sender, usdgIn, out, false);
    }

    /// Save `usdgIn` behind a lock of `term` seconds. Locking again extends the
    /// unlock to the later of the two — one rolling lock per account.
    function depositLocked(uint256 usdgIn, uint256 minSgovOut, uint64 term) external nonReentrant returns (uint256 out) {
        if (term == 0) revert ZeroAmount();
        if (term > MAX_TERM) revert TermTooLong();
        out = _buy(usdgIn, minSgovOut);
        lockedShares[msg.sender] += out;
        uint64 end = uint64(block.timestamp) + term;
        if (end > unlockAt[msg.sender]) unlockAt[msg.sender] = end;
        emit Deposited(msg.sender, usdgIn, out, true);
    }

    // --------------------------------------------------------------- withdraw

    /// Sell `sgovShares` of the free balance back to USDG, demanding at least
    /// `minUsdgOut`, paid straight to you.
    function withdraw(uint256 sgovShares, uint256 minUsdgOut) external nonReentrant returns (uint256 out) {
        if (sgovShares == 0) revert ZeroAmount();
        if (shares[msg.sender] < sgovShares) revert Insufficient();
        shares[msg.sender] -= sgovShares;
        out = _sell(sgovShares, minUsdgOut, msg.sender);
        emit Withdrawn(msg.sender, sgovShares, out, false);
    }

    /// Sell locked shares once the term is up.
    function withdrawLocked(uint256 sgovShares, uint256 minUsdgOut) external nonReentrant returns (uint256 out) {
        if (sgovShares == 0) revert ZeroAmount();
        if (block.timestamp < unlockAt[msg.sender]) revert StillLocked();
        if (lockedShares[msg.sender] < sgovShares) revert Insufficient();
        lockedShares[msg.sender] -= sgovShares;
        out = _sell(sgovShares, minUsdgOut, msg.sender);
        emit Withdrawn(msg.sender, sgovShares, out, true);
    }

    // ------------------------------------------------------------------ views

    /// Total SGOV the vault holds for an account, free plus locked.
    function totalShares(address user) external view returns (uint256) {
        return shares[user] + lockedShares[user];
    }

    // ---------------------------------------------------------------- helpers

    function _buy(uint256 usdgIn, uint256 minSgovOut) private returns (uint256 out) {
        if (usdgIn == 0) revert ZeroAmount();
        IERC20(usdg).safeTransferFrom(msg.sender, address(this), usdgIn);
        IERC20(usdg).forceApprove(address(router), usdgIn);
        out = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: usdg,
                tokenOut: sgov,
                fee: fee,
                recipient: address(this), // held by the vault, credited to the user
                amountIn: usdgIn,
                amountOutMinimum: minSgovOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _sell(uint256 sgovIn, uint256 minUsdgOut, address to) private returns (uint256 out) {
        IERC20(sgov).forceApprove(address(router), sgovIn);
        out = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: sgov,
                tokenOut: usdg,
                fee: fee,
                recipient: to, // straight to the saver
                amountIn: sgovIn,
                amountOutMinimum: minUsdgOut,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
