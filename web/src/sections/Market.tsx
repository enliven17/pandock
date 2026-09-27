import { useRef, useState } from 'react'
import { STOCKS } from '../config'
import { usd, usePrices } from '../prices'
import { bySymbol, compactUsd, gap, signedPct, TOLERANCE, useRwa, type RwaAsset } from '../rwa'
import { gsap, reducedMotion, useGSAP } from '../motion'
import SplitReveal from '../components/SplitReveal'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'

const TICKERS = Object.values(STOCKS)

/** A price ruler: every issuer's price, the market average and ours on one scale, with the tolerance band. */
function Ruler({ asset, ours }: { asset: RwaAsset; ours?: number }) {
  const avg = asset.price!
  const points = [...asset.tokens.map((t) => t.price ?? avg), ...(ours ? [ours] : [])]
  // Zoom to the band plus a margin, widening only if a price sits outside it.
  const spread = Math.max(TOLERANCE * 1.5, ...points.map((p) => Math.abs(p / avg - 1) * 1.15))
  const min = avg * (1 - spread)
  const max = avg * (1 + spread)
  const at = (p: number) => `${((p - min) / (max - min)) * 100}%`

  return (
    <div className="ruler" aria-hidden="true">
      <div className="ruler-track">
        <span className="ruler-band" style={{ left: at(avg * (1 - TOLERANCE)), right: `calc(100% - ${at(avg * (1 + TOLERANCE))})` }} />
        <span className="ruler-avg" style={{ left: at(avg) }} />
        {asset.tokens.map((t, i) =>
          t.price ? (
            // Issuer labels sit above the track on two alternating levels, so neighbours don't collide.
            <span key={t.symbol} className={`ruler-mark ${i % 2 ? 'is-high' : ''}`} style={{ left: at(t.price) }}>
              <span className="ruler-mark-label caption">{t.issuer?.replace(/ Assets$/, '') ?? t.symbol}</span>
            </span>
          ) : null,
        )}
        {ours && (
          <span className={`ruler-ours ${Math.abs(ours / avg - 1) > TOLERANCE ? 'is-off' : ''}`} style={{ left: at(ours) }}>
            <span className="ruler-ours-label caption">Pandock</span>
          </span>
        )}
      </div>
      <div className="ruler-scale caption">
        <span>{signedPct(-spread)}</span>
        <span>Market avg · ±{TOLERANCE * 100}% band</span>
        <span>{signedPct(spread)}</span>
      </div>
    </div>
  )
}

export default function Market() {
  const root = useRef<HTMLElement>(null)
  const { data: rwa, error, isLoading } = useRwa()
  const { data: arc } = usePrices()
  const [symbol, setSymbol] = useState('NVDA')
  const [raw, setRaw] = useState<string | null>(null)
  const market = bySymbol(rwa)
  const asset = market[symbol]
  const ours = arc?.[symbol]
  const g = gap(ours, asset?.price)
  const off = g !== undefined && Math.abs(g) > TOLERANCE
  const totalCap = (asset?.tokens ?? []).reduce((s, t) => s + (t.marketCap ?? 0), 0) || 1

  // On every stock switch: the markers slide in from the average, the figures and rows settle in.
  useGSAP(
    () => {
      if (reducedMotion() || !asset) return
      gsap.from('.ruler-mark, .ruler-ours', { left: '50%', opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.05 })
      gsap.from('.market-figure, .issuer-row', { y: 14, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05 })
      gsap.from('.share-fill', { scaleX: 0, duration: 1, ease: 'expo.out', stagger: 0.05 })
    },
    { scope: root, dependencies: [symbol, !!asset] },
  )

  const showRaw = async () => {
    if (raw) return setRaw(null)
    const res = await fetch('/api/rwa?raw=1')
    setRaw(JSON.stringify(await res.json(), null, 2))
  }

  return (
    <section id="market" ref={root} className="market">
      <div className="market-inner">
        <header className="market-head">
          <SplitReveal>
            <h2 className="display-xl">Priced against<br />the market.</h2>
          </SplitReveal>
          <p className="lead muted-dark market-lead" data-rise>
            CoinMarketCap tracks every tokenized version of these stocks. Here’s where ours sits.
          </p>
        </header>

        <div className="market-tickers" role="tablist" aria-label="Stock" data-rise>
          {TICKERS.map((s) => {
            const tg = gap(arc?.[s.symbol], market[s.symbol]?.price)
            return (
              <button
                key={s.symbol}
                role="tab"
                aria-selected={symbol === s.symbol}
                className={`market-ticker ${symbol === s.symbol ? 'is-active' : ''} ${tg !== undefined && Math.abs(tg) > TOLERANCE ? 'is-off' : ''}`}
                onClick={() => setSymbol(s.symbol)}
              >
                {hasLogo(s.symbol) && <Logo symbol={s.symbol} className="market-ticker-logo" />}
                {s.symbol}
              </button>
            )
          })}
        </div>

        <div className="market-card" data-rise>
          {error ? (
            <p className="body muted-dark market-empty">Market data is unavailable right now. {(error as Error).message}</p>
          ) : isLoading ? (
            <p className="body muted-dark market-empty">Loading market data…</p>
          ) : !asset ? (
            <p className="body muted-dark market-empty">CoinMarketCap has no tokenized data for {symbol} yet.</p>
          ) : (
            <>
              <div className="market-card-head">
                <div className="market-name">
                  {hasLogo(symbol) && <Logo symbol={symbol} className="market-name-logo" />}
                  <div>
                    <span className="tagline">{asset.name}</span>
                    <span className="caption muted-dark">
                      {symbol} · {asset.tokens.length} {asset.tokens.length === 1 ? 'issuer' : 'issuers'} on CoinMarketCap
                    </span>
                  </div>
                </div>
                <span className={`verdict ${g === undefined ? 'is-unknown' : off ? 'is-off' : 'is-ok'}`}>
                  {g === undefined ? 'No Arc price' : off ? 'Outside the band · agent holds' : 'Inside the band'}
                </span>
              </div>

              <div className="market-figures">
                <div className="market-figure">
                  <span className="caption muted-dark">Pandock · ArcStocks on Arc</span>
                  <span className="figure-big">{ours !== undefined ? usd(ours) : '—'}</span>
                </div>
                <div className="market-figure">
                  <span className="caption muted-dark">Market average</span>
                  <span className="figure-big">{usd(asset.price!)}</span>
                </div>
                <div className="market-figure">
                  <span className="caption muted-dark">Gap</span>
                  <span className={`figure-big ${off ? 'is-off' : ''}`}>{g !== undefined ? signedPct(g) : '—'}</span>
                </div>
              </div>

              <Ruler asset={asset} ours={ours} />

              <div className="issuers">
                <div className="issuer-row issuer-row-head caption muted-dark">
                  <span>Issuer</span>
                  <span>Price</span>
                  <span className="issuer-share-col">Share of tokenized supply</span>
                </div>
                {asset.tokens.map((t) => (
                  <div key={t.symbol} className="issuer-row">
                    <span className="issuer-name">
                      <span className="body-strong">{t.issuer ?? 'Unknown issuer'}</span>
                      <span className="caption muted-dark">{t.symbol}</span>
                    </span>
                    <span className="body">{t.price ? usd(t.price) : '—'}</span>
                    <span className="issuer-share issuer-share-col">
                      <span className="share-bar">
                        <span className="share-fill" style={{ width: `${((t.marketCap ?? 0) / totalCap) * 100}%` }} />
                      </span>
                      <span className="caption muted-dark">{t.marketCap ? compactUsd(t.marketCap) : '—'}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {rwa && (
          <div className="market-proof">
            <span className="caption muted-dark market-proof-line">
              <span className="live-dot" aria-hidden="true" />
              <code>{rwa.endpoint}</code>
              <span>
                · {rwa.creditCount} credit · {new Date(rwa.fetchedAt).toLocaleTimeString()}
              </span>
            </span>
            <button className="btn-ghost-dark" onClick={showRaw}>
              {raw ? 'Hide response' : 'View raw response'}
            </button>
            {raw && <pre className="market-raw">{raw}</pre>}
          </div>
        )}
      </div>
    </section>
  )
}
