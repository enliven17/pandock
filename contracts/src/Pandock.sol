// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Pandock — sealed stock boxes on Arc
/// @notice Buy sealed boxes with native USDC, gift them, open them for a random slice of a
///         tokenized stock (ArcStocks STOCK.arc ERC-20s) held by this contract.
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

    event Bought(address indexed buyer, uint256 amount);
    event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock);
    event Expired(uint256 indexed openingId, address indexed opener);
    event Revealed(uint256 indexed openingId, address indexed opener, address token, uint256 amount);
    event Refunded(uint256 indexed openingId, address indexed opener, uint256 amount);
    event PrizesSet(uint256 count, uint256 totalWeight);

    error WrongPayment();
    error ZeroAmount();
    error NotPending();
    error TooEarly();
    error NoPrizes();
    error TransferFailed();

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

    // ---------------------------------------------------------------- owner

    /// @notice The keeper resets the table on each hourly refill, computing amounts from live prices.
    function setPrizes(Prize[] calldata table) external onlyOwner {
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
