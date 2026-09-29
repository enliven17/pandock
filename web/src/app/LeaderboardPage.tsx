import { useQuery } from '@tanstack/react-query'
import { short } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

type Row = { wallet: string; bought: number; opened: number; telegram: string | null }

/** /app/leaderboard — open to everyone, wallet or not. */
export default function LeaderboardPage({ boxes }: { boxes: Boxes }) {
  const me = boxes.address?.toLowerCase()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch('/api/leaderboard')
      if (!res.ok) throw new Error('leaderboard unavailable')
      return ((await res.json()) as { rows: Row[] }).rows
    },
  })

  useGSAP(
    () => {
      if (!data?.length || reducedMotion()) return
      gsap.fromTo('.lb-row', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.04 })
    },
    { dependencies: [data?.length] },
  )

  return (
    <section className="app-page">
      <PageHeader title="Leaderboard." lead="Who has bought the most boxes. Counted from the contract’s own purchase events." />
      {isLoading ? (
        <p className="body muted">Loading…</p>
      ) : isError ? (
        <p className="caption error">The leaderboard is unavailable right now.</p>
      ) : !data?.length ? (
        <p className="body muted">No boxes bought yet. Be the first.</p>
      ) : (
        <ol className="lb-list">
          <li className="lb-row lb-head" aria-hidden="true">
            <span>#</span>
            <span>Buyer</span>
            <span className="lb-num">Opened</span>
            <span className="lb-num">Bought</span>
          </li>
          {data.map((r, i) => (
            <li key={r.wallet} className={`lb-row ${i < 3 ? 'is-top' : ''} ${r.wallet === me ? 'is-me' : ''}`}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-who">
                <span className="body-strong">{r.telegram ? `@${r.telegram}` : short(r.wallet)}</span>
                {(r.telegram || r.wallet === me) && (
                  <span className="caption muted">
                    {r.telegram ? short(r.wallet) : ''}
                    {r.wallet === me ? `${r.telegram ? ' · ' : ''}you` : ''}
                  </span>
                )}
              </span>
              <span className="lb-num muted">{r.opened}</span>
              <span className="lb-num lb-bought">{r.bought}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
