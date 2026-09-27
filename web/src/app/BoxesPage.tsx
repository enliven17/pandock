import { useRef, useState } from 'react'
import { PANDOCK, pandockAbi, stockOf } from '../config'
import { fmt } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Link from '../components/Link'
import Box from '../components/Box'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

type Result = { id: bigint; kind: 'win' | 'empty' | 'refund' | 'expired'; symbol?: string; name?: string; amount?: string }

const STACK = 5 // how many box drawings the sealed tile stacks, at most

export default function BoxesPage({ boxes }: { boxes: Boxes }) {
  const root = useRef<HTMLElement>(null)
  const [results, setResults] = useState<Result[]>([])
  const { balance, pending, setPending, busy, error, run, write, live } = boxes
  const sealed = Number(balance)
  const nothing = sealed === 0 && pending.length === 0 && results.length === 0

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('.boxes-grid > *', { y: 28, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.2 })
    },
    { scope: root },
  )

  // Each new result turns over like a card being flipped face up.
  useGSAP(
    () => {
      if (!results.length || reducedMotion()) return
      gsap.fromTo(
        '.reveal-card:first-child',
        { rotateY: -90, opacity: 0, y: 20 },
        { rotateY: 0, opacity: 1, y: 0, duration: 0.9, ease: 'back.out(1.4)' },
      )
    },
    { scope: root, dependencies: [results.length] },
  )

  const open = async () => {
    const logs = await run('open', () => write({ address: PANDOCK!, abi: pandockAbi, functionName: 'open', args: [balance] }))
    if (!logs) return
    const ids = logs.flatMap((l) => (l.eventName === 'Opened' ? [l.args.openingId] : []))
    setPending((p) => [...p, ...ids])
  }

  const reveal = async (id: bigint) => {
    const logs = await run(`reveal-${id}`, () => write({ address: PANDOCK!, abi: pandockAbi, functionName: 'reveal', args: [id] }))
    for (const l of logs ?? []) {
      let r: Result | null = null
      if (l.eventName === 'Revealed') {
        const s = stockOf(l.args.token)
        r = l.args.amount === 0n ? { id, kind: 'empty' } : { id, kind: 'win', symbol: s.symbol, name: s.name, amount: fmt(l.args.amount) }
      }
      if (l.eventName === 'Refunded') r = { id, kind: 'refund', amount: fmt(l.args.amount) }
      if (l.eventName === 'Expired') r = { id, kind: 'expired' }
      if (r) {
        const done = r
        // Lid off the waiting card first, then the result turns over in its place.
        const lid = root.current?.querySelector(`[data-box="${id}"] .box-lid`)
        if (lid && !reducedMotion()) await gsap.to(lid, { y: -80, x: 30, rotate: 18, opacity: 0, duration: 0.5, ease: 'power2.out' })
        setPending((p) => p.filter((x) => x !== id))
        setResults((rs) => [done, ...rs])
      }
    }
  }

  if (nothing)
    return (
      <section ref={root} className="app-page boxes-empty">
        <Box className="empty-box" />
        <PageHeader kicker="My boxes" title="No boxes yet." lead="Buy a few, or ask a friend to gift you one. They show up here sealed.">
          <div className="ctas">
            <Link to="/app" className="btn-primary btn-large">Buy boxes</Link>
          </div>
        </PageHeader>
      </section>
    )

  return (
    <section ref={root} className="app-page">
      <PageHeader kicker="My boxes" title="Your boxes." lead="Open them all at once, then reveal each one. Reveal within about an hour of opening, or the box is forfeited." />

      <div className="boxes-grid">
        <div className="sealed-tile">
          <div className="sealed-stack" aria-hidden="true">
            {Array.from({ length: Math.min(Math.max(sealed, 1), STACK) }, (_, i) => (
              <Box key={i} className={`stack-box ${sealed === 0 ? 'is-ghost' : ''}`} />
            ))}
          </div>
          <div className="sealed-info">
            <span className="caption muted-dark">Sealed</span>
            <span className="sealed-count">{sealed}</span>
            {sealed > 0 ? (
              <button className="btn-light" disabled={!live || !!busy} onClick={open}>
                {busy === 'open' ? 'Opening…' : sealed === 1 ? 'Open it' : `Open all ${sealed}`}
              </button>
            ) : (
              <Link to="/app" className="btn-light">Buy more</Link>
            )}
          </div>
        </div>

        <div className="waiting">
          <span className="caption muted">Waiting to be revealed</span>
          {pending.length ? (
            <div className="waiting-grid">
              {pending.map((id) => (
                <div key={id.toString()} className={`waiting-card ${busy === `reveal-${id}` ? 'is-revealing' : ''}`} data-box={id.toString()}>
                  <Box className="waiting-box" />
                  <span className="caption muted">Box {id.toString()}</span>
                  <button className="btn-primary" disabled={!!busy} onClick={() => reveal(id)}>
                    {busy === `reveal-${id}` ? 'Revealing…' : 'Reveal'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="body muted">Nothing waiting. Opened boxes appear here until you reveal them.</p>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="revealed">
          <span className="caption muted">Revealed</span>
          <div className="reveal-grid">
            {results.map((r) => (
              <div key={r.id.toString()} className={`reveal-card is-${r.kind}`}>
                <div className="prize-top">
                  <span className="caption">Box {r.id.toString()}</span>
                  {r.name && <span className="caption">{r.name}</span>}
                </div>
                {r.symbol && hasLogo(r.symbol) && <Logo symbol={r.symbol} className="reveal-logo" />}
                <span className="reveal-title">
                  {r.kind === 'win' ? r.symbol : r.kind === 'refund' ? 'Refund' : r.kind === 'empty' ? 'Empty' : 'Expired'}
                </span>
                <span className="body">
                  {r.kind === 'win'
                    ? `${r.amount} shares`
                    : r.kind === 'refund'
                      ? `${r.amount} USDC back to you`
                      : r.kind === 'empty'
                        ? 'Better luck next box'
                        : 'Revealed too late'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p className="caption error">{error}</p>}
    </section>
  )
}
