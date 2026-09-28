// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pandock, IPriceSource} from "../src/Pandock.sol";
import {MockMarket} from "../src/MockMarket.sol";

/// The operator (Treasurer agent) runs the pool only inside the owner's policy.
contract TreasurerTest is Test {
    Pandock box;
    MockMarket market;
    address nvda;
    address op = makeAddr("operator");
    address alice = makeAddr("alice");
    uint256 constant PRICE = 0.1 ether;

    function setUp() public {
        box = new Pandock(PRICE, "");
        market = new MockMarket();
        nvda = market.list("NVDA.arc", 200e6); // $200
        box.setPolicy(IPriceSource(address(market)), 7000, 8000, 1 ether);
        box.setSink(address(market), true);
        box.setOperator(op);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        box.buy{value: 5 ether}(50);
    }

    /// One NVDA prize worth `usd6` with weight `w`, plus an empty slot with weight `100 - w`.
    function _table(uint256 usd6, uint96 w) internal view returns (Pandock.Prize[] memory t) {
        t = new Pandock.Prize[](2);
        t[0] = Pandock.Prize(nvda, w, usd6 * 1e18 / 200e6);
        t[1] = Pandock.Prize(address(0), 100 - w, 0);
    }

    function test_payoutBps() public view {
        assertEq(box.payoutBps(_table(0.1e6, 75)), 7500); // 75% chance of $0.10 on a $0.10 box
    }

    function test_operatorSetPrizes_insideBand() public {
        vm.prank(op);
        box.operatorSetPrizes(_table(0.1e6, 75));
        assertEq(box.totalWeight(), 100);
    }

    function test_operatorSetPrizes_rejectsOverpay() public {
        Pandock.Prize[] memory t = _table(0.1e6, 90);
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Pandock.PayoutOutOfBand.selector, 9000));
        box.operatorSetPrizes(t);
    }

    function test_operatorSetPrizes_rejectsUnderpay() public {
        Pandock.Prize[] memory t = _table(0.1e6, 50);
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Pandock.PayoutOutOfBand.selector, 5000));
        box.operatorSetPrizes(t);
    }

    function test_band_followsPrice() public {
        Pandock.Prize[] memory t = _table(0.1e6, 75);
        address[] memory tk = new address[](1);
        uint256[] memory px = new uint256[](1);
        (tk[0], px[0]) = (nvda, 300e6); // NVDA +50%: same shares now pay 112.5%
        market.setPrices(tk, px);
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Pandock.PayoutOutOfBand.selector, 11250));
        box.operatorSetPrizes(t);
    }

    function test_onlyOperator() public {
        Pandock.Prize[] memory t = _table(0.1e6, 75);
        vm.startPrank(alice);
        vm.expectRevert(Pandock.NotOperator.selector);
        box.operatorSetPrizes(t);
        vm.expectRevert(Pandock.NotOperator.selector);
        box.spend(address(market), 0, "");
        vm.expectRevert(Pandock.NotOperator.selector);
        box.anchor(bytes32(uint256(1)));
        vm.stopPrank();
    }

    function test_spend_restocksIntoPool() public {
        vm.prank(op);
        box.spend(address(market), 0.2 ether, abi.encodeCall(MockMarket.buy, (nvda)));
        assertEq(IERC20(nvda).balanceOf(address(box)), 0.001 ether); // $0.20 / $200
        assertEq(address(market).balance, 0.2 ether);
    }

    function test_spend_onlySinks() public {
        vm.prank(op);
        vm.expectRevert(Pandock.NotSink.selector);
        box.spend(alice, 0.1 ether, "");
    }

    function test_spend_dailyCap_resetsNextDay() public {
        bytes memory buy = abi.encodeCall(MockMarket.buy, (nvda));
        vm.startPrank(op);
        box.spend(address(market), 0.6 ether, buy);
        vm.expectRevert(Pandock.OverDailyCap.selector);
        box.spend(address(market), 0.5 ether, buy);
        vm.warp(block.timestamp + 1 days);
        box.spend(address(market), 0.5 ether, buy);
        vm.stopPrank();
    }

    function test_anchor_emits() public {
        vm.expectEmit(false, false, false, true);
        emit Pandock.Logged(bytes32(uint256(42)));
        vm.prank(op);
        box.anchor(bytes32(uint256(42)));
        assertEq(box.anchors(), 1);
    }

    function test_policy_onlyOwner() public {
        vm.startPrank(op);
        vm.expectRevert();
        box.setPolicy(IPriceSource(address(market)), 0, 10_000, 100 ether);
        vm.expectRevert();
        box.setSink(op, true);
        vm.expectRevert();
        box.setPrizes(_table(1e6, 99));
        vm.stopPrank();
    }

    function test_market_onlyRelayerPrices() public {
        address[] memory tk = new address[](1);
        uint256[] memory px = new uint256[](1);
        vm.prank(alice);
        vm.expectRevert(MockMarket.NotRelayer.selector);
        market.setPrices(tk, px);
    }
}
