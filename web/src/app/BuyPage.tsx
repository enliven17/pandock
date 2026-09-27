import { useState } from 'react'
import { useSwitchChain } from 'wagmi'
import { chain, PANDOCK, pandockAbi } from '../config'
import { fmt } from '../format'
import Link from '../components/Link'
import Box from '../components/Box'
import Magnetic from '../components/Magnetic'
import type { Boxes } from './AppShell'

const PRESETS = [1, 5, 10, 25]
const MAX = 100

export default function BuyPage({ boxes }: { boxes: Boxes }) {
  const [qty, setQty] = useState(1)
  const [bought, setBought] = useState(0)
  const { switchChain } = useSwitchChain()
  const { price, busy, error, run, write, live, wrongChain } = boxes
  const total = price ? price * BigInt(qty) : undefined

  const buy = async () => {
    if (!price) return
    if (wrongChain) return switchChain({ chainId: chain.id })
    const logs = await run('buy', () =>
      write({ address: PANDOCK!, abi: pandockAbi, functionName: 'buy', args: [BigInt(qty)], value: price * BigInt(qty) }),
    )
    if (logs?.some((l) => l.eventName === 'Bought')) setBought(qty)
  }

  return (
    <section className="app-page buy">
      <div className="buy-art">
        <Box className="buy-box" />
      </div>

      <div className="app-card buy-card">
        <span className="caption muted">Sealed box</span>
        <h1 className="display-lg">Buy boxes.</h1>
        <p className="body muted">
          Each box holds a random slice of a real stock. Keep them, open them, or gift them sealed.
        </p>

        <div className="qty">
          <span className="caption-strong">How many</span>
          <div className="chips">
            {PRESETS.map((n) => (
              <button key={n} className={`chip ${qty === n ? 'chip-selected' : ''}`} aria-pressed={qty === n} onClick={() => setQty(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="stepper" role="group" aria-label="Box count">
            <button className="stepper-btn" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <input
              className="stepper-input"
              type="number"
              min={1}
              max={MAX}
              value={qty}
              aria-label="Boxes"
              onChange={(e) => setQty(Math.min(MAX, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
            />
            <button className="stepper-btn" aria-label="One more" disabled={qty >= MAX} onClick={() => setQty((q) => Math.min(MAX, q + 1))}>
              +
            </button>
          </div>
        </div>

        <dl className="summary">
          <div>
            <dt className="body muted">Price per box</dt>
            <dd className="body">{price ? `${fmt(price)} USDC` : '—'}</dd>
          </div>
          <div>
            <dt className="body-strong">Total</dt>
            <dd className="tagline">{total ? `${fmt(total)} USDC` : '—'}</dd>
          </div>
        </dl>

        <Magnetic>
          <button className="btn-primary btn-large buy-cta" disabled={!live || !price || !!busy} onClick={buy}>
            {busy === 'buy' ? 'Confirm in wallet…' : `Buy ${qty} ${qty === 1 ? 'box' : 'boxes'}`}
          </button>
        </Magnetic>
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
