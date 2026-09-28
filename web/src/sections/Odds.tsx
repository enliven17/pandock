import { useRef } from 'react'
import { formatUnits } from 'viem'
import { useReadContract } from 'wagmi'
import { PANDOCK, pandockAbi, stockOf } from '../config'
import { gsap, reducedMotion, useGSAP } from '../motion'
import { usePrices } from '../prices'
import SplitReveal from '../components/SplitReveal'
import Logo from '../components/Logo'
import RollingNumber from '../components/RollingNumber'
import { hasLogo } from '../components/logos'

const ZERO = '0x0000000000000000000000000000000000000000'
const PREVIEW_PRICE = 0.1 // USDC per box until a contract is wired up

// Until the contract is live: seven tiers in dollars, each paid out as a slice of one stock.
// Weights sum to 100; expected value is $0.0748 on a $0.10 box, i.e. 75% back on average.
const PREVIEW: { symbol: string; usd: number; weight: number }[] = [
  { symbol: 'AAPL', usd: 0.01, weight: 28 },
  { symbol: 'TSLA', usd: 0.025, weight: 24 },
  { symbol: 'AMZN', usd: 0.05, weight: 20 },
  { symbol: 'NVDA', usd: 0.1, weight: 17 },
  { symbol: 'META', usd: 0.2, weight: 7 },
  { symbol: 'GOOGL', usd: 0.5, weight: 3 },
  { symbol: 'NVDA', usd: 1, weight: 1 },
]

type Tier = { symbols: string[]; value?: number; shares?: number; chance: number; weight?: bigint }

// Whole percents, but a decimal under 10% so a 0.8% prize doesn't read as 0%.
const pct = (x: number) => (x > 0 && x < 0.001 ? '<0.1%' : `${x < 0.1 ? Math.round(x * 1000) / 10 : Math.round(x * 100)}%`)

/** One row per prize tier: the live table repeats each dollar tier once per stock, all with the tier's weight.
 *  Keyed by weight rather than value, so a tier doesn't split in two while prices drift between reprices. */
function group(tiers: Tier[]): Tier[] {
  const rows = new Map<string, Tier>()
  for (const t of tiers) {
    const key = t.symbols[0] === 'Empty' ? 'empty' : t.weight !== undefined ? `w${t.weight}` : String(t.value)
    const r = rows.get(key)
    if (!r) rows.set(key, { ...t })
    else {
      const chance = r.chance + t.chance
      const value = r.value !== undefined && t.value !== undefined ? (r.value * r.chance + t.value * t.chance) / chance : undefined
      rows.set(key, { symbols: [...new Set([...r.symbols, ...t.symbols])], value, chance })
    }
  }
  return [...rows.values()].map((r) => (r.symbols.length > 1 ? { ...r, shares: undefined } : r))
}
// Cents, plus a third decimal where a tier needs it ($0.025).
const prize = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })
const shares = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: 2 })

export default function Odds() {
  const root = useRef<HTMLElement>(null)
  const { data: prices } = usePrices()
  const { data: table } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'prizes',
    query: { enabled: !!PANDOCK },
  })
  const { data: boxPrice } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'boxPrice',
    query: { enabled: !!PANDOCK },
  })

  const live = !!table?.length
  const price = boxPrice ? Number(formatUnits(boxPrice, 18)) : PREVIEW_PRICE
  const total = live ? Number(table.reduce((s, p) => s + p.weight, 0n)) : 100

  const tiers: Tier[] = group(
    live
      ? table.map((p) => {
          if (p.token === ZERO) return { symbols: ['Empty'], value: 0, chance: Number(p.weight) / total }
          const s = stockOf(p.token)
          const n = Number(formatUnits(p.amount, 18))
          const px = prices?.[s.symbol]
          return { symbols: [s.symbol], shares: n, value: px ? px * n : undefined, chance: Number(p.weight) / total, weight: p.weight }
        })
      : PREVIEW.map((t) => {
          const px = prices?.[t.symbol]
          return { symbols: [t.symbol], value: t.usd, shares: px ? t.usd / px : undefined, chance: t.weight / total }
        }),
  )
  tiers.sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

  const priced = tiers.every((t) => t.value !== undefined)
  const atLeast = (x: number) => tiers.reduce((s, t) => s + ((t.value ?? 0) >= x - 1e-9 ? t.chance : 0), 0)
  const payout = tiers.reduce((s, t) => s + (t.value ?? 0) * t.chance, 0) / price
  const stats = [
    { value: atLeast(price), label: `worth at least the ${price.toFixed(2)} USDC you paid` },
    { value: atLeast(price * 2), label: 'worth double or more' },
    { value: payout, label: 'average payout, at today’s prices' },
  ]
  const maxChance = Math.max(...tiers.map((t) => t.chance))

  useGSAP(
    () => {
      if (reducedMotion()) return
      // The bars fill from the left once the section is in view. fromTo, not from: this re-runs when live
      // rows replace the preview, and `from` would take a half-grown bar as its end state. (Stats roll via
      // RollingNumber: writing textContent here raced React and left the preview's numbers on screen.)
      gsap.fromTo('.tier-fill', { scaleX: 0 }, {
        scaleX: 1,
        duration: 1.2,
        ease: 'expo.out',
        stagger: 0.07,
        scrollTrigger: { trigger: '.tiers', start: 'top 80%', once: true },
      })
    },
    { scope: root, dependencies: [priced, tiers.length] },
  )

  return (
    <section id="odds" ref={root} className="odds-section">
      <div className="odds-head">
        <SplitReveal>
          <h2 className="display-xl">The odds.</h2>
        </SplitReveal>
        <p className="lead muted" data-rise>
          Every prize and its chance. Share amounts follow the live ArcStocks price on Arc.
        </p>
      </div>

      <div className="stats" data-rise>
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <RollingNumber value={s.value} format={pct} className="stat-value" />
            <span className="body muted">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="tiers" role="table" aria-label="Prize tiers">
        <div className="tier tier-head" role="row">
          <span role="columnheader">Prize</span>
          <span role="columnheader">Paid in</span>
          <span role="columnheader" className="tier-bar-col">Chance</span>
          <span role="columnheader" className="tier-pct" />
        </div>
        {tiers.map((t, i) => (
          <div key={i} className="tier" role="row">
            <span role="cell" className="tier-value">
              {t.value === undefined ? '—' : prize(t.value)}
            </span>
            <span role="cell" className="tier-stock">
              {t.symbols.length > 1 ? (
                <>
                  <span className="tier-logos" aria-hidden="true">
                    {t.symbols.filter(hasLogo).slice(0, 5).map((sym) => (
                      <Logo key={sym} symbol={sym} className="tier-logo" />
                    ))}
                  </span>
                  <span className="body-strong" title={t.symbols.join(', ')}>
                    {t.symbols.length} stocks
                  </span>
                </>
              ) : (
                <>
                  {hasLogo(t.symbols[0]) && <Logo symbol={t.symbols[0]} className="tier-logo" />}
                  <span className="body-strong">{t.symbols[0]}</span>
                  {t.shares !== undefined && <span className="caption muted">{shares(t.shares)} sh</span>}
                </>
              )}
            </span>
            <span role="cell" className="tier-bar tier-bar-col" aria-hidden="true">
              <span className="tier-fill" style={{ width: `${(t.chance / maxChance) * 100}%` }} />
            </span>
            <span role="cell" className="tier-pct body-strong">
              {pct(t.chance)}
            </span>
          </div>
        ))}
      </div>

      <p className="caption muted odds-note">
        The draw uses a block hash no one can know when the box is opened. If a stock’s pool runs dry, that box is refunded.
      </p>
    </section>
  )
}
