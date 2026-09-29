import { defineChain, parseAbi } from 'viem'
import { createConfig, http } from 'wagmi'
import { getDefaultConfig } from 'connectkit'
import testnet from './deployments/arc-testnet.json'

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
const onTestnet = chain.id === arcTestnet.id
// Testnet falls back to the last `forge script … Deploy` run, which writes deployments/arc-testnet.json.
export const PANDOCK = (import.meta.env.VITE_PANDOCK_ADDRESS ?? (onTestnet ? testnet.pandock : undefined)) as
  | `0x${string}`
  | undefined

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

// ArcStocks v2 STOCK.arc tokens on Arc mainnet: all 29 verified on-chain (code, `X.arc` symbol,
// a price from the ArcStocks oracle) and 1:1 against the Robinhood Chain vault.
// `underlying` is the Robinhood Chain token, which is what the ArcStocks oracle prices.
// On testnet, the deploy's mock tokens resolve to these same entries by symbol (see stockOf).
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
  '0xe494eeb2268f20b72c954c8458ffc5b3435a9306': { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond', underlying: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5' },
  '0xe41bfe646d15b2fc6f1d37523fd61bbd384f6c0c': { symbol: 'CRCL', name: 'Circle', underlying: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5' },
  '0xc7d2fc9a7a632f587acd933c3fe0b6801a601fd9': { symbol: 'USO', name: 'United States Oil Fund', underlying: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344' },
  '0x6298af875f6651a75363cac485cbc3c81b9b32cd': { symbol: 'SPCX', name: 'SpaceX', underlying: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa' },
  '0xcb4eaa3036ec99ac895d58efaac8b732d978ca0f': { symbol: 'GLD', name: 'SPDR Gold Trust', underlying: '0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e' },
  '0xbb765782c17f57e98eab5be3e901b8971cbe95fe': { symbol: 'GME', name: 'GameStop', underlying: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E' },
  '0x799ef1973844507bb5b2d8beb66414d333814579': { symbol: 'MU', name: 'Micron Technology', underlying: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD' },
  '0xce1107f2145d3df9122a51652f4011f1f7d224d1': { symbol: 'RDDT', name: 'Reddit', underlying: '0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C' },
  '0xaee27e9861607746884bcc4df5c88a143bd64452': { symbol: 'HIMS', name: 'Hims & Hers', underlying: '0xCceE82fE024c36fA15E1005edE3E9e4787e23D09' },
  '0x09aab64aa7b69a699432abdf21b9569385643061': { symbol: 'MSTR', name: 'Strategy', underlying: '0xec262a75e413fAfD0dF80480274532C79D42da09' },
  '0x26196874b7a087c20970e00699881c6cb0ce9b4c': { symbol: 'MSFT', name: 'Microsoft', underlying: '0xe93237C50D904957Cf27E7B1133b510C669c2e74' },
  '0x0eeb5cdd376df1ac97fbb99945a2f125a1a7d346': { symbol: 'AMC', name: 'AMC Entertainment', underlying: '0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B' },
  '0xe027e24611618b069407722bdef2d90f1aab6a6e': { symbol: 'COST', name: 'Costco', underlying: '0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2' },
  '0x66f47619206278952bb40e1abcf0720924271710': { symbol: 'LLY', name: 'Eli Lilly', underlying: '0x8005d266423c7ea827372c9c864491e5786600ea' },
  '0xdf301e00c6d8fd441b9f4b20d96fd756b9b7f58d': { symbol: 'INTC', name: 'Intel', underlying: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681' },
  '0x2d1c40b034cd447aa2389a9744bbea04b57086c4': { symbol: 'DJT', name: 'Trump Media', underlying: '0x1D11f0496982706C5e14A514D4E79F2e6BdE4516' },
  '0x7b3e4dcd419371df290a8f8c95171907dc02371c': { symbol: 'DELL', name: 'Dell', underlying: '0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd' },
  '0x9d8f5b832c1ca2feb396fbc25a8ccdf58307d936': { symbol: 'AMD', name: 'AMD', underlying: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC' },
  '0x3d1ce86d34d13ba0021c6100c79498087ca03876': { symbol: 'RBLX', name: 'Roblox', underlying: '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8' },
  '0xfe8b1961301c8b479e2e61bde1e28dc9d4ce2f35': { symbol: 'SLV', name: 'iShares Silver Trust', underlying: '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f' },
  '0x5229d11bf8a4f2d6198c948cad4faba6b3e30155': { symbol: 'AVGO', name: 'Broadcom', underlying: '0x156E175DD063a8cE274C50654eF40e0032b3fbcF' },
}

// The eight the landing page features (prize cards, the box burst). The rest are still in every box table.
export const FEATURED = ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ']

/** ArcStocks price oracle on Arc mainnet: getPrice(underlying) → USD, 6 decimals. */
export const ARC_ORACLE = '0x77905f095fa62fc472e56f17bdc039dc764c1595' as const
export const oracleAbi = parseAbi(['function getPrice(address underlying) view returns (uint256)'])

// Testnet mock NVDA.arc etc. → the mainnet stock's name, logo and oracle price.
const MOCKS: Record<string, Stock> = onTestnet
  ? Object.fromEntries(
      Object.entries(testnet.stocks).flatMap(([sym, addr]) => {
        const s = Object.values(STOCKS).find((x) => `${x.symbol}.arc` === sym)
        return s ? [[addr.toLowerCase(), s]] : []
      }),
    )
  : {}

/** Tokens a box can pay out on this chain: the deploy's mocks on testnet, every STOCK.arc on mainnet. */
export const prizeTokens = () => (Object.keys(MOCKS).length ? Object.keys(MOCKS) : Object.keys(STOCKS)) as `0x${string}`[]

export const stockOf = (addr: string) =>
  MOCKS[addr.toLowerCase()] ?? STOCKS[addr.toLowerCase()] ?? { symbol: `${addr.slice(0, 6)}…`, name: 'Stock token', underlying: undefined }

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
  'function boxesSold() view returns (uint256)',
  'function nextOpeningId() view returns (uint256)',
  'function refunds() view returns (uint256)',
  'function anchors() view returns (uint256)',
  'function paidOut(address token) view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)',
])

/** The jar the Telegram bot gifts from: park boxes with a plain transfer, take them back any time. */
export const GIFT_JAR = (onTestnet ? (testnet as { giftJar?: string }).giftJar : undefined) as `0x${string}` | undefined
export const TELEGRAM_BOT = 'pandockbot'
export const X_HANDLE = 'openPandock'
export const jarAbi = parseAbi([
  'function deposits(address) view returns (uint256)',
  'function dailyLimit() view returns (uint256)',
  'function withdraw(uint256 amount)',
])
