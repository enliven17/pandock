// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pandock} from "../src/Pandock.sol";

/// Testnet stand-in for an ArcStocks STOCK.arc token.
contract MockStock is ERC20 {
    constructor(string memory s, uint256 supply) ERC20(s, s) {
        _mint(msg.sender, supply);
    }
}

/// forge script script/Deploy.s.sol --tc Deploy --rpc-url https://rpc.testnet.arc.io --private-key $PK --broadcast
/// Set MAINNET=1 to deploy Pandock only; fund it with STOCK.arc and call setPrizes separately.
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        Pandock box = new Pandock(0.1 ether, ""); // 0.10 USDC (native, 18 dp)
        console.log("Pandock", address(box));

        if (!vm.envOr("MAINNET", false)) {
            MockStock nvda = new MockStock("NVDA.arc", 1 ether);
            MockStock aapl = new MockStock("AAPL.arc", 1 ether);
            nvda.transfer(address(box), 1 ether);
            aapl.transfer(address(box), 1 ether);
            console.log("NVDA.arc", address(nvda));
            console.log("AAPL.arc", address(aapl));

            // ~75% expected payout at NVDA ~$226, AAPL ~$337
            Pandock.Prize[] memory t = new Pandock.Prize[](4);
            t[0] = Pandock.Prize(address(nvda), 50, 0.0002 ether); // ~$0.045
            t[1] = Pandock.Prize(address(aapl), 30, 0.0003 ether); // ~$0.10
            t[2] = Pandock.Prize(address(nvda), 5, 0.0044 ether); //  ~$1.00
            t[3] = Pandock.Prize(address(0), 15, 0);
            box.setPrizes(t);
        }
        vm.stopBroadcast();
    }
}
