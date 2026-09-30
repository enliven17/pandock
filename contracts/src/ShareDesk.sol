// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPriceSource} from "./Pandock.sol";

interface IPandockBuy is IERC1155 {
    function boxPrice() external view returns (uint256);
    function buy(uint256 amount) external payable;
}

/// @title ShareDesk — turn prize shares back into USDC, or into new boxes
/// @notice Buys the stock tokens a box paid out at the price source's price (the ArcStocks price, relayed), in native
///         USDC it holds. `trade` puts several holdings together into as many sealed boxes as they cover, with the
///         change in USDC. What it takes goes back into Pandock's prize pool. A box pays out about 77% of its price
///         on average, so selling and rebuying can't make money.
contract ShareDesk is ERC1155Holder, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPandockBuy public immutable pandock;
    IPriceSource public immutable prices;

    event Sold(address indexed seller, address indexed token, uint256 amount, uint256 paid);
    event Traded(address indexed seller, uint256 boxes, uint256 change);

    error Unpriced();
    error LengthMismatch();
    error NotEnoughForABox();
    error DeskShort();
    error TransferFailed();

    constructor(IPandockBuy pandock_, IPriceSource prices_) Ownable(msg.sender) {
        (pandock, prices) = (pandock_, prices_);
    }

    /// @notice What `amount` of `token` is worth here, in native USDC (18 dp).
    function quote(address token, uint256 amount) public view returns (uint256) {
        uint256 p = prices.priceOf(token);
        if (p == 0) revert Unpriced();
        return (amount * p * 1e12) / 10 ** IERC20Metadata(token).decimals();
    }

    /// @notice Sell shares for USDC. Approve this contract for the token first.
    function sell(address token, uint256 amount) external nonReentrant returns (uint256 paid) {
        paid = quote(token, amount);
        _take(token, amount);
        emit Sold(msg.sender, token, amount, paid);
        _pay(msg.sender, paid);
    }

    /// @notice Sell several holdings at once, in one payment.
    function sellAll(address[] calldata tokens, uint256[] calldata amounts) external nonReentrant returns (uint256 paid) {
        if (tokens.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < tokens.length; ++i) {
            uint256 v = quote(tokens[i], amounts[i]);
            _take(tokens[i], amounts[i]);
            emit Sold(msg.sender, tokens[i], amounts[i], v);
            paid += v;
        }
        _pay(msg.sender, paid);
    }

    /// @notice Put holdings together into sealed boxes; whatever is left over comes back as USDC.
    function trade(address[] calldata tokens, uint256[] calldata amounts) external nonReentrant returns (uint256 boxes) {
        if (tokens.length != amounts.length) revert LengthMismatch();
        uint256 value;
        for (uint256 i; i < tokens.length; ++i) {
            uint256 v = quote(tokens[i], amounts[i]);
            _take(tokens[i], amounts[i]);
            emit Sold(msg.sender, tokens[i], amounts[i], v);
            value += v;
        }
        uint256 price = pandock.boxPrice();
        boxes = value / price;
        if (boxes == 0) revert NotEnoughForABox();
        uint256 change = value - boxes * price;
        if (address(this).balance < value) revert DeskShort();
        pandock.buy{value: boxes * price}(boxes);
        pandock.safeTransferFrom(address(this), msg.sender, 0, boxes, "");
        emit Traded(msg.sender, boxes, change);
        if (change > 0) _pay(msg.sender, change);
    }

    /// @notice Owner: take USDC back out.
    function withdraw(address to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}

    /// Shares go straight back into the prize pool.
    function _take(address token, uint256 amount) internal {
        IERC20(token).safeTransferFrom(msg.sender, address(pandock), amount);
    }

    function _pay(address to, uint256 amount) internal {
        if (address(this).balance < amount) revert DeskShort();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
