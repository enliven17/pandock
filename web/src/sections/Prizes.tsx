import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useReadContract } from 'wagmi'
import { FEATURED, PANDOCK, pandockAbi, STOCKS, stockOf } from '../config'
import { fmt } from '../format'
import { gsap } from '../motion'
import { usd, usePrices } from '../prices'
import CardSwap from '../components/CardSwap'
import SplitReveal from '../components/SplitReveal'
import Marquee from '../components/Marquee'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'

const ZERO = '0x0000000000000000000000000000000000000000'
type Row = { symbol: string; name: string; shares?: bigint; odds?: string; empty?: boolean }

const pct = (w: bigint, total: bigint) => `${Number((w * 10000n) / total) / 100}%`

/** A price that rolls to its new value instead of snapping. */
function Price({ value }: { value?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef({ v: 0 })
  useEffect(() => {
    if (value === undefined || !ref.current) return
    const el = ref.current
    gsap.to(shown.current, {
      v: value,
      duration: shown.current.v ? 0.6 : 1.6,
      ease: 'expo.out',
      onUpdate: () => {
        el.textContent = usd(shown.current.v)
      },
    })
  }, [value])
  return <span ref={ref}>—</span>
}

export default function Prizes() {
  const { data: prices } = usePrices()
  const { data: table } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'prizes',
    query: { enabled: !!PANDOCK },
  })
  const [front, setFront] = useState(0)
  const [held, setHeld] = useState<number | null>(null)

  const total = table?.reduce((s, p) => s + p.weight, 0n) ?? 0n
  const rows: Row[] = (
    table?.length
      ? table.map((p) =>
          p.token === ZERO
            ? { symbol: 'Empty', name: 'Nothing this time', empty: true, odds: pct(p.weight, total) }
            : { ...stockOf(p.token), shares: p.amount, odds: pct(p.weight, total) },
        )
      : // before a contract is wired up, show what can be inside (the featured eight)
        Object.values(STOCKS).filter((s) => FEATURED.includes(s.symbol))
  ).slice(0, 8)
  const current = held ?? front

  return (
    <section id="prizes" className="prizes">
      <Marquee>
        {Object.values(STOCKS).map((s) => (
          <span key={s.symbol} className="marquee-item">
            {s.symbol}
            <small>{prices?.[s.symbol] ? usd(prices[s.symbol]) : ''}</small>
          </span>
        ))}
      </Marquee>

      <div className="prizes-grid">
        <div className="prizes-copy">
          <SplitReveal>
            <h2 className="display-xl">What’s inside.</h2>
          </SplitReveal>
          <p className="lead muted" data-rise>
            {table?.length
              ? 'Odds from the contract. Prices from the ArcStocks oracle on Arc, live.'
              : `${Object.keys(STOCKS).length} US stocks and ETFs, backed one to one. Prices read live from Arc.`}
          </p>
          <ul className="odds" data-rise onMouseLeave={() => setHeld(null)}>
            {rows.map((r, i) => (
              <li key={i}>
                <button
                  className={`odds-row ${current === i ? 'is-current' : ''}`}
                  onMouseEnter={() => setHeld(i)}
                  onFocus={() => setHeld(i)}
                  onClick={() => setHeld(i)}
                >
                  <span className="body-strong odds-symbol">
                    <span className="odds-logo">{hasLogo(r.symbol) && <Logo symbol={r.symbol} />}</span>
                    {r.symbol}
                  </span>
                  <span className="body odds-name">{r.name}</span>
                  <span className="body-strong">{r.odds ?? (prices?.[r.symbol] ? usd(prices[r.symbol]) : '')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <CardSwap
          active={held}
          onFront={setFront}
          {...(window.innerWidth < 640 ? { width: 260, height: 330, dx: 24, dy: 30 } : {})}
          cards={rows.map((r, i) => {
            const price = prices?.[r.symbol]
            const worth = price && r.shares ? price * Number(formatUnits(r.shares, 18)) : undefined
            return (
              <div
                key={i}
                className={`prize-card ${r.empty ? 'prize-card-empty' : ''} ${hasLogo(r.symbol) ? 'has-logo' : ''} ${i === current ? 'is-front' : ''}`}
              >
                <div className="prize-top">
                  <span className="caption">{r.name}</span>
                  {!r.empty && (
                    <span className="caption prize-price">
                      <Price value={price} />
                    </span>
                  )}
                </div>
                {hasLogo(r.symbol) && <Logo symbol={r.symbol} className="prize-logo" />}
                <span className="prize-ticker" style={{ '--len': (r.empty ? 'Empty' : r.symbol).length } as React.CSSProperties}>
                  {r.empty ? 'Empty' : r.symbol}
                </span>
                <div className="prize-bottom">
                  <span className="body">
                    {r.shares
                      ? `${fmt(r.shares)} shares${worth ? ` · ${usd(worth)}` : ''}`
                      : r.empty
                        ? 'Better luck next box'
                        : 'One slice per box'}
                  </span>
                  {r.odds && <span className="tagline">{r.odds}</span>}
                </div>
              </div>
            )
          })}
        />
      </div>
    </section>
  )
}
