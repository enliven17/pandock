import { encodeFunctionData } from 'viem'
import { marketAbi } from './chain.js'
import { usd6, type Prize, type State } from './observe.js'

const num = (k: string, d: number) => Number(process.env[k] ?? d)
const usdc = (x: number) => BigInt(Math.round(x * 1e6)) * 10n ** 12n // USD → native USDC, 18 dp

// Knobs. The contract's band, sinks and daily cap are the hard limits; these only shape proposals.
export const CFG = {
  crossCheckBps: num('CROSS_CHECK_BPS', 200), // oracle vs CMC tolerance
  relayBps: num('RELAY_BPS', 50), // copy oracle → market when they differ by more
  driftBps: num('REPRICE_DRIFT_BPS', 300), // reprice when a tier's dollar value drifts by more
  poolLowUsd: num('POOL_LOW_USD', 60), // restock a stock below this…
  poolTargetUsd: num('POOL_TARGET_USD', 100), // …up to this
  reserveUsd: num('RESERVE_USD', 0.5), // liquid USDC on top of one refund per pending opening
  softRestockUsd: num('SOFT_RESTOCK_USD', 5), // a single restock above this waits for a human
}

// Same table shape the deploy set: per stock $0.05 ×80, $0.30 ×12, $2 ×1, out of 1000; 256 empty.
const TIERS = [
  { usd6: 50_000n, weight: 80n },
  { usd6: 300_000n, weight: 12n },
  { usd6: 2_000_000n, weight: 1n },
]
const EMPTY = 256n
const ZERO = '0x0000000000000000000000000000000000000000' as const

export type Action =
  | { kind: 'relay'; symbols: string[]; tokens: `0x${string}`[]; prices: bigint[] }
  | { kind: 'reprice'; table: Prize[] }
  | { kind: 'restock'; symbol: string; token: `0x${string}`; amount: bigint; data: `0x${string}` }

const gapBps = (a: number, b: number) => Math.abs(a - b) / b * 10_000

/** Stocks whose oracle price CMC agrees with. Money only moves on these. */
export function confirmed(s: State, cmc: Record<string, number>) {
  const ok: string[] = []
  const notes: string[] = []
  for (const [sym, st] of Object.entries(s.stocks)) {
    const o = Number(st.oracle) / 1e6
    const c = cmc[sym]
    if (!o) notes.push(`${sym}: no oracle price`)
    else if (!c) notes.push(`${sym}: no CMC quote`)
    else if (gapBps(o, c) > CFG.crossCheckBps) notes.push(`${sym}: oracle $${o.toFixed(2)} vs CMC $${c.toFixed(2)}`)
    else ok.push(sym)
  }
  return { ok, notes }
}

/** The deterministic plan: relay prices, reprice drifted tiers, restock low pools from surplus. */
export function plan(s: State, ok: string[]): Action[] {
  const actions: Action[] = []
  const bySym = Object.entries(s.stocks)

  const stale = bySym.filter(([sym, st]) => ok.includes(sym) && st.oracle && gapBps(Number(st.market), Number(st.oracle)) > CFG.relayBps)
  if (stale.length)
    actions.push({ kind: 'relay', symbols: stale.map(([k]) => k), tokens: stale.map(([, st]) => st.token), prices: stale.map(([, st]) => st.oracle) })
  // Prices the table and the pool are judged at, after this cycle's relay.
  const px = (sym: string) => (ok.includes(sym) && s.stocks[sym].oracle ? s.stocks[sym].oracle : s.stocks[sym].market)

  // Reprice only when every stock is confirmed: a table priced on one bad print is the failure to avoid.
  if (ok.length === bySym.length) {
    const table: Prize[] = []
    for (const t of TIERS) for (const [sym, st] of bySym) table.push({ token: st.token, weight: t.weight, amount: (t.usd6 * 10n ** 18n) / px(sym) })
    table.push({ token: ZERO, weight: EMPTY, amount: 0n })
    const drifted = s.table.some((row) => {
      if (row.token === ZERO) return false
      const sym = bySym.find(([, st]) => st.token.toLowerCase() === row.token.toLowerCase())?.[0]
      const tier = TIERS.find((t) => t.weight === row.weight)
      if (!sym || !tier) return true // not our shape: rebuild
      return gapBps(Number(usd6(row.amount, px(sym))), Number(tier.usd6)) > CFG.driftBps
    })
    if (drifted || s.table.length !== table.length) actions.push({ kind: 'reprice', table })
  }

  const reserve = BigInt(s.pending.length) * s.boxPrice + usdc(CFG.reserveUsd)
  let budget = s.usdc > reserve ? s.usdc - reserve : 0n
  if (s.cap - s.spentToday < budget) budget = s.cap - s.spentToday
  const low = bySym
    .filter(([sym]) => ok.includes(sym))
    .map(([sym, st]) => ({ sym, st, value: Number(usd6(st.pool, px(sym))) / 1e6 }))
    .filter((x) => x.value < CFG.poolLowUsd)
    .sort((a, b) => a.value - b.value)
  for (const { sym, st, value } of low) {
    let amount = usdc(CFG.poolTargetUsd - value)
    if (amount > budget) amount = budget
    if (amount === 0n) break
    budget -= amount
    actions.push({ kind: 'restock', symbol: sym, token: st.token, amount, data: encodeFunctionData({ abi: marketAbi, functionName: 'buy', args: [st.token] }) })
  }
  return actions
}

/** Above the soft threshold → a human decides. */
export const needsHuman = (a: Action) => a.kind === 'restock' && a.amount > usdc(CFG.softRestockUsd)

export const describe = (a: Action) =>
  a.kind === 'relay'
    ? `relay ${a.symbols.map((s, i) => `${s} $${(Number(a.prices[i]) / 1e6).toFixed(2)}`).join(', ')}`
    : a.kind === 'reprice'
      ? `reprice ${a.table.length}-row table`
      : `restock ${a.symbol} with ${(Number(a.amount) / 1e18).toFixed(2)} USDC`

