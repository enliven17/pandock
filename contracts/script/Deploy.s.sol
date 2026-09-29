// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Pandock, IPriceSource} from "../src/Pandock.sol";
import {MockMarket} from "../src/MockMarket.sol";
import {AgentForwarder} from "../src/AgentForwarder.sol";
import {GiftJar} from "../src/GiftJar.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IArcOracle {
    function getPrice(address underlying) external view returns (uint256);
}

/// Reads live prices for the featured stocks from the ArcStocks oracle on Arc mainnet.
abstract contract MainnetPrices is Script {
    IArcOracle constant ORACLE = IArcOracle(0x77905f095FA62FC472e56f17BDC039DC764C1595);
    string constant MAINNET_RPC = "https://rpc.mainnet.arc.io";

    // Same eight as FEATURED in web/src/config.ts; `underlying` is the Robinhood Chain token the oracle prices.
    function stocks() internal pure returns (string[8] memory s, address[8] memory u) {
        s = ["NVDA.arc", "TSLA.arc", "AAPL.arc", "AMZN.arc", "META.arc", "GOOGL.arc", "SPY.arc", "QQQ.arc"];
        u = [
            0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,
            0x322F0929c4625eD5bAd873c95208D54E1c003b2d,
            0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,
            0x12f190a9F9d7D37a250758b26824B97CE941bF54,
            0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35,
            0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3,
            0x117cc2133c37B721F49dE2A7a74833232B3B4C0C,
            0xD5f3879160bc7c32ebb4dC785F8a4F505888de68
        ];
    }

    function livePrices() internal returns (uint256[8] memory p) {
        (, address[8] memory u) = stocks();
        uint256 home = vm.activeFork();
        vm.createSelectFork(MAINNET_RPC);
        for (uint256 i; i < 8; ++i) {
            p[i] = ORACLE.getPrice(u[i]);
            require(p[i] > 0, "no oracle price");
        }
        vm.selectFork(home);
    }
}

/// forge script script/Deploy.s.sol --tc Deploy --rpc-url https://rpc.testnet.arc.io --private-key $PK --broadcast
/// Set MAINNET=1 to deploy Pandock only; fund it with STOCK.arc and call setPolicy / setPrizes separately.
/// OPERATOR=0x… sets the Treasurer agent's address (defaults to the deployer).
/// AGENT_WALLET=0x… (a Circle agent wallet) instead deploys an AgentForwarder for it and makes that the operator,
/// plus the GiftJar the Telegram bot gifts from (the wallet is its operator; 5 boxes per sender per day).
contract Deploy is MainnetPrices {
    // Prize tiers in USD (6 dp) and weights per stock, out of 1000 draws: 8 × (80 + 12 + 1) = 744 wins, 256 empty.
    // Expected payout 8 × (80×0.05 + 12×0.30 + 1×2.00) / 1000 = $0.0768 on a $0.10 box = 76.8%.
    uint256[3] TIER_USD = [uint256(50_000), 300_000, 2_000_000];
    uint96[3] TIER_WEIGHT = [uint96(80), 12, 1];
    uint96 constant EMPTY_WEIGHT = 256;
    uint256 constant POOL_USD = 500e6; // seed each stock's pool with $500 of mock shares
    address giftJar; // storage, not a local: run() is at the stack limit

    function run() external {
        bool mainnet = vm.envOr("MAINNET", false);
        uint256[8] memory px;
        if (!mainnet) px = livePrices();

        vm.startBroadcast();
        address operator = vm.envOr("OPERATOR", msg.sender);
        address agentWallet = vm.envOr("AGENT_WALLET", address(0));
        Pandock box = new Pandock(0.1 ether, ""); // 0.10 USDC (native, 18 dp)
        console.log("Pandock", address(box));
        if (mainnet) return vm.stopBroadcast();

        MockMarket market = new MockMarket();
        console.log("MockMarket", address(market));
        if (agentWallet != address(0)) {
            operator = address(new AgentForwarder(agentWallet, address(box), address(market)));
            console.log("AgentForwarder", operator);
            giftJar = address(new GiftJar(IERC1155(address(box)), agentWallet, 5));
            console.log("GiftJar", giftJar);
        }
        (string[8] memory sym,) = stocks();
        address[8] memory tok;
        Pandock.Prize[] memory t = new Pandock.Prize[](25);
        for (uint256 i; i < 8; ++i) {
            tok[i] = market.list(sym[i], px[i]);
            market.mint(tok[i], address(box), POOL_USD * 1e18 / px[i]);
            // tier-major, so the site's first eight rows are eight different stocks
            for (uint256 k; k < 3; ++k) {
                t[k * 8 + i] = Pandock.Prize(tok[i], TIER_WEIGHT[k], TIER_USD[k] * 1e18 / px[i]);
            }
            console.log(sym[i], tok[i], px[i]);
        }
        t[24] = Pandock.Prize(address(0), EMPTY_WEIGHT, 0);

        box.setPolicy(IPriceSource(address(market)), 7000, 8000, 50 ether); // 70–80% band, 50 USDC/day to sinks
        box.setSink(address(market), true);
        box.setOperator(operator);
        box.setPrizes(t);
        market.setRelayer(operator);
        vm.stopBroadcast();

        console.log("payout bps", box.payoutBps(t));
        _write(address(box), address(market), operator, agentWallet, sym, tok);
    }

    function _write(
        address box,
        address market,
        address operator,
        address agentWallet,
        string[8] memory sym,
        address[8] memory tok
    ) internal {
        string memory s = "stocks";
        string memory stocksJson;
        for (uint256 i; i < 8; ++i) {
            stocksJson = vm.serializeAddress(s, sym[i], tok[i]);
        }
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "pandock", box);
        vm.serializeAddress(o, "market", market);
        vm.serializeAddress(o, "operator", operator);
        vm.serializeAddress(o, "agentWallet", agentWallet);
        if (giftJar != address(0)) vm.serializeAddress(o, "giftJar", giftJar);
        string memory json = vm.serializeString(o, "stocks", stocksJson);
        vm.writeJson(json, "../web/src/deployments/arc-testnet.json");
    }
}

/// Copies live mainnet oracle prices onto the testnet MockMarket (the Treasurer does this each cycle;
/// run by hand until it exists) with the relayer's key.
contract Relay is MainnetPrices {
    function run() external {
        string memory json = vm.readFile("../web/src/deployments/arc-testnet.json");
        MockMarket market = MockMarket(vm.parseJsonAddress(json, ".market"));
        (string[8] memory sym,) = stocks();
        uint256[8] memory px = livePrices();
        address[] memory tok = new address[](8);
        uint256[] memory p = new uint256[](8);
        for (uint256 i; i < 8; ++i) {
            tok[i] = vm.parseJsonAddress(json, string.concat(".stocks.", sym[i]));
            p[i] = px[i];
        }
        vm.broadcast();
        market.setPrices(tok, p);
    }
}
