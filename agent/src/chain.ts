import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import deployment from '../../web/src/deployments/arc-testnet.json' with { type: 'json' }

const usdc = { name: 'USDC', symbol: 'USDC', decimals: 18 } as const
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: usdc,
  rpcUrls: { default: { http: [process.env.RPC_URL ?? 'https://rpc.testnet.arc.io'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})
const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: usdc,
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

const key = process.env.PRIVATE_KEY as `0x${string}` | undefined
if (!key) throw new Error('PRIVATE_KEY is not set (agent/.env)')
export const account = privateKeyToAccount(key)
export const client = createPublicClient({ chain: arcTestnet, transport: http() })
export const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() })
export const mainnet = createPublicClient({ chain: arcMainnet, transport: http() })

export const PANDOCK = deployment.pandock as `0x${string}`
export const MARKET = deployment.market as `0x${string}`
/** symbol (NVDA) → testnet mock token */
export const STOCKS = Object.fromEntries(
  Object.entries(deployment.stocks).map(([s, a]) => [s.replace('.arc', ''), a as `0x${string}`]),
)

// The Robinhood Chain tokens the ArcStocks oracle prices (same as web/src/config.ts).
export const UNDERLYING: Record<string, `0x${string}`> = {
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  AMZN: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  META: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35',
  GOOGL: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
  SPY: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
  QQQ: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68',
}
export const ARC_ORACLE = '0x77905f095FA62FC472e56f17BDC039DC764C1595' as const

export const oracleAbi = parseAbi(['function getPrice(address underlying) view returns (uint256)'])
export const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)'])
export const marketAbi = parseAbi([
  'function priceOf(address token) view returns (uint256)',
  'function setPrices(address[] tokens, uint256[] prices)',
  'function buy(address token) payable returns (uint256)',
])
export const pandockAbi = parseAbi([
  'struct Prize { address token; uint96 weight; uint256 amount; }',
  'function boxPrice() view returns (uint256)',
  'function prizes() view returns (Prize[])',
  'function nextOpeningId() view returns (uint256)',
  'function openings(uint256) view returns (address opener, uint64 targetBlock)',
  'function payoutMinBps() view returns (uint16)',
  'function payoutMaxBps() view returns (uint16)',
  'function dailyCap() view returns (uint256)',
  'function spentDay() view returns (uint256)',
  'function spentToday() view returns (uint256)',
  'function payoutBps(Prize[] table) view returns (uint256)',
  'function operatorSetPrizes(Prize[] table)',
  'function spend(address sink, uint256 amount, bytes data) returns (bytes)',
  'function anchor(bytes32 head)',
  'event Bought(address indexed buyer, uint256 amount)',
  'event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock)',
])
