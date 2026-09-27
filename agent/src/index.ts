import { account, STOCKS } from './chain.js'
import { act, anchor } from './act.js'
import { cmcPrices } from './cmc.js'
import { escalate, readQueue, record, writeQueue } from './log.js'
import { observe, usd6 } from './observe.js'
import { confirmed, describe, needsHuman, plan, type Action } from './policy.js'

const MINUTES = Number(process.env.CYCLE_MINUTES ?? 15)

/** Approved escalations, revived from the queue's JSON. */
function approved(): { id: number; action: Action }[] {
  return readQueue()
    .filter((e) => e.status === 'approved')
    .map((e) => {
      const a = e.action as Action & { amount?: string; prices?: string[] }
      if (a.kind === 'restock') return { id: e.id, action: { ...a, amount: BigInt(a.amount!) } }
      return { id: e.id, action: a }
    })
}

async function cycle() {
  const s = await observe()
  const { ok, notes } = confirmed(s, await cmcPrices(Object.keys(STOCKS)))
  const planned = plan(s, ok)
  const run: { action: Action; queued?: number }[] = approved().map((x) => ({ action: x.action, queued: x.id }))
  const escalated: string[] = []
  for (const a of planned) {
    if (needsHuman(a)) {
      escalate(a, describe(a), 'above the soft restock threshold')
      escalated.push(describe(a))
    } else run.push({ action: a })
  }

  const results = []
  for (const { action, queued } of run) {
    try {
      const tx = await act(action)
      results.push({ action: describe(action), tx })
    } catch (e) {
      results.push({ action: describe(action), error: (e instanceof Error ? e.message : String(e)).split('\n')[0] })
    }
    if (queued) writeQueue(readQueue().map((e) => (e.id === queued ? { ...e, status: 'done' as const } : e)))
  }

  const head = record({
    time: new Date(s.time * 1000).toISOString(),
    block: s.block,
    seen: {
      usdc: Number(s.usdc) / 1e18,
      pending: s.pending.length,
      spentToday: Number(s.spentToday) / 1e18,
      pools: Object.fromEntries(Object.entries(s.stocks).map(([k, v]) => [k, Number(usd6(v.pool, v.oracle || v.market)) / 1e6])),
      prices: Object.fromEntries(Object.entries(s.stocks).map(([k, v]) => [k, Number(v.oracle) / 1e6])),
    },
    unconfirmed: notes,
    decided: planned.map(describe),
    executed: results,
    escalated,
    rule: 'deterministic policy; contract band, sinks and daily cap enforce',
  })
  const anchorTx = await anchor(head).catch((e) => `anchor failed: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  console.log(new Date().toISOString(), `block ${s.block}`, results.length ? results : 'no action', escalated.length ? { escalated } : '', notes.length ? { unconfirmed: notes } : '', { head, anchorTx })
}

console.log(`Treasurer ${account.address}, every ${MINUTES} min`)
await cycle()
if (!process.argv.includes('--once')) setInterval(() => cycle().catch((e) => console.error('cycle failed:', e)), MINUTES * 60_000)
