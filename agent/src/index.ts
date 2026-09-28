import './circle-home.js' // first: restores the Circle CLI session on hosts without a login
import { keccak256, toHex } from 'viem'
import { account, AGENT_WALLET, CIRCLE, client, FORWARDER, PANDOCK, pandockAbi, STOCKS } from './chain.js'
import { act, anchor } from './act.js'
import { cmcPrices } from './cmc.js'
import { decide as settle, escalate, escalations, json, record } from './log.js'
import { observe, type State } from './observe.js'
import { brief, decide, type Proposal } from './planner.js'
import { budget, CFG, confirmed, describe, drift, needsHuman, plan, poolUsd, relay, restock, table, usdc, type Action } from './policy.js'

const MINUTES = Number(process.env.CYCLE_MINUTES ?? 15)
let lastHash = ''

type Step = { action: Action; why: string }

/** Approved escalations, revived from the queue's JSON. Informational ones carry no action. */
async function approved(): Promise<{ id: number; action?: Action }[]> {
  return (await escalations('approved')).map((e) => {
    const a = e.action as (Action & { amount?: string }) | null
    if (!a) return { id: e.id }
    return { id: e.id, action: a.kind === 'restock' ? { ...a, amount: BigInt(a.amount!) } : a }
  })
}

/** Turns the model's proposals into actions, rejecting anything the rules (and so the contract) would refuse. */
async function check(s: State, ok: string[], proposals: Proposal[]) {
  const steps: Step[] = []
  const rejected: { proposal: Proposal; why: string }[] = []
  const notes: { tool: string; reason: string; summary?: string }[] = []
  let left = budget(s).budget
  for (const p of proposals) {
    if (p.tool === 'no_action') notes.push({ tool: p.tool, reason: p.reason })
    else if (p.tool === 'escalate') {
      await escalate(null, p.summary, p.reason)
      notes.push({ tool: p.tool, summary: p.summary, reason: p.reason })
    } else if (p.tool === 'restock') {
      const amount = usdc(Number(p.usdc))
      if (!ok.includes(p.symbol)) rejected.push({ proposal: p, why: `${p.symbol} is not a confirmed stock` })
      else if (amount <= 0n) rejected.push({ proposal: p, why: 'non-positive amount' })
      else if (amount > left) rejected.push({ proposal: p, why: `over the spendable budget (${Number(left) / 1e18} USDC left)` })
      else {
        left -= amount
        steps.push({ action: restock(s, p.symbol, amount), why: p.reason })
      }
    } else if (p.tool === 'reprice') {
      const target = Math.round(Number(p.target_payout_bps))
      if (ok.length !== Object.keys(s.stocks).length) rejected.push({ proposal: p, why: 'not every stock is confirmed' })
      else if (target < s.band.min || target > s.band.max)
        rejected.push({ proposal: p, why: `target ${target} outside band ${s.band.min}-${s.band.max}` })
      else steps.push({ action: { kind: 'reprice', table: table(s, ok, target) }, why: p.reason })
    }
  }
  return { steps, rejected, notes }
}

async function cycle() {
  const s = await observe()
  const cmc = await cmcPrices(Object.keys(STOCKS))
  const { ok, notes: unconfirmed } = confirmed(s, cmc)
  const pools = poolUsd(s, ok)
  const { reserve, budget: spendable } = budget(s)
  const baseline = plan(s, ok).filter((a) => a.kind !== 'relay')

  const results: { action: string; why?: string; tx?: string; error?: string }[] = []
  const run = async ({ action, why }: Step) => {
    try {
      results.push({ action: describe(action), why, tx: await act(action) })
    } catch (e) {
      results.push({ action: describe(action), why, error: (e instanceof Error ? e.message : String(e)).split('\n')[0] })
    }
  }

  // Relay first and deterministically: the contract's band check prices from the market, so the table needs fresh prices.
  const r = relay(s, ok)
  if (r) await run({ action: r, why: 'oracle moved; copy confirmed prices to the market' })
  for (const a of await approved()) {
    if (a.action) await run({ action: a.action, why: `approved by a human (escalation #${a.id})` })
    await settle(a.id, 'approved', 'done')
  }

  const currentBps = s.table.length
    ? Number(await client.readContract({ address: PANDOCK, abi: pandockAbi, functionName: 'payoutBps', args: [s.table] }).catch(() => 0n))
    : 0
  const facts = {
    spendable_usdc: Number(spendable) / 1e18,
    refund_reserve_usdc: Number(reserve) / 1e18,
    stocks: Object.fromEntries(
      Object.entries(s.stocks).map(([sym, st]) => [
        sym,
        {
          pool_usd: Math.round(pools[sym] * 100) / 100,
          oracle_usd: Number(st.oracle) / 1e6,
          cmc_usd: cmc[sym] ?? null,
          confirmed: ok.includes(sym),
        },
      ]),
    ),
    unconfirmed,
    table: { current_payout_bps: currentBps, worst_tier_drift_bps: Math.round(drift(s, ok)), drift_tolerance_bps: CFG.driftBps },
    soft_restock_threshold_usdc: CFG.softRestockUsd,
    pending_escalations: (await escalations('pending')).map((e) => e.summary),
    baseline_policy_suggests: baseline.map(describe),
  }

  // The planner only runs when something it decides on has changed (prices within a dollar of pool value don't count).
  const hash = keccak256(
    toHex(json({ ...facts, stocks: Object.values(facts.stocks).map((v) => [Math.round(v.pool_usd), v.confirmed]), demand: s.demand, pending: s.pending.length })),
  )
  const changed = hash !== lastHash || process.argv.includes('--once')
  lastHash = hash

  let decider = 'skipped: state unchanged'
  let proposals: Proposal[] = []
  let checked: Awaited<ReturnType<typeof check>> = { steps: [], rejected: [], notes: [] }
  if (changed) {
    const d = await decide(brief(s, facts))
    if (d.model && 'result' in d) {
      decider = d.model
      proposals = d.result
      checked = await check(s, ok, proposals)
    } else {
      // Deterministic floor: no model, no judgement calls; only the rule-based plan (which spends nothing it can't justify).
      decider = `model unavailable (${'errors' in d ? (d.errors ?? []).join('; ') : ''}): deterministic policy`
      checked.steps = baseline.map((action) => ({ action, why: 'deterministic policy (model unavailable)' }))
    }
  }

  const escalated: string[] = []
  for (const step of checked.steps) {
    if (needsHuman(step.action)) {
      await escalate(step.action, describe(step.action), `above the soft restock threshold; agent's reason: ${step.why}`)
      escalated.push(describe(step.action))
    } else await run(step)
  }

  const head = await record({
    time: new Date(s.time * 1000).toISOString(),
    block: s.block,
    seen: { usdc: Number(s.usdc) / 1e18, pending: s.pending.length, demand: s.demand, spendable: facts.spendable_usdc, pools, table_payout_bps: currentBps },
    unconfirmed,
    decider,
    proposals,
    rejected: checked.rejected,
    notes: checked.notes,
    executed: results,
    escalated,
  })
  const anchorTx = await anchor(head).catch((e) => `anchor failed: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  console.log(new Date().toISOString(), `block ${s.block}`, decider, json({ proposals, rejected: checked.rejected, executed: results, escalated }), { head, anchorTx })
}

console.log(`Treasurer ${CIRCLE ? `Circle agent wallet ${AGENT_WALLET} via ${FORWARDER}` : account!.address}, every ${MINUTES} min`)
await cycle()
if (!process.argv.includes('--once')) setInterval(() => cycle().catch((e) => console.error('cycle failed:', e)), MINUTES * 60_000)
