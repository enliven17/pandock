# Pandock

Sealed boxes of tokenized stocks on Arc. Buy with USDC, gift them sealed, open for a random slice of a real stock (ArcStocks `STOCK.arc`, backed 1:1 on Robinhood Chain).

## Contracts (`contracts/`, Foundry)

```sh
git submodule update --init --recursive   # forge-std, OpenZeppelin v5.4.0
cd contracts
forge test
forge script script/Deploy.s.sol --tc Deploy --rpc-url https://rpc.testnet.arc.io --private-key $PK --broadcast
```

Testnet deploy also creates mock `NVDA.arc` / `AAPL.arc` and a prize table. Mainnet (`MAINNET=1`) deploys `Pandock` only; fund it with ArcStocks v2 tokens and call `setPrizes`.

Randomness: commit-reveal on the hash of the block after `open`, read through `blockhash` or the EIP-2935 history contract (about 69 minutes of blocks on Arc). A reveal past that window forfeits the box instead of re-rolling, so an opener can't sit on a bad draw and retry it. Arc's `PREVRANDAO` is always 0 and there is no VRF on Arc yet.

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
