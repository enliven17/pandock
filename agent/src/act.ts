import { client, MARKET, marketAbi, PANDOCK, pandockAbi, wallet } from './chain.js'
import type { Action } from './policy.js'

/** Simulate first (a policy revert is caught here, not on-chain), then send and wait. */
async function send(req: Parameters<typeof client.simulateContract>[0]) {
  const { request } = await client.simulateContract({ ...req, account: wallet.account })
  const hash = await wallet.writeContract(request)
  const r = await client.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`reverted: ${hash}`)
  return hash
}

export function act(a: Action) {
  switch (a.kind) {
    case 'relay':
      return send({ address: MARKET, abi: marketAbi, functionName: 'setPrices', args: [a.tokens, a.prices] })
    case 'reprice':
      return send({ address: PANDOCK, abi: pandockAbi, functionName: 'operatorSetPrizes', args: [a.table] })
    case 'restock':
      return send({ address: PANDOCK, abi: pandockAbi, functionName: 'spend', args: [MARKET, a.amount, a.data] })
  }
}

export const anchor = (head: `0x${string}`) => send({ address: PANDOCK, abi: pandockAbi, functionName: 'anchor', args: [head] })
