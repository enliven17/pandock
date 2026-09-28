import { execFile, execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { encodeFunctionData, parseAbi } from 'viem'
import { AGENT_WALLET, CIRCLE, client, FORWARDER, MARKET, marketAbi, PANDOCK, pandockAbi, wallet } from './chain.js'
import type { Action } from './policy.js'

const forwarderAbi = parseAbi(['function forward(address target, bytes data) returns (bytes)'])
const run = promisify(execFile)
// ponytail: shells out to the Circle CLI (it holds the agent wallet session); move to the W3S API if the CLI gets in the way.
const CLI = process.env.CIRCLE_CLI ?? join(execSync('npm root -g').toString().trim(), '@circle-fin', 'cli', 'dist', 'index.js')

/** Every operator action as (target, calldata), so both signers send the same bytes. */
function encode(a: Action | { kind: 'anchor'; head: `0x${string}` }): { target: `0x${string}`; data: `0x${string}` } {
  switch (a.kind) {
    case 'relay':
      return { target: MARKET, data: encodeFunctionData({ abi: marketAbi, functionName: 'setPrices', args: [a.tokens, a.prices] }) }
    case 'reprice':
      return { target: PANDOCK, data: encodeFunctionData({ abi: pandockAbi, functionName: 'operatorSetPrizes', args: [a.table] }) }
    case 'restock':
      return { target: PANDOCK, data: encodeFunctionData({ abi: pandockAbi, functionName: 'spend', args: [MARKET, a.amount, a.data] }) }
    case 'anchor':
      return { target: PANDOCK, data: encodeFunctionData({ abi: pandockAbi, functionName: 'anchor', args: [a.head] }) }
  }
}

/** Circle agent wallet → AgentForwarder → target. Simulated first, so a policy revert costs nothing. */
async function viaCircle(target: `0x${string}`, data: `0x${string}`) {
  await client.simulateContract({ address: FORWARDER, abi: forwarderAbi, functionName: 'forward', args: [target, data], account: AGENT_WALLET! })
  const args = ['wallet', 'execute', 'forward(address,bytes)', target, data, '--contract', FORWARDER, '--address', AGENT_WALLET!]
  args.push('--chain', 'ARC-TESTNET', '--output', 'json', '--idempotency-key', randomUUID())
  let out: string
  try {
    out = (await run(process.execPath, [CLI, ...args], { maxBuffer: 1 << 20 })).stdout
  } catch (e) {
    const msg = (e as { stdout?: string }).stdout?.match(/"message":\s*"([^"]+)"/)?.[1]
    throw new Error(`circle: ${msg ?? (e instanceof Error ? e.message.split('\n')[0] : e)}`)
  }
  const tx = JSON.parse(out).data as { state: string; txHash?: `0x${string}`; id: string }
  if (tx.state !== 'COMPLETE' || !tx.txHash) throw new Error(`circle transaction ${tx.id} is ${tx.state}`)
  return tx.txHash
}

/** Local key straight to the target (dev without a Circle wallet). */
async function viaKey(target: `0x${string}`, data: `0x${string}`) {
  await client.call({ account: wallet!.account, to: target, data })
  const hash = await wallet!.sendTransaction({ to: target, data })
  const r = await client.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`reverted: ${hash}`)
  return hash
}

const send = (a: Parameters<typeof encode>[0]) => {
  const { target, data } = encode(a)
  return CIRCLE ? viaCircle(target, data) : viaKey(target, data)
}

export const act = (a: Action) => send(a)
export const anchor = (head: `0x${string}`) => send({ kind: 'anchor', head })
