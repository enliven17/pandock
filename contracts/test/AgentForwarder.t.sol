// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Pandock, IPriceSource} from "../src/Pandock.sol";
import {MockMarket} from "../src/MockMarket.sol";
import {AgentForwarder} from "../src/AgentForwarder.sol";

contract AgentForwarderTest is Test {
    Pandock box;
    MockMarket market;
    AgentForwarder fwd;
    address agent = makeAddr("circle-agent-wallet");
    address nvda;

    function setUp() public {
        box = new Pandock(0.1 ether, "");
        market = new MockMarket();
        nvda = market.list("NVDA.arc", 200e6);
        fwd = new AgentForwarder(agent, address(box), address(market));
        box.setPolicy(IPriceSource(address(market)), 7000, 8000, 1 ether);
        box.setOperator(address(fwd));
        market.setRelayer(address(fwd));
    }

    function _table(uint96 w) internal view returns (Pandock.Prize[] memory t) {
        t = new Pandock.Prize[](2);
        t[0] = Pandock.Prize(nvda, w, 0.1e6 * 1e18 / 200e6); // $0.10 of NVDA
        t[1] = Pandock.Prize(address(0), 100 - w, 0);
    }

    function test_agentRepricesThroughForwarder() public {
        vm.prank(agent);
        fwd.forward(address(box), abi.encodeCall(Pandock.operatorSetPrizes, (_table(75))));
        assertEq(box.totalWeight(), 100);
    }

    function test_agentRelaysPrices() public {
        address[] memory t = new address[](1);
        uint256[] memory p = new uint256[](1);
        (t[0], p[0]) = (nvda, 210e6);
        vm.prank(agent);
        fwd.forward(address(market), abi.encodeCall(MockMarket.setPrices, (t, p)));
        assertEq(market.priceOf(nvda), 210e6);
    }

    function test_bubblesTargetErrors() public {
        bytes memory call = abi.encodeCall(Pandock.operatorSetPrizes, (_table(95)));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Pandock.PayoutOutOfBand.selector, 9500));
        fwd.forward(address(box), call);
    }

    function test_onlyAgent() public {
        vm.expectRevert(AgentForwarder.NotAgent.selector);
        fwd.forward(address(box), "");
    }

    function test_onlyTargets() public {
        vm.prank(agent);
        vm.expectRevert(AgentForwarder.NotTarget.selector);
        fwd.forward(nvda, abi.encodeWithSignature("mint(address,uint256)", agent, 1));
    }
}
