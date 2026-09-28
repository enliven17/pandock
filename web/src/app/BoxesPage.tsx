import { useRef, useState } from 'react'
import { PANDOCK, pandockAbi, stockOf } from '../config'
import { fmt } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Link from '../components/Link'
import Box from '../components/Box'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'
import PageHeader from './PageHeader'
import RevealStage, { type Result } from './RevealStage'
import type { Boxes } from './AppShell'
import type { Opening } from './useBoxes'

const KIND = { won: 'win', empty: 'empty', refund: 'refund', expired: 'expired' } as const

/** A stored opening, in the shape the result cards and the stage show. */
function toResult(o: Opening): Result {
  const kind = KIND[o.status as keyof typeof KIND]
  if (kind !== 'win') return { id: BigInt(o.id), kind, amount: o.amount ? fmt(BigInt(o.amount)) : undefined }
  const s = stockOf(o.token!)
  return { id: BigInt(o.id), kind, symbol: s.symbol, name: s.name, amount: fmt(BigInt(o.amount!)) }
}

const STACK = 5 // how many box drawings the sealed tile stacks, at most

export default function BoxesPage({ boxes }: { boxes: Boxes }) {
  const root = useRef<HTMLElement>(null)
  const [fresh, setFresh] = useState<Result[]>([])
  const [stage, setStage] = useState<{ id: bigint; from: DOMRect; result?: Result } | null>(null)
  const { balance, pending, setPending, revealed, busy, error, run, write, live } = boxes
  // This session's reveals first, then everything the database remembers (a reload keeps them).
  const stored = revealed.map(toResult).filter((r) => !fresh.some((f) => f.id === r.id))
  const results = [...fresh, ...stored]
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
    const box = root.current?.querySelector(`[data-box="${id}"] .waiting-box`)
    // The stage opens the moment the wallet signs, and waits there for the draw.
    const onSigned = () => box && setStage({ id, from: box.getBoundingClientRect() })
    const logs = await run(`reveal-${id}`, () => write({ address: PANDOCK!, abi: pandockAbi, functionName: 'reveal', args: [id] }), onSigned)
    if (!logs) return setStage(null)
    for (const l of logs) {
      let r: Result | null = null
      if (l.eventName === 'Revealed') {
        const s = stockOf(l.args.token)
        r = l.args.amount === 0n ? { id, kind: 'empty' } : { id, kind: 'win', symbol: s.symbol, name: s.name, amount: fmt(l.args.amount) }
      }
      if (l.eventName === 'Refunded') r = { id, kind: 'refund', amount: fmt(l.args.amount) }
      if (l.eventName === 'Expired') r = { id, kind: 'expired' }
      if (r) {
        const done = r
        setStage((st) => (st ? { ...st, result: done } : st))
        setPending((p) => p.filter((x) => x !== id))
        setFresh((rs) => [done, ...rs])
      }
    }
  }

  if (nothing)
    return (
      <section ref={root} className="app-page boxes-empty">
        <Box className="empty-box" />
        <PageHeader title="No boxes yet." lead="Buy a few, or ask a friend to gift you one. They show up here sealed.">
          <div className="ctas">
            <Link to="/app" className="btn-primary btn-large">Buy boxes</Link>
          </div>
        </PageHeader>
      </section>
    )

  return (
    <section ref={root} className="app-page">
      <PageHeader title="Your boxes." lead="Open them all at once, then reveal each one. Reveal within about an hour of opening, or the box is forfeited." />

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
                <div
                  key={id.toString()}
                  className={`waiting-card ${busy === `reveal-${id}` ? 'is-revealing' : ''} ${stage?.id === id ? 'is-staged' : ''}`}
                  data-box={id.toString()}
                >
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
      {stage && <RevealStage from={stage.from} result={stage.result} onClose={() => setStage(null)} />}
    </section>
  )
}
