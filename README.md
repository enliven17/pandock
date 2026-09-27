# Pandock

Sealed boxes of tokenized stocks on Arc. Buy with USDC, gift them sealed, open for a random slice of a real stock (ArcStocks `STOCK.arc`, backed 1:1 on Robinhood Chain).

## Contracts (`contracts/`, Foundry)

```sh
git submodule update --init --recursive   # forge-std, OpenZeppelin v5.4.0
cd contracts
forge test
source .env   # PRIVATE_KEY (git-ignored)
forge script script/Deploy.s.sol --tc Deploy --rpc-url https://rpc.testnet.arc.io --private-key $PRIVATE_KEY --broadcast
forge script script/Deploy.s.sol --tc Relay  --rpc-url https://rpc.testnet.arc.io --private-key $PRIVATE_KEY --broadcast  # refresh mock prices
```

Arc Testnet has no ArcStocks, so the testnet deploy also creates a `MockMarket` that lists mock `NVDA.arc` … `QQQ.arc` (the eight featured stocks) at live prices read from the ArcStocks oracle on mainnet, seeds the pool with $500 of each, and sets a 25-row prize table (76.8% expected payout). Addresses go to `web/src/deployments/arc-testnet.json`, which the site reads. Mainnet (`MAINNET=1`) deploys `Pandock` only; fund it with ArcStocks v2 tokens and call `setPolicy` / `setPrizes`.

Roles: the **owner** sets the rules (`setPolicy`: price source, 70–80% payout band, daily spend cap; `setSink`; `setOperator`). The **operator** (the Treasurer agent, `docs/agent.md`) runs the pool inside them: `operatorSetPrizes` reverts outside the band, `spend` only reaches allow-listed sinks (the market) under the daily cap, and `anchor(head)` emits `Logged` for its decision log. `OPERATOR=0x…` at deploy sets it (default: the deployer).

Randomness: commit-reveal on the hash of the block after `open`, read through `blockhash` or the EIP-2935 history contract (about 69 minutes of blocks on Arc). A reveal past that window forfeits the box instead of re-rolling, so an opener can't sit on a bad draw and retry it. Arc's `PREVRANDAO` is always 0 and there is no VRF on Arc yet.

## Treasurer agent (`agent/`, Node + viem)

Runs the pool as the contract's operator (design: `docs/agent.md`). Every cycle it observes the pool, prices and open liabilities, cross-checks the ArcStocks oracle against CoinMarketCap, then relays prices to the testnet market, reprices drifted tiers and restocks low pools from surplus sale proceeds. Restocks above the soft threshold wait for a human. Each cycle is appended to a hash-chained log (`agent/log/decisions.jsonl`) and its head is anchored on-chain with `anchor`.

```sh
cd agent
npm install
# .env: PRIVATE_KEY=0x… (the operator key), CMC_API_KEY=… (without it nothing is confirmed and no money moves)
npm start            # every 15 min (CYCLE_MINUTES); `npm run once` for a single cycle
npm run approve      # list escalations; `npm run approve 3` / `npm run approve 3 reject`
```

Knobs (env): `CROSS_CHECK_BPS` 200, `RELAY_BPS` 50, `REPRICE_DRIFT_BPS` 300, `POOL_LOW_USD` 60, `POOL_TARGET_USD` 100, `RESERVE_USD` 0.5, `SOFT_RESTOCK_USD` 5.

## Web (`web/`, Vite + React + wagmi + ConnectKit)

```sh
cd web
npm install --legacy-peer-deps   # ConnectKit 1.9 lists React 18 as its peer; it runs on React 19
cat > .env.local <<EOF
VITE_PANDOCK_ADDRESS=0x...
VITE_WALLETCONNECT_PROJECT_ID=...   # optional: enables WalletConnect in the ConnectKit modal
# VITE_CHAIN=mainnet                # default is Arc Testnet
EOF
npm run dev
```

Stock prices come from the ArcStocks oracle on Arc mainnet, read in the browser. Design follows `DESIGN.md` (Apple).
