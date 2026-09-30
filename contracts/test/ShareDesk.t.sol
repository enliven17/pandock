// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pandock, IPriceSource} from "../src/Pandock.sol";
import {MockMarket} from "../src/MockMarket.sol";
import {ShareDesk, IPandockBuy} from "../src/ShareDesk.sol";

contract ShareDeskTest is Test {
    Pandock box;
    MockMarket market;
    ShareDesk desk;
    address nvda;
    address tsla;
    address alice = makeAddr("alice");

    function setUp() public {
        box = new Pandock(0.1 ether, "");
        market = new MockMarket();
        nvda = market.list("NVDA.arc", 200e6); // $200
        tsla = market.list("TSLA.arc", 400e6); // $400
        desk = new ShareDesk(IPandockBuy(address(box)), IPriceSource(address(market)));
        vm.deal(address(desk), 10 ether);
        // alice won $0.05 of NVDA and $0.30 of TSLA
        market.mint(nvda, alice, 0.00025 ether);
        market.mint(tsla, alice, 0.00075 ether);
        vm.startPrank(alice);
        IERC20(nvda).approve(address(desk), type(uint256).max);
        IERC20(tsla).approve(address(desk), type(uint256).max);
        vm.stopPrank();
    }

    function test_quote() public view {
        assertEq(desk.quote(nvda, 0.00025 ether), 0.05 ether); // $0.05 in 18-dp USDC
    }

    function test_sell_paysAndRefillsThePool() public {
        vm.prank(alice);
        desk.sell(nvda, 0.00025 ether);
        assertEq(alice.balance, 0.05 ether);
        assertEq(IERC20(nvda).balanceOf(address(box)), 0.00025 ether);
        assertEq(IERC20(nvda).balanceOf(alice), 0);
    }

    function test_sellAll_onePayment() public {
        address[] memory t = new address[](2);
        uint256[] memory a = new uint256[](2);
        (t[0], a[0]) = (nvda, 0.00025 ether);
        (t[1], a[1]) = (tsla, 0.00075 ether);
        vm.prank(alice);
        uint256 paid = desk.sellAll(t, a);
        assertEq(paid, 0.35 ether);
        assertEq(alice.balance, 0.35 ether);
    }

    function test_trade_boxesAndChange() public {
        address[] memory t = new address[](2);
        uint256[] memory a = new uint256[](2);
        (t[0], a[0]) = (nvda, 0.00025 ether);
        (t[1], a[1]) = (tsla, 0.00075 ether);
        vm.prank(alice);
        uint256 n = desk.trade(t, a); // $0.35 → 3 boxes + $0.05
        assertEq(n, 3);
        assertEq(box.balanceOf(alice, 0), 3);
        assertEq(alice.balance, 0.05 ether);
        assertEq(IERC20(tsla).balanceOf(address(box)), 0.00075 ether);
    }

    function test_trade_needsABoxWorth() public {
        address[] memory t = new address[](1);
        uint256[] memory a = new uint256[](1);
        (t[0], a[0]) = (nvda, 0.0001 ether); // $0.02
        vm.prank(alice);
        vm.expectRevert(ShareDesk.NotEnoughForABox.selector);
        desk.trade(t, a);
    }

    function test_unlistedTokenRejected() public {
        vm.prank(alice);
        vm.expectRevert(ShareDesk.Unpriced.selector);
        desk.sell(address(box), 1); // not a priced stock
    }

    function test_deskShort() public {
        ShareDesk empty = new ShareDesk(IPandockBuy(address(box)), IPriceSource(address(market)));
        vm.startPrank(alice);
        IERC20(nvda).approve(address(empty), type(uint256).max);
        vm.expectRevert(ShareDesk.DeskShort.selector);
        empty.sell(nvda, 0.00025 ether);
        vm.stopPrank();
    }

    function test_onlyOwnerWithdraws() public {
        vm.prank(alice);
        vm.expectRevert();
        desk.withdraw(alice, 1);
    }
}
