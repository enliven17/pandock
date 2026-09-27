import { defineChain, parseAbi } from 'viem'
import { createConfig, http } from 'wagmi'
import { getDefaultConfig } from 'connectkit'

const usdc = { name: 'USDC', symbol: 'USDC', decimals: 18 } as const

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: usdc,
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: usdc,
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

export const chain = import.meta.env.VITE_CHAIN === 'mainnet' ? arcMainnet : arcTestnet
export const PANDOCK = import.meta.env.VITE_PANDOCK_ADDRESS as `0x${string}` | undefined

// ConnectKit (Family) wires up injected wallets, Coinbase Wallet and, with a project id, WalletConnect.
export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [chain],
    transports: { [arcTestnet.id]: http(), [arcMainnet.id]: http() },
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'Pandock',
    appDescription: 'Sealed boxes of tokenized stocks on Arc',
    appUrl: window.location.origin,
    appIcon: '/pandock-logo.svg',
    // Off: it adds a "Continue with Aave" account button, and its SDK throws when not set up.
    enableAaveAccount: false,
    // Coinbase Wallet SDK otherwise injects an analytics script on load (and logs an error when it can't).
    coinbaseWalletPreference: { options: 'all', telemetry: false },
  }),
)

// ArcStocks v2 STOCK.arc tokens on Arc mainnet (verified 1:1 against the Robinhood Chain vault).
// `underlying` is the Robinhood Chain token, which is what the ArcStocks oracle prices.
// On testnet, add your mock token addresses here.
type Stock = { symbol: string; name: string; underlying: `0x${string}` }
export const STOCKS: Record<string, Stock> = {
  '0x0a2dd7160de0c452ed4642d498162550fe2165f2': { symbol: 'NVDA', name: 'NVIDIA', underlying: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' },
  '0x349dcb3a576813ffbab4b88547a0d694eb20eb18': { symbol: 'TSLA', name: 'Tesla', underlying: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' },
  '0xdc79a6e977eb1668b6bff7ac788053305fff13c9': { symbol: 'AAPL', name: 'Apple', underlying: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
  '0x468b1d1f51c8ec186172c2386a0bed6bcf99add8': { symbol: 'AMZN', name: 'Amazon', underlying: '0x12f190a9F9d7D37a250758b26824B97CE941bF54' },
  '0xeb88c032788bc9adc4671c10c19b95f9b93a2e37': { symbol: 'META', name: 'Meta', underlying: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35' },
  '0x5606e025c05dd41ea485b19490632e09f3ec03b8': { symbol: 'GOOGL', name: 'Alphabet', underlying: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3' },
  '0x8645eb2ef4d5a7c46212eb7688547442126c7b48': { symbol: 'SPY', name: 'S&P 500 ETF', underlying: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C' },
  '0xc2017f980b6b3f1d149541cf692c1971e53383d4': { symbol: 'QQQ', name: 'Nasdaq 100 ETF', underlying: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68' },
}

/** ArcStocks price oracle on Arc mainnet: getPrice(underlying) → USD, 6 decimals. */
export const ARC_ORACLE = '0x77905f095fa62fc472e56f17bdc039dc764c1595' as const
export const oracleAbi = parseAbi(['function getPrice(address underlying) view returns (uint256)'])

export const stockOf = (addr: string) =>
  STOCKS[addr.toLowerCase()] ?? { symbol: `${addr.slice(0, 6)}…`, name: 'Stock token', underlying: undefined }

export const pandockAbi = parseAbi([
  'function boxPrice() view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function totalWeight() view returns (uint256)',
  'function prizes() view returns ((address token, uint96 weight, uint256 amount)[])',
  'function buy(uint256 amount) payable',
  'function gift(address[] recipients)',
  'function open(uint256 amount) returns (uint256 firstId)',
  'function reveal(uint256 id)',
  'event Bought(address indexed buyer, uint256 amount)',
  'event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock)',
  'event Expired(uint256 indexed openingId, address indexed opener)',
  'event Revealed(uint256 indexed openingId, address indexed opener, address token, uint256 amount)',
  'event Refunded(uint256 indexed openingId, address indexed opener, uint256 amount)',
])
