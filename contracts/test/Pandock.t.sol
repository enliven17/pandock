// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pandock} from "../src/Pandock.sol";

contract MockStock is ERC20 {
    constructor() ERC20("NVDA.arc", "NVDA.arc") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }
}

/// Stand-in for the EIP-2935 history contract: any block number → a non-zero hash.
contract MockHistory {
    fallback(bytes calldata data) external returns (bytes memory) {
        return abi.encode(keccak256(data));
    }
}

contract PandockTest is Test {
    Pandock box;
    MockStock nvda;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant PRICE = 0.1 ether; // 0.10 USDC (native, 18 dp)

    function setUp() public {
        box = new Pandock(PRICE, "");
        nvda = new MockStock();
        nvda.mint(address(box), 1 ether);
        Pandock.Prize[] memory t = new Pandock.Prize[](2);
        t[0] = Pandock.Prize(address(nvda), 3, 0.0004 ether);
        t[1] = Pandock.Prize(address(0), 1, 0);
        box.setPrizes(t);
        vm.deal(alice, 10 ether);
    }

    function _buy(address who, uint256 n) internal {
        vm.prank(who);
        box.buy{value: n * PRICE}(n);
    }

    function test_buy() public {
        _buy(alice, 3);
        assertEq(box.balanceOf(alice, 0), 3);
        assertEq(address(box).balance, 3 * PRICE);
    }

    function test_buy_wrongPayment() public {
        vm.prank(alice);
        vm.expectRevert(Pandock.WrongPayment.selector);
        box.buy{value: PRICE}(2);
    }

    function test_gift() public {
        _buy(alice, 2);
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = makeAddr("carol");
        vm.prank(alice);
        box.gift(to);
        assertEq(box.balanceOf(alice, 0), 0);
        assertEq(box.balanceOf(bob, 0), 1);
    }

    function test_openReveal_paysOpenerOnly() public {
        _buy(alice, 1);
        vm.prank(alice);
        uint256 id = box.open(1);
        assertEq(box.balanceOf(alice, 0), 0);

        vm.expectRevert(Pandock.TooEarly.selector);
        box.reveal(id);

        vm.roll(block.number + 2);
        vm.prank(bob); // anyone may reveal
        box.reveal(id);

        (address opener,) = box.openings(id);
        assertEq(opener, address(0));
        uint256 won = nvda.balanceOf(alice);
        assertTrue(won == 0 || won == 0.0004 ether);
        assertEq(nvda.balanceOf(bob), 0);

        vm.expectRevert(Pandock.NotPending.selector);
        box.reveal(id);
    }

    function _onlyNvdaTable() internal {
        Pandock.Prize[] memory t = new Pandock.Prize[](1);
        t[0] = Pandock.Prize(address(nvda), 1, 0.0004 ether); // every draw wins
        box.setPrizes(t);
    }

    function test_expired_forfeitsInsteadOfReroll() public {
        _onlyNvdaTable();
        _buy(alice, 1);
        vm.prank(alice);
        uint256 id = box.open(1);
        vm.roll(block.number + 300); // blockhash gone, no history contract in this env
        vm.expectEmit(true, true, false, false);
        emit Pandock.Expired(id, alice);
        box.reveal(id);
        assertEq(nvda.balanceOf(alice), 0);
        vm.expectRevert(Pandock.NotPending.selector); // cannot retry
        box.reveal(id);
    }

    function test_historyContract_extendsWindow() public {
        vm.etch(0x0000F90827F1C53a10cb7A02335B175320002935, address(new MockHistory()).code);
        _onlyNvdaTable();
        _buy(alice, 1);
        vm.prank(alice);
        uint256 id = box.open(1);
        vm.roll(block.number + 300);
        box.reveal(id);
        assertEq(nvda.balanceOf(alice), 0.0004 ether);
    }

    function test_refund_whenPoolDry() public {
        Pandock.Prize[] memory t = new Pandock.Prize[](1);
        t[0] = Pandock.Prize(address(nvda), 1, 100 ether); // more than the pool holds
        box.setPrizes(t);
        _buy(alice, 1);
        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 id = box.open(1);
        vm.roll(block.number + 2);
        box.reveal(id);
        assertEq(alice.balance, before + PRICE);
    }

    function test_distribution_roughlyMatchesWeights() public {
        uint256 n = 200;
        vm.deal(alice, n * PRICE);
        _buy(alice, n);
        vm.prank(alice);
        uint256 first = box.open(n);
        vm.roll(block.number + 2);
        for (uint256 i; i < n; ++i) {
            box.reveal(first + i);
        }
        uint256 wins = nvda.balanceOf(alice) / 0.0004 ether;
        // expected 150 (3/4); all openings share one blockhash but id salts each draw
        assertGt(wins, 120);
        assertLt(wins, 180);
    }

    function test_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        box.withdraw(alice, 1);
    }
}
