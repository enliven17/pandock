import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { short } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import { INVITE_POINTS } from '../referral'
import { useReferral } from './useReferral'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

type Row = { rank: number; wallet: string; bought: number; opened: number; invites: number; score: number; telegram: string | null }

/** Your invite link, how it is doing, and one tap to post it on X (the link unfurls into a card with your standing). */
function InvitePanel({ address, me }: { address: string; me: Row | null | undefined }) {
  const { data } = useReferral(address)
  const [copied, setCopied] = useState(false)
  if (!data) return null
  const link = `${window.location.origin}/r/${data.code}`
  const text = me
    ? `I'm #${me.rank} on the Pandock testnet leaderboard with ${me.score} points. Sealed boxes of tokenized stocks, 0.10 USDC each. Grab one with my link:`
    : 'Sealed boxes of tokenized stocks, 0.10 USDC each, now on testnet. Grab one with my link:'
  const share = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: the link is on screen to copy by hand */
    }
  }

  return (
    <div className="invite-panel">
      <div className="invite-copy">
        <span className="caption muted">Your invite link</span>
        <span className="invite-link">{link.replace(/^https?:\/\//, '')}</span>
        <span className="caption muted">
          {data.invites} friend{data.invites === 1 ? '' : 's'} joined and bought
          {data.pending ? ` · ${data.pending} joined, no box yet` : ''}
        </span>
      </div>
      <div className="invite-actions">
        <button className="btn-light" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
        <a className="btn-primary" href={share} target="_blank" rel="noreferrer">Share on X</a>
      </div>
    </div>
  )
}

/** /app/leaderboard — open to everyone, wallet or not. */
export default function LeaderboardPage({ boxes }: { boxes: Boxes }) {
  const me = boxes.address?.toLowerCase()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', me],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard${me ? `?address=${me}` : ''}`)
      if (!res.ok) throw new Error('leaderboard unavailable')
      return (await res.json()) as { rows: Row[]; me?: Row | null }
    },
  })
  const rows = data?.rows

  useGSAP(
    () => {
      if (!rows?.length || reducedMotion()) return
      gsap.fromTo('.lb-row', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.04 })
    },
    { dependencies: [rows?.length] },
  )

  return (
    <section className="app-page">
      <PageHeader
        title="Leaderboard."
        lead={`Testnet points: 1 for every box you buy, ${INVITE_POINTS} for every friend who joins with your link and buys one.`}
      />
      {boxes.address && <InvitePanel address={boxes.address} me={data?.me} />}
      {isLoading ? (
        <p className="body muted">Loading…</p>
      ) : isError ? (
        <p className="caption error">The leaderboard is unavailable right now.</p>
      ) : !rows?.length ? (
        <p className="body muted">No boxes bought yet. Be the first.</p>
      ) : (
        <ol className="lb-list">
          <li className="lb-row lb-head" aria-hidden="true">
            <span>#</span>
            <span>Player</span>
            <span className="lb-num">Boxes</span>
            <span className="lb-num">Invites</span>
            <span className="lb-num">Score</span>
          </li>
          {rows.map((r) => (
            <li key={r.wallet} className={`lb-row ${r.rank <= 3 ? 'is-top' : ''} ${r.wallet === me ? 'is-me' : ''}`}>
              <span className="lb-rank">{r.rank}</span>
              <span className="lb-who">
                <span className="body-strong">{r.telegram ? `@${r.telegram}` : short(r.wallet)}</span>
                {(r.telegram || r.wallet === me) && (
                  <span className="caption muted">
                    {r.telegram ? short(r.wallet) : ''}
                    {r.wallet === me ? `${r.telegram ? ' · ' : ''}you` : ''}
                  </span>
                )}
              </span>
              <span className="lb-num muted">{r.bought}</span>
              <span className="lb-num muted">{r.invites}</span>
              <span className="lb-num lb-bought">{r.score}</span>
            </li>
          ))}
          {data?.me && !rows.some((r) => r.wallet === me) && (
            <li className="lb-row is-me">
              <span className="lb-rank">{data.me.rank}</span>
              <span className="lb-who"><span className="body-strong">you</span></span>
              <span className="lb-num muted">{data.me.bought}</span>
              <span className="lb-num muted">{data.me.invites}</span>
              <span className="lb-num lb-bought">{data.me.score}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  )
}
