// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceSource} from "./Pandock.sol";

/// Testnet stand-in for an ArcStocks STOCK.arc token; only its market can mint.
contract MockStock is ERC20, Ownable {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/// Arc Testnet has no ArcStocks. This sells mock STOCK.arc tokens for native USDC at prices a relayer
/// copies from the ArcStocks oracle on mainnet, and doubles as Pandock's price source on testnet.
contract MockMarket is IPriceSource, Ownable {
    /// token => USD price, 6 decimals (same scale as the ArcStocks oracle).
    mapping(address => uint256) public priceOf;
    address public relayer;

    event Listed(address indexed token, string symbol);
    event PriceSet(address indexed token, uint256 price);
    event Bought(address indexed buyer, address indexed token, uint256 paid, uint256 amount);

    error NotRelayer();
    error Unpriced();

    constructor() Ownable(msg.sender) {
        relayer = msg.sender;
    }

    function list(string calldata symbol, uint256 price) external onlyOwner returns (address token) {
        token = address(new MockStock(symbol));
        priceOf[token] = price;
        emit Listed(token, symbol);
        emit PriceSet(token, price);
    }

    function setRelayer(address r) external onlyOwner {
        relayer = r;
    }

    function setPrices(address[] calldata tokens, uint256[] calldata prices) external {
        if (msg.sender != relayer && msg.sender != owner()) revert NotRelayer();
        for (uint256 i; i < tokens.length; ++i) {
            priceOf[tokens[i]] = prices[i];
            emit PriceSet(tokens[i], prices[i]);
        }
    }

    /// @notice Pay native USDC (18 dp), receive `token` at the relayed price. Proceeds stay here (it's a mock).
    function buy(address token) external payable returns (uint256 amount) {
        uint256 p = priceOf[token];
        if (p == 0) revert Unpriced();
        amount = msg.value * 1e6 / p; // USDC 18 dp → stock 18 dp
        MockStock(token).mint(msg.sender, amount);
        emit Bought(msg.sender, token, msg.value, amount);
    }

    /// @notice Testnet seeding: mint without paying.
    function mint(address token, address to, uint256 amount) external onlyOwner {
        MockStock(token).mint(to, amount);
    }
}
