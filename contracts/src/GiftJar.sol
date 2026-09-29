// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GiftJar — gift Pandock boxes from chat
/// @notice People park sealed boxes here with a plain transfer. The chat bot (the operator, a Circle agent
///         wallet) can then send them on when their linked account writes "/gift friend 1" in Telegram, but only
///         from what that person parked, at most `dailyLimit` a day, once per message. A friend with no linked
///         wallet yet gets the box held under their chat account until they link one.
///         Pandock's own promo budget works the same way: the treasury parks boxes like anyone else.
contract GiftJar is ERC1155Holder, Ownable {
    uint256 public constant BOX = 0;
    IERC1155 public immutable pandock;

    address public operator;
    /// Boxes one wallet can send through the listener per UTC day.
    uint256 public dailyLimit;

    /// wallet => boxes parked for it
    mapping(address => uint256) public deposits;
    /// keccak256 of a chat account ("tg:" + user id, or "tg:" + lower-cased username) => boxes waiting for it to link a wallet
    mapping(bytes32 => uint256) public held;
    /// message id => handled, so a chat message can never be replayed
    mapping(uint256 => bool) public handled;
    mapping(address => mapping(uint256 => uint256)) public sentOnDay;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event Gifted(address indexed from, address indexed to, uint256 amount, uint256 messageId);
    event Held(address indexed from, bytes32 indexed account, uint256 amount, uint256 messageId);
    event Claimed(bytes32 indexed account, address indexed to, uint256 amount);
    event OperatorSet(address operator);
    event DailyLimitSet(uint256 limit);

    error NotOperator();
    error NotBox();
    error NotEnough();
    error AlreadyHandled();
    error OverDailyLimit();
    error NothingHeld();

    constructor(IERC1155 pandock_, address operator_, uint256 dailyLimit_) Ownable(msg.sender) {
        pandock = pandock_;
        operator = operator_;
        dailyLimit = dailyLimit_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // ---------------------------------------------------------------- people

    /// @notice Parking is just `pandock.safeTransferFrom(you, jar, 0, n, "")`; this credits the sender.
    function onERC1155Received(address, address from, uint256 id, uint256 amount, bytes memory)
        public
        override
        returns (bytes4)
    {
        if (msg.sender != address(pandock) || id != BOX) revert NotBox();
        deposits[from] += amount;
        emit Deposited(from, amount);
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        pure
        override
        returns (bytes4)
    {
        revert NotBox();
    }

    /// @notice Take parked boxes back, any time.
    function withdraw(uint256 amount) external {
        if (deposits[msg.sender] < amount) revert NotEnough();
        deposits[msg.sender] -= amount;
        pandock.safeTransferFrom(address(this), msg.sender, BOX, amount, "");
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- listener

    /// @notice A linked sender's message asked for `amount` boxes to go to a linked friend.
    function gift(address from, address to, uint256 amount, uint256 messageId) external onlyOperator {
        _spend(from, amount, messageId);
        pandock.safeTransferFrom(address(this), to, BOX, amount, "");
        emit Gifted(from, to, amount, messageId);
    }

    /// @notice Same, for a friend with no linked wallet yet: kept here under their chat account.
    function hold(address from, bytes32 account, uint256 amount, uint256 messageId) external onlyOperator {
        _spend(from, amount, messageId);
        held[account] += amount;
        emit Held(from, account, amount, messageId);
    }

    /// @notice The account linked a wallet: everything held for it goes there.
    function claim(bytes32 account, address to) external onlyOperator {
        uint256 amount = held[account];
        if (amount == 0) revert NothingHeld();
        held[account] = 0;
        pandock.safeTransferFrom(address(this), to, BOX, amount, "");
        emit Claimed(account, to, amount);
    }

    // ---------------------------------------------------------------- owner

    function setOperator(address op) external onlyOwner {
        operator = op;
        emit OperatorSet(op);
    }

    function setDailyLimit(uint256 limit) external onlyOwner {
        dailyLimit = limit;
        emit DailyLimitSet(limit);
    }

    // ---------------------------------------------------------------- internal

    function _spend(address from, uint256 amount, uint256 messageId) internal {
        if (handled[messageId]) revert AlreadyHandled();
        if (amount == 0 || deposits[from] < amount) revert NotEnough();
        uint256 day = block.timestamp / 1 days;
        if (sentOnDay[from][day] + amount > dailyLimit) revert OverDailyLimit();
        handled[messageId] = true;
        sentOnDay[from][day] += amount;
        deposits[from] -= amount;
    }
}
