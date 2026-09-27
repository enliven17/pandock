// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// USD price of a stock token, 6 decimals. MockMarket on testnet; an ArcStocks oracle adapter on mainnet.
interface IPriceSource {
    function priceOf(address token) external view returns (uint256);
}

/// @title Pandock — sealed stock boxes on Arc
/// @notice Buy sealed boxes with native USDC, gift them, open them for a random slice of a
///         tokenized stock (ArcStocks STOCK.arc ERC-20s) held by this contract.
///         The owner (a human) sets the rules; the operator (the Treasurer agent) runs the pool inside them.
contract Pandock is ERC1155, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BOX = 0;
    address internal constant BLOCK_HISTORY = 0x0000F90827F1C53a10cb7A02335B175320002935;

    /// token == address(0) is the empty outcome.
    struct Prize {
        address token;
        uint96 weight;
        uint256 amount;
    }

    struct Opening {
        address opener;
        uint64 targetBlock;
    }

    /// @notice Price per box in native USDC (18 decimals on Arc).
    uint256 public boxPrice;
    Prize[] internal _prizes;
    uint256 public totalWeight;

    mapping(uint256 => Opening) public openings;
    uint256 public nextOpeningId;

    // ---- Treasurer policy, owner-set, operator-bound
    address public operator;
    IPriceSource public priceSource;
    /// Expected payout of an operator-set table, in bps of boxPrice.
    uint16 public payoutMinBps = 7000;
    uint16 public payoutMaxBps = 8000;
    mapping(address => bool) public sinks;
    /// Native USDC the operator may send to sinks per UTC day.
    uint256 public dailyCap;
    uint256 public spentDay;
    uint256 public spentToday;

    event Bought(address indexed buyer, uint256 amount);
    event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock);
    event Expired(uint256 indexed openingId, address indexed opener);
    event Revealed(uint256 indexed openingId, address indexed opener, address token, uint256 amount);
    event Refunded(uint256 indexed openingId, address indexed opener, uint256 amount);
    event PrizesSet(uint256 count, uint256 totalWeight);
    event OperatorSet(address operator);
    event PolicySet(address priceSource, uint16 payoutMinBps, uint16 payoutMaxBps, uint256 dailyCap);
    event SinkSet(address sink, bool allowed);
    event Spent(address indexed sink, uint256 amount, bytes data);
    event Logged(bytes32 head);

    error WrongPayment();
    error ZeroAmount();
    error NotPending();
    error TooEarly();
    error NoPrizes();
    error TransferFailed();
    error NotOperator();
    error PayoutOutOfBand(uint256 payoutBps);
    error NotSink();
    error OverDailyCap();
    error BadBand();

    constructor(uint256 boxPrice_, string memory uri_) ERC1155(uri_) Ownable(msg.sender) {
        boxPrice = boxPrice_;
    }

    // ---------------------------------------------------------------- users

    function buy(uint256 amount) external payable {
        if (amount == 0) revert ZeroAmount();
        if (msg.value != amount * boxPrice) revert WrongPayment();
        _mint(msg.sender, BOX, amount, "");
        emit Bought(msg.sender, amount);
    }

    /// @notice One sealed box to each recipient, in one transaction.
    function gift(address[] calldata recipients) external {
        for (uint256 i; i < recipients.length; ++i) {
            _safeTransferFrom(msg.sender, recipients[i], BOX, 1, "");
        }
    }

    /// @notice Burn sealed boxes and commit to a future block for each.
    function open(uint256 amount) external returns (uint256 firstId) {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, BOX, amount);
        uint64 target = uint64(block.number + 1);
        firstId = nextOpeningId;
        for (uint256 i; i < amount; ++i) {
            uint256 id = firstId + i;
            openings[id] = Opening(msg.sender, target);
            emit Opened(id, msg.sender, target);
        }
        nextOpeningId = firstId + amount;
    }

    /// @notice Anyone can reveal (a keeper can do it gaslessly for the user); the prize always goes to the opener.
    // ponytail: blockhash commit-reveal — a validator could withhold a block to bias one draw.
    // Fine for 0.10 USDC boxes; swap in a VRF when one ships on Arc.
    function reveal(uint256 id) external {
        Opening memory o = openings[id];
        if (o.opener == address(0)) revert NotPending();
        if (block.number <= o.targetBlock) revert TooEarly();
        delete openings[id];

        bytes32 h = _hashOf(o.targetBlock);
        if (h == bytes32(0)) {
            // Past the 8191-block history window. Forfeit, never re-roll:
            // a re-roll would let openers sit on bad draws and retry them.
            emit Expired(id, o.opener);
            return;
        }

        Prize memory p = _draw(uint256(keccak256(abi.encode(h, id, o.opener))));
        if (p.token == address(0)) {
            emit Revealed(id, o.opener, address(0), 0);
        } else if (IERC20(p.token).balanceOf(address(this)) >= p.amount) {
            IERC20(p.token).safeTransfer(o.opener, p.amount);
            emit Revealed(id, o.opener, p.token, p.amount);
        } else {
            // ponytail: pool ran dry for this prize → refund the current box price.
            _sendNative(o.opener, boxPrice);
            emit Refunded(id, o.opener, boxPrice);
        }
    }

    // ---------------------------------------------------------------- views

    function prizes() external view returns (Prize[] memory) {
        return _prizes;
    }

    /// @notice Expected payout of a table in bps of boxPrice, priced by `priceSource`.
    function payoutBps(Prize[] calldata table) public view returns (uint256) {
        uint256 w;
        uint256 value; // sum of weight * prize value, USD 18 dp (same units as boxPrice)
        for (uint256 i; i < table.length; ++i) {
            Prize calldata p = table[i];
            w += p.weight;
            if (p.token == address(0)) continue;
            uint256 usd18 = p.amount * priceSource.priceOf(p.token) * 1e12 / 10 ** IERC20Metadata(p.token).decimals();
            value += usd18 * p.weight;
        }
        if (w == 0) revert NoPrizes();
        return value * 10_000 / w / boxPrice;
    }

    // ---------------------------------------------------------------- operator

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice The Treasurer reprices the table; it only lands if its expected payout is inside the owner's band.
    function operatorSetPrizes(Prize[] calldata table) external onlyOperator {
        uint256 bps = payoutBps(table);
        if (bps < payoutMinBps || bps > payoutMaxBps) revert PayoutOutOfBand(bps);
        _setPrizes(table);
    }

    /// @notice Send sale proceeds to an allow-listed sink (the stock market, the USYC Teller), capped per day.
    ///         Whatever the sink returns (stock tokens, refunds) comes back to this contract.
    function spend(address sink, uint256 amount, bytes calldata data) external onlyOperator returns (bytes memory) {
        if (!sinks[sink]) revert NotSink();
        uint256 day = block.timestamp / 1 days;
        if (day != spentDay) (spentDay, spentToday) = (day, 0);
        if (spentToday + amount > dailyCap) revert OverDailyCap();
        spentToday += amount;
        (bool ok, bytes memory ret) = sink.call{value: amount}(data);
        if (!ok) revert TransferFailed();
        emit Spent(sink, amount, data);
        return ret;
    }

    /// @notice Anchors the head of the Treasurer's hash-chained decision log.
    function anchor(bytes32 head) external onlyOperator {
        emit Logged(head);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Owner override, no band check (the owner sets the band).
    function setPrizes(Prize[] calldata table) external onlyOwner {
        _setPrizes(table);
    }

    function setOperator(address op) external onlyOwner {
        operator = op;
        emit OperatorSet(op);
    }

    function setPolicy(IPriceSource source, uint16 minBps, uint16 maxBps, uint256 cap) external onlyOwner {
        if (minBps > maxBps) revert BadBand();
        (priceSource, payoutMinBps, payoutMaxBps, dailyCap) = (source, minBps, maxBps, cap);
        emit PolicySet(address(source), minBps, maxBps, cap);
    }

    function setSink(address sink, bool allowed) external onlyOwner {
        sinks[sink] = allowed;
        emit SinkSet(sink, allowed);
    }

    function _setPrizes(Prize[] calldata table) internal {
        delete _prizes;
        uint256 w;
        for (uint256 i; i < table.length; ++i) {
            _prizes.push(table[i]);
            w += table[i].weight;
        }
        if (w == 0) revert NoPrizes();
        totalWeight = w;
        emit PrizesSet(table.length, w);
    }

    function setBoxPrice(uint256 price) external onlyOwner {
        boxPrice = price;
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }

    /// @notice Pull sale proceeds (native USDC) to buy STOCK.arc via the ArcStocks hub.
    function withdraw(address to, uint256 amount) external onlyOwner {
        _sendNative(to, amount);
    }

    function sweep(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Accepts native USDC refunds from the ArcStocks hub (cancelled/sold orders).
    receive() external payable {}

    // ---------------------------------------------------------------- internal

    /// blockhash covers 256 blocks; EIP-2935 history (live on Arc) extends that to 8191.
    function _hashOf(uint256 n) internal view returns (bytes32 h) {
        h = blockhash(n);
        if (h != bytes32(0)) return h;
        (bool ok, bytes memory data) = BLOCK_HISTORY.staticcall(abi.encode(n));
        if (ok && data.length == 32) h = abi.decode(data, (bytes32));
    }

    function _draw(uint256 rand) internal view returns (Prize memory) {
        if (totalWeight == 0) revert NoPrizes();
        uint256 r = rand % totalWeight;
        for (uint256 i; i < _prizes.length; ++i) {
            if (r < _prizes[i].weight) return _prizes[i];
            r -= _prizes[i].weight;
        }
        revert NoPrizes(); // unreachable
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
