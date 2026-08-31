// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title StandingOrders — scheduled token payments, escrowed on-chain.
///
/// Set up a recurring payment — rent, a salary, an allowance — by escrowing the
/// whole budget and stating an amount, an interval, and a recipient. Once a
/// payment falls due anyone may execute it, and the tokens go straight to the
/// recipient you named, never to the caller. A keeper is merely one such caller,
/// so no payment depends on the operator being online.
///
/// The only powers over an order are the owner's: execution can pay nobody but
/// the fixed recipient, and cancel refunds whatever is left. No admin, no pause,
/// no fee.
contract StandingOrders is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address owner;
        address recipient;
        address token;
        uint256 amount;    // per payment
        uint256 remaining; // escrowed tokens left
        uint64 interval;
        uint64 nextDue;    // timestamp the next payment is allowed
        uint64 expiry;     // 0 = never expires
    }

    uint256 public nextId = 1;
    mapping(uint256 => Order) public orders;

    event Created(uint256 indexed id, address indexed owner, address indexed recipient, address token, uint256 amount, uint256 budget);
    event Paid(uint256 indexed id, address indexed recipient, address by, uint256 amount, uint256 remaining);
    event Cancelled(uint256 indexed id, uint256 refunded);

    error ZeroAmount();
    error BadOrder();
    error NotOwner();
    error NotOpen();
    error TooSoon();
    error Expired();

    /// Schedule `payments` transfers of `amount` `token` to `recipient`, one
    /// every `interval` seconds, the first after `startDelay`.
    function create(
        address token,
        address recipient,
        uint256 amount,
        uint64 interval,
        uint32 payments,
        uint64 startDelay,
        uint64 expiry
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0 || payments == 0) revert ZeroAmount();
        if (recipient == address(0) || interval == 0) revert BadOrder();

        uint256 budget = amount * payments;
        id = nextId++;
        orders[id] = Order({
            owner: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            remaining: budget,
            interval: interval,
            nextDue: uint64(block.timestamp) + startDelay,
            expiry: expiry
        });
        IERC20(token).safeTransferFrom(msg.sender, address(this), budget);
        emit Created(id, msg.sender, recipient, token, amount, budget);
    }

    /// Permissionless: release the next payment once it is due. Pays the fixed
    /// recipient; the caller gains nothing beyond having helped.
    function execute(uint256 id) external nonReentrant returns (uint256 pay) {
        Order storage o = orders[id];
        if (o.remaining == 0) revert NotOpen();
        if (o.expiry != 0 && block.timestamp > o.expiry) revert Expired();
        if (block.timestamp < o.nextDue) revert TooSoon();

        pay = o.amount < o.remaining ? o.amount : o.remaining;
        o.remaining -= pay;
        o.nextDue += o.interval;
        IERC20(o.token).safeTransfer(o.recipient, pay);
        emit Paid(id, o.recipient, msg.sender, pay, o.remaining);
    }

    /// Refund whatever is left and close the order. Owner only, any time.
    function cancel(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        if (o.owner != msg.sender) revert NotOwner();
        uint256 refund = o.remaining;
        if (refund == 0) revert NotOpen();
        o.remaining = 0;
        IERC20(o.token).safeTransfer(o.owner, refund);
        emit Cancelled(id, refund);
    }

    function orderOf(uint256 id) external view returns (Order memory) {
        return orders[id];
    }
}
