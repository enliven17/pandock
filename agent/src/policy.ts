import { encodeFunctionData } from 'viem'
import { marketAbi } from './chain.js'
import { usd6, type Prize, type State } from './observe.js'

const num = (k: string, d: number) => Number(process.env[k] ?? d)
export const usdc = (x: number) => BigInt(Math.round(x * 1e6)) * 10n ** 12n // USD → native USDC, 18 dp

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

const priceOf = (s: State, ok: string[], sym: string) =>
  ok.includes(sym) && s.stocks[sym].oracle ? s.stocks[sym].oracle : s.stocks[sym].market

/** Copy confirmed oracle prices that drifted onto the testnet market. Mechanical, never a model call. */
export function relay(s: State, ok: string[]): Action | undefined {
  const stale = Object.entries(s.stocks).filter(
    ([sym, st]) => ok.includes(sym) && st.oracle && gapBps(Number(st.market), Number(st.oracle)) > CFG.relayBps,
  )
  if (!stale.length) return
  return { kind: 'relay', symbols: stale.map(([k]) => k), tokens: stale.map(([, st]) => st.token), prices: stale.map(([, st]) => st.oracle) }
}

/** Expected payout of the standard table in bps of a $0.10 box: 8 × (80×0.05 + 12×0.30 + 1×2) / 1000. */
export const BASE_PAYOUT_BPS = 7680

/** The standard table, every tier's dollar value scaled to hit `targetBps`; share amounts from live prices. */
export function table(s: State, ok: string[], targetBps = BASE_PAYOUT_BPS): Prize[] {
  const bySym = Object.entries(s.stocks)
  const t: Prize[] = []
  for (const tier of TIERS)
    for (const [sym, st] of bySym) {
      const usd = (tier.usd6 * BigInt(targetBps)) / BigInt(BASE_PAYOUT_BPS)
      t.push({ token: st.token, weight: tier.weight, amount: (usd * 10n ** 18n) / priceOf(s, ok, sym) })
    }
  t.push({ token: ZERO, weight: EMPTY, amount: 0n })
  return t
}

/** Largest tier drift of the live table from `targetBps`, in bps (Infinity if it isn't our shape). */
export function drift(s: State, ok: string[], targetBps = BASE_PAYOUT_BPS) {
  let worst = 0
  for (const row of s.table) {
    if (row.token === ZERO) continue
    const sym = Object.keys(s.stocks).find((k) => s.stocks[k].token.toLowerCase() === row.token.toLowerCase())
    const tier = TIERS.find((t) => t.weight === row.weight)
    if (!sym || !tier) return Infinity
    const want = (Number(tier.usd6) * targetBps) / BASE_PAYOUT_BPS
    worst = Math.max(worst, gapBps(Number(usd6(row.amount, priceOf(s, ok, sym))), want))
  }
  return s.table.length === TIERS.length * Object.keys(s.stocks).length + 1 ? worst : Infinity
}

/** USDC the operator may spend now: above the refund reserve and inside today's cap. */
export function budget(s: State) {
  const reserve = BigInt(s.pending.length) * s.boxPrice + usdc(CFG.reserveUsd)
  const free = s.usdc > reserve ? s.usdc - reserve : 0n
  const cap = s.cap - s.spentToday
  return { reserve, budget: free < cap ? free : cap }
}

/** Pool value per stock in USD, at the prices this cycle acts on. */
export const poolUsd = (s: State, ok: string[]) =>
  Object.fromEntries(Object.entries(s.stocks).map(([sym, st]) => [sym, Number(usd6(st.pool, priceOf(s, ok, sym))) / 1e6]))

export function restock(s: State, symbol: string, amount: bigint): Action {
  const token = s.stocks[symbol].token
  return { kind: 'restock', symbol, token, amount, data: encodeFunctionData({ abi: marketAbi, functionName: 'buy', args: [token] }) }
}

/** The deterministic plan (and the floor when no model answers): relay, reprice drift, restock low pools. */
export function plan(s: State, ok: string[]): Action[] {
  const actions: Action[] = []
  const r = relay(s, ok)
  if (r) actions.push(r)
  // Reprice only when every stock is confirmed: a table priced on one bad print is the failure to avoid.
  if (ok.length === Object.keys(s.stocks).length && drift(s, ok) > CFG.driftBps) actions.push({ kind: 'reprice', table: table(s, ok) })
  let { budget: left } = budget(s)
  const pools = poolUsd(s, ok)
  const low = ok.filter((sym) => pools[sym] < CFG.poolLowUsd).sort((a, b) => pools[a] - pools[b])
  for (const sym of low) {
    let amount = usdc(CFG.poolTargetUsd - pools[sym])
    if (amount > left) amount = left
    if (amount === 0n) break
    left -= amount
    actions.push(restock(s, sym, amount))
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

