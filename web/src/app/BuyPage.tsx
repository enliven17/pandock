import { useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useSwitchChain } from 'wagmi'
import { chain, PANDOCK, pandockAbi, STOCKS } from '../config'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Link from '../components/Link'
import Box from '../components/Box'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'
import Magnetic from '../components/Magnetic'
import RollingNumber from '../components/RollingNumber'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

const PRESETS = [1, 5, 10, 25]
const MAX = 100
const PREVIEW_PRICE = 0.1 // shown until the contract is live
const usdc = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const whole = (n: number) => Math.round(n).toString()
const withLogo = Object.values(STOCKS).filter((s) => hasLogo(s.symbol))

export default function BuyPage({ boxes }: { boxes: Boxes }) {
  const root = useRef<HTMLElement>(null)
  const [qty, setQty] = useState(1)
  const [bought, setBought] = useState(0)
  const { switchChain } = useSwitchChain()
  const { price, busy, error, run, write, live, wrongChain } = boxes
  const unit = price ? Number(formatUnits(price, 18)) : PREVIEW_PRICE
  const set = (n: number) => setQty(Math.min(MAX, Math.max(1, Math.floor(n) || 1)))

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('.buy-art .buy-box', { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', delay: 0.1 })
      gsap.from('.buy-panel > *', { y: 24, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.25 })
    },
    { scope: root },
  )

  const buy = async () => {
    if (!price) return
    if (wrongChain) return switchChain({ chainId: chain.id })
    const logs = await run('buy', () =>
      write({ address: PANDOCK!, abi: pandockAbi, functionName: 'buy', args: [BigInt(qty)], value: price * BigInt(qty) }),
    )
    if (logs?.some((l) => l.eventName === 'Bought')) setBought(qty)
  }

  return (
    <section ref={root} className="app-page buy">
      <div className="buy-art">
        <Box className="buy-box" />
        <div className="buy-inside">
          <span className="caption muted">Could be inside</span>
          <div className="buy-logos">
            {withLogo.map((s) => (
              <Logo key={s.symbol} symbol={s.symbol} className="buy-logo" />
            ))}
            <span className="buy-ticker">+{Object.keys(STOCKS).length - withLogo.length} more</span>
          </div>
          <a href="/#odds" className="caption buy-odds">See the odds</a>
        </div>
      </div>

      <div className="buy-panel">
        <PageHeader title="Buy boxes." lead="A random slice of a real stock in each one. Keep them, open them, or gift them sealed." />

        <div className="qty-display" aria-live="polite">
          <RollingNumber value={qty} format={whole} className="qty-number" />
          <span className="lead muted">{qty === 1 ? 'box' : 'boxes'}</span>
        </div>

        <div className="qty-controls">
          <div className="segmented" role="group" aria-label="Quick amounts">
            {PRESETS.map((n) => (
              <button key={n} className={`segment ${qty === n ? 'is-active' : ''}`} aria-pressed={qty === n} onClick={() => set(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="stepper" role="group" aria-label="Box count">
            <button className="stepper-btn" aria-label="One fewer" disabled={qty <= 1} onClick={() => set(qty - 1)}>
              −
            </button>
            <input
              className="stepper-input"
              type="number"
              min={1}
              max={MAX}
              value={qty}
              aria-label="Boxes"
              onChange={(e) => set(Number(e.target.value))}
            />
            <button className="stepper-btn" aria-label="One more" disabled={qty >= MAX} onClick={() => set(qty + 1)}>
              +
            </button>
          </div>
        </div>

        <div className="total-tile">
          <div className="total-row">
            <span className="caption muted-dark">{usdc(unit)} USDC × {qty}</span>
            <span className="caption muted-dark">Gas is paid in USDC</span>
          </div>
          <div className="total-amount">
            <RollingNumber value={unit * qty} format={usdc} className="total-number" />
            <span className="tagline">USDC</span>
          </div>
          <Magnetic>
            <button className="btn-primary btn-large buy-cta" disabled={!live || !price || !!busy} onClick={buy}>
              {busy === 'buy' ? 'Confirm in wallet…' : `Buy ${qty} ${qty === 1 ? 'box' : 'boxes'}`}
            </button>
          </Magnetic>
        </div>
        {error && <p className="caption error">{error}</p>}

        {bought > 0 && (
          <div className="buy-done">
            <span className="body-strong">
              {bought} {bought === 1 ? 'box is' : 'boxes are'} yours.
            </span>
            <div className="ctas">
              <Link to="/app/boxes" className="btn-primary">Open now</Link>
              <Link to="/app/gift" className="btn-secondary">Gift them</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
