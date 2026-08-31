// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";

interface IUniswapV3Factory {
    function getPool(address, address, uint24) external view returns (address);
}

interface IUniswapV3PoolState {
    function slot0() external view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool);
}

/// @title CollateralLoan — borrow USDG against tokenized-stock collateral.
///
/// Two sides share one pool of USDG. Lenders `supply` USDG and earn the borrow
/// interest through a rising share value. Borrowers post a stock as collateral
/// and `borrow` USDG up to half its value; interest accrues on the debt. If a
/// position's debt climbs past the liquidation line — because the stock fell —
/// anyone may `liquidate` it, repaying debt to seize the collateral at a small
/// discount.
///
/// Prices come from the collateral's own Uniswap pool (raw sqrtPriceX96), so
/// there is no separate oracle to trust or manipulate beyond the market itself.
/// No owner, no pause, no fee beyond the interest that flows to lenders.
contract CollateralLoan is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant Q192 = 2 ** 192;
    uint256 private constant WAD = 1e18;
    uint16 public constant BPS = 10_000;

    /// Borrow up to 50% of collateral value; liquidatable past 60%.
    uint16 public constant MAX_LTV_BPS = 5_000;
    uint16 public constant LIQ_THRESHOLD_BPS = 6_000;
    /// Liquidator seizes 8% more collateral than the debt they repay.
    uint16 public constant LIQ_BONUS_BPS = 800;
    /// A single liquidation may close at most half the debt.
    uint16 public constant CLOSE_FACTOR_BPS = 5_000;
    /// ~8% APR, per second, scaled by WAD.
    uint256 public constant RATE_PER_SEC = 2_535_100_000;

    IERC20 public immutable usdg;
    IUniswapV3Factory public immutable factory;

    // ---- lender reserve ----
    uint256 public totalSupplyShares;
    mapping(address => uint256) public supplyShares;
    uint256 public totalBorrows;

    // ---- borrower positions (one collateral token each) ----
    struct Position {
        address collToken;
        uint24 collFee;
        uint256 collateral;      // stock amount held
        uint256 principalScaled; // debt = principalScaled * borrowIndex / WAD
    }
    mapping(address => Position) public positions;

    uint256 public borrowIndex = WAD;
    uint64 public lastAccrual;

    event Supplied(address indexed user, uint256 usdgIn, uint256 shares);
    event Redeemed(address indexed user, uint256 shares, uint256 usdgOut);
    event Collateralized(address indexed user, address token, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed by, uint256 repaid, uint256 seized);

    error ZeroAmount();
    error NoPool();
    error NotEnoughCash();
    error Undercollateralized();
    error Healthy();
    error WrongCollateral();
    error NothingToSeize();

    constructor(IERC20 usdg_, IUniswapV3Factory factory_) {
        usdg = usdg_;
        factory = factory_;
        lastAccrual = uint64(block.timestamp);
    }

    // -------------------------------------------------------------- interest

    /// Fold elapsed interest into the debt and the lender share value.
    function accrue() public {
        uint64 nowTs = uint64(block.timestamp);
        uint256 dt = nowTs - lastAccrual;
        if (dt == 0 || totalBorrows == 0) {
            lastAccrual = nowTs;
            return;
        }
        uint256 factorGrowth = (RATE_PER_SEC * dt);          // scaled by WAD
        uint256 interest = Math.mulDiv(totalBorrows, factorGrowth, WAD);
        totalBorrows += interest;
        borrowIndex += Math.mulDiv(borrowIndex, factorGrowth, WAD);
        lastAccrual = nowTs;
    }

    // ---------------------------------------------------------------- lender

    /// USDG in the reserve plus what is lent out — the value backing all shares.
    function reserveValue() public view returns (uint256) {
        return usdg.balanceOf(address(this)) + totalBorrows;
    }

    function supply(uint256 amount) external nonReentrant returns (uint256 sh) {
        if (amount == 0) revert ZeroAmount();
        accrue();
        uint256 val = reserveValue();
        sh = totalSupplyShares == 0 || val == 0 ? amount : Math.mulDiv(amount, totalSupplyShares, val);
        supplyShares[msg.sender] += sh;
        totalSupplyShares += sh;
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit Supplied(msg.sender, amount, sh);
    }

    function redeem(uint256 sh) external nonReentrant returns (uint256 amount) {
        if (sh == 0) revert ZeroAmount();
        accrue();
        amount = Math.mulDiv(sh, reserveValue(), totalSupplyShares);
        if (amount > usdg.balanceOf(address(this))) revert NotEnoughCash();
        supplyShares[msg.sender] -= sh; // reverts on overdraw
        totalSupplyShares -= sh;
        usdg.safeTransfer(msg.sender, amount);
        emit Redeemed(msg.sender, sh, amount);
    }

    // ------------------------------------------------------------- borrower

    function debtOf(address user) public view returns (uint256) {
        return Math.mulDiv(positions[user].principalScaled, borrowIndex, WAD);
    }

    /// USDG value of a position's collateral at the pool's spot price.
    function collateralValue(address user) public view returns (uint256) {
        Position storage p = positions[user];
        if (p.collateral == 0) return 0;
        return _value(p.collToken, p.collFee, p.collateral);
    }

    function depositCollateral(address token, uint24 fee, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positions[msg.sender];
        if (p.collateral == 0 && p.principalScaled == 0) {
            if (factory.getPool(token, address(usdg), fee) == address(0)) revert NoPool();
            p.collToken = token;
            p.collFee = fee;
        } else if (token != p.collToken) {
            revert WrongCollateral();
        }
        p.collateral += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Collateralized(msg.sender, token, amount);
    }

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        accrue();
        Position storage p = positions[msg.sender];
        uint256 newDebt = debtOf(msg.sender) + amount;
        if (newDebt > Math.mulDiv(collateralValue(msg.sender), MAX_LTV_BPS, BPS)) revert Undercollateralized();
        if (amount > usdg.balanceOf(address(this))) revert NotEnoughCash();
        p.principalScaled += Math.mulDiv(amount, WAD, borrowIndex);
        totalBorrows += amount;
        usdg.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant returns (uint256 paid) {
        if (amount == 0) revert ZeroAmount();
        accrue();
        Position storage p = positions[msg.sender];
        uint256 d = debtOf(msg.sender);
        paid = amount < d ? amount : d;
        p.principalScaled -= Math.mulDiv(paid, WAD, borrowIndex);
        totalBorrows -= paid;
        usdg.safeTransferFrom(msg.sender, address(this), paid);
        emit Repaid(msg.sender, paid);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        accrue();
        Position storage p = positions[msg.sender];
        if (amount > p.collateral) revert Undercollateralized();
        uint256 remaining = _value(p.collToken, p.collFee, p.collateral - amount);
        if (debtOf(msg.sender) > Math.mulDiv(remaining, MAX_LTV_BPS, BPS)) revert Undercollateralized();
        p.collateral -= amount;
        IERC20(p.collToken).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ----------------------------------------------------------- liquidation

    /// Repay part of an unhealthy position's debt and seize collateral worth
    /// the repayment plus the liquidation bonus.
    function liquidate(address user, uint256 repayAmount) external nonReentrant returns (uint256 seized) {
        if (repayAmount == 0) revert ZeroAmount();
        accrue();
        Position storage p = positions[user];
        uint256 d = debtOf(user);
        uint256 collVal = collateralValue(user);
        if (d <= Math.mulDiv(collVal, LIQ_THRESHOLD_BPS, BPS)) revert Healthy();

        uint256 maxClose = Math.mulDiv(d, CLOSE_FACTOR_BPS, BPS);
        uint256 pay = repayAmount < maxClose ? repayAmount : maxClose;

        // Collateral to seize = pay grossed up by the bonus, converted at spot.
        uint256 seizeValue = Math.mulDiv(pay, BPS + LIQ_BONUS_BPS, BPS);
        seized = Math.mulDiv(p.collateral, seizeValue, collVal);
        if (seized == 0) revert NothingToSeize();
        if (seized > p.collateral) seized = p.collateral;

        p.principalScaled -= Math.mulDiv(pay, WAD, borrowIndex);
        totalBorrows -= pay;
        p.collateral -= seized;

        usdg.safeTransferFrom(msg.sender, address(this), pay);
        IERC20(p.collToken).safeTransfer(msg.sender, seized);
        emit Liquidated(user, msg.sender, pay, seized);
    }

    // ---------------------------------------------------------------- pricing

    /// USDG (6-dec raw) value of `amount` of a stock, from the pool sqrt price.
    function _value(address token, uint24 fee, uint256 amount) private view returns (uint256) {
        address pool = factory.getPool(token, address(usdg), fee);
        if (pool == address(0)) revert NoPool();
        (uint160 sqrtP,,,,,,) = IUniswapV3PoolState(pool).slot0();
        uint256 p = uint256(sqrtP);
        uint256 pp = Math.mulDiv(p, p, 1); // sqrtP^2
        if (token < address(usdg)) {
            // token is token0: USDG(raw) per token(raw) = sqrtP^2 / 2^192.
            return Math.mulDiv(amount, pp, Q192);
        } else {
            // token is token1: USDG per token = 2^192 / sqrtP^2.
            return Math.mulDiv(amount, Q192, pp);
        }
    }
}
