// End-to-end smoke run on testnet: fresh wallets, funded from PRIVATE_KEY, each buys, opens and reveals boxes.
//   npm run smoke -- [wallets=5] [boxesEach=2]
// Keys land in log/smoke-wallets.json (gitignored) so leftovers can be swept back.
import { appendFileSync, mkdirSync } from 'node:fs'
import { createWalletClient, formatEther, http, parseAbi, parseEther, parseEventLogs } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, client, PANDOCK, wallet } from './chain.js'

const abi = parseAbi([
  'function boxPrice() view returns (uint256)',
  'function buy(uint256 amount) payable',
  'function open(uint256 amount) returns (uint256 firstId)',
  'function reveal(uint256 id)',
  'event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock)',
  'event Revealed(uint256 indexed openingId, address indexed opener, address token, uint256 amount)',
  'event Refunded(uint256 indexed openingId, address indexed opener, uint256 amount)',
])
const GAS = parseEther('0.05') // per wallet: buy + open + reveals

const [wallets = 5, boxes = 2] = process.argv.slice(2).map(Number)
if (!wallet) throw new Error('smoke needs PRIVATE_KEY (the funding wallet)')
if (!(wallets > 0 && boxes > 0 && wallets * boxes <= 50)) throw new Error('usage: smoke [wallets] [boxesEach], ≤50 boxes total')

const price = await client.readContract({ address: PANDOCK, abi, functionName: 'boxPrice' })
const each = price * BigInt(boxes) + GAS
const have = await client.getBalance({ address: wallet.account.address })
if (have < each * BigInt(wallets)) throw new Error(`funder has ${formatEther(have)} USDC, needs ${formatEther(each * BigInt(wallets))}`)

mkdirSync('log', { recursive: true })
const wait = (hash: `0x${string}`) => client.waitForTransactionReceipt({ hash })

for (let i = 0; i < wallets; i++) {
  const key = generatePrivateKey()
  const me = createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport: http() })
  const addr = me.account.address
  appendFileSync('log/smoke-wallets.json', JSON.stringify({ address: addr, key }) + '\n')

  await wait(await wallet.sendTransaction({ to: addr, value: each }))
  await wait(await me.writeContract({ address: PANDOCK, abi, functionName: 'buy', args: [BigInt(boxes)], value: price * BigInt(boxes) }))
  const opened = await wait(await me.writeContract({ address: PANDOCK, abi, functionName: 'open', args: [BigInt(boxes)] }))
  const ids = parseEventLogs({ abi, logs: opened.logs, eventName: 'Opened' })
  const target = ids[0].args.targetBlock
  while ((await client.getBlockNumber()) <= target) await new Promise((r) => setTimeout(r, 1000))

  for (const { args } of ids) {
    const r = await wait(await me.writeContract({ address: PANDOCK, abi, functionName: 'reveal', args: [args.openingId] }))
    const [ev] = parseEventLogs({ abi, logs: r.logs })
    const what = ev?.eventName === 'Revealed' ? (ev.args.amount ? `${ev.args.token} ×${ev.args.amount}` : 'empty') : ev?.eventName ?? '?'
    console.log(`${addr} box #${args.openingId}: ${what}`)
  }
}
console.log(`done: ${wallets} wallets × ${boxes} boxes`)
