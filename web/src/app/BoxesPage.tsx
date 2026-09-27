import { useRef, useState } from 'react'
import { PANDOCK, pandockAbi, stockOf } from '../config'
import { fmt } from '../format'
import { gsap, useGSAP } from '../motion'
import Link from '../components/Link'
import Logo from '../components/Logo'
import type { Boxes } from './AppShell'

type Result = { id: bigint; text: string; symbol?: string; win: boolean }

export default function BoxesPage({ boxes }: { boxes: Boxes }) {
  const root = useRef<HTMLElement>(null)
  const [results, setResults] = useState<Result[]>([])
  const { balance, pending, setPending, busy, error, run, write, live } = boxes

  // Newest result pops in like a lid coming off.
  useGSAP(
    () => {
      if (!results.length) return
      gsap.from('.result:first-child', { scale: 0.6, opacity: 0, rotate: -6, duration: 0.9, ease: 'elastic.out(1, 0.55)' })
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
        r = l.args.amount === 0n
          ? { id, text: 'Empty this time', win: false }
          : { id, text: `${fmt(l.args.amount)} ${s.symbol}`, symbol: s.symbol, win: true }
      }
      if (l.eventName === 'Refunded') r = { id, text: `${fmt(l.args.amount)} USDC back`, win: false }
      if (l.eventName === 'Expired') r = { id, text: 'Expired unopened', win: false }
      if (r) {
        setPending((p) => p.filter((x) => x !== id))
        setResults((rs) => [r!, ...rs])
      }
    }
  }

  return (
    <section ref={root} className="app-page boxes-page">
      <div className="app-card">
        <span className="caption muted">Sealed</span>
        <span className="count">{balance.toString()}</span>
        {balance > 0n ? (
          <button className="btn-primary" disabled={!live || !!busy} onClick={open}>
            {busy === 'open' ? 'Opening…' : `Open ${balance === 1n ? 'it' : `all ${balance}`}`}
          </button>
        ) : (
          <p className="body muted">
            No sealed boxes. <Link to="/app">Buy some</Link> or ask a friend to gift you one.
          </p>
        )}
        <p className="caption muted">
          Opening commits to the next block; reveal it within about an hour, or the box is forfeited.
        </p>
      </div>

      <div className="app-card">
        <span className="caption muted">Waiting to be revealed</span>
        {pending.length ? (
          pending.map((id) => (
            <div key={id.toString()} className="item">
              <span className="body">Box {id.toString()}</span>
              <button className="btn-secondary" disabled={!!busy} onClick={() => reveal(id)}>
                {busy === `reveal-${id}` ? 'Revealing…' : 'Reveal'}
              </button>
            </div>
          ))
        ) : (
          <p className="body muted">Nothing waiting.</p>
        )}

        {results.length > 0 && <span className="caption muted results-head">Revealed</span>}
        <div className="results">
          {results.map((r) => (
            <div key={r.id.toString()} className={`item result ${r.win ? 'result-win' : ''}`}>
              <span className="body">Box {r.id.toString()}</span>
              <span className="body-strong result-prize">
                {r.symbol && <Logo symbol={r.symbol} className="result-logo" />}
                {r.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="caption error">{error}</p>}
    </section>
  )
}
