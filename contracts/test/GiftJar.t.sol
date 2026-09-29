// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Pandock} from "../src/Pandock.sol";
import {GiftJar} from "../src/GiftJar.sol";

contract GiftJarTest is Test {
    Pandock box;
    GiftJar jar;
    address bot = makeAddr("listener");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 carol = keccak256("tg:42");

    function setUp() public {
        box = new Pandock(0.1 ether, "");
        jar = new GiftJar(IERC1155(address(box)), bot, 3);
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        box.buy{value: 0.5 ether}(5);
        box.safeTransferFrom(alice, address(jar), 0, 4, ""); // park 4
        vm.stopPrank();
    }

    function test_parkCreditsSender() public view {
        assertEq(jar.deposits(alice), 4);
        assertEq(box.balanceOf(address(jar), 0), 4);
    }

    function test_giftToLinkedFriend() public {
        vm.prank(bot);
        jar.gift(alice, bob, 2, 1001);
        assertEq(box.balanceOf(bob, 0), 2);
        assertEq(jar.deposits(alice), 2);
    }

    function test_tweetOrMessageOnlyOnce() public {
        vm.startPrank(bot);
        jar.gift(alice, bob, 1, 7);
        vm.expectRevert(GiftJar.AlreadyHandled.selector);
        jar.gift(alice, bob, 1, 7);
        vm.stopPrank();
    }

    function test_dailyLimit_resetsNextDay() public {
        vm.startPrank(bot);
        jar.gift(alice, bob, 3, 1);
        vm.expectRevert(GiftJar.OverDailyLimit.selector);
        jar.gift(alice, bob, 1, 2);
        vm.warp(block.timestamp + 1 days);
        jar.gift(alice, bob, 1, 3);
        vm.stopPrank();
        assertEq(box.balanceOf(bob, 0), 4);
    }

    function test_onlyWhatWasParked() public {
        vm.prank(bot);
        vm.expectRevert(GiftJar.NotEnough.selector);
        jar.gift(bob, alice, 1, 9); // bob parked nothing
    }

    function test_holdThenClaim() public {
        vm.startPrank(bot);
        jar.hold(alice, carol, 2, 11);
        assertEq(jar.held(carol), 2);
        jar.claim(carol, bob);
        vm.expectRevert(GiftJar.NothingHeld.selector);
        jar.claim(carol, bob);
        vm.stopPrank();
        assertEq(box.balanceOf(bob, 0), 2);
    }

    function test_withdrawAnyTime() public {
        vm.prank(alice);
        jar.withdraw(4);
        assertEq(box.balanceOf(alice, 0), 5);
        vm.prank(alice);
        vm.expectRevert(GiftJar.NotEnough.selector);
        jar.withdraw(1);
    }

    function test_onlyOperator() public {
        vm.startPrank(alice);
        vm.expectRevert(GiftJar.NotOperator.selector);
        jar.gift(alice, bob, 1, 1);
        vm.expectRevert(GiftJar.NotOperator.selector);
        jar.hold(alice, carol, 1, 1);
        vm.expectRevert(GiftJar.NotOperator.selector);
        jar.claim(carol, bob);
        vm.stopPrank();
    }

    function test_rejectsOtherTokens() public {
        vm.expectRevert(GiftJar.NotBox.selector);
        jar.onERC1155Received(address(this), alice, 0, 1, ""); // not from Pandock
    }
}
