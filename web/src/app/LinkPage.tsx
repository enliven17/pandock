import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSignMessage } from 'wagmi'
import { TELEGRAM_BOT } from '../config'
import { short } from '../format'
import { linkMessage } from '../linkMessage'
import Link from '../components/Link'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

/** /app/link?code=… — opened from the bot's /link reply: sign once to pair Telegram with this wallet. */
export default function LinkPage({ boxes }: { boxes: Boxes }) {
  const code = new URLSearchParams(window.location.search).get('code') ?? ''
  const { signMessageAsync } = useSignMessage()
  const [state, setState] = useState<'idle' | 'signing' | 'done'>('idle')
  const [error, setError] = useState('')
  const account = useQuery({
    queryKey: ['link', code],
    enabled: !!code,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/link?code=${encodeURIComponent(code)}`)
      const body = (await res.json()) as { username: string | null; tgUserId: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'This link does not work.')
      return body
    },
  })

  const sign = async () => {
    if (!account.data || !boxes.address) return
    setState('signing')
    setError('')
    try {
      const { username, tgUserId } = account.data
      const signature = await signMessageAsync({ message: linkMessage(username, tgUserId, boxes.address, code) })
      const res = await fetch('/api/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, address: boxes.address, signature }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Could not link.')
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Could not link.')
      setState('idle')
    }
  }

  const who = account.data?.username ? `@${account.data.username}` : 'your Telegram account'
  if (!code || account.isError)
    return (
      <section className="app-page">
        <PageHeader
          title="Link Telegram."
          lead={account.error?.message ?? <>Send /link to <a href={`https://t.me/${TELEGRAM_BOT}`}>@{TELEGRAM_BOT}</a> in a private chat and open the link it sends you.</>}
        />
      </section>
    )

  return (
    <section className="app-page">
      {state === 'done' ? (
        <PageHeader title="Linked." lead={`${who} now sends and receives boxes as ${short(boxes.address!)}. Anything held for you arrives in a moment.`}>
          <div className="ctas">
            <Link to="/app/gift" className="btn-primary btn-large">Park boxes for gifting</Link>
          </div>
        </PageHeader>
      ) : (
        <PageHeader
          title={<>Link {who}<br />to this wallet.</>}
          lead={<>Sign once with {boxes.address ? short(boxes.address) : 'your wallet'}. It costs nothing and moves nothing; it only proves both are yours.</>}
        >
          <button className="btn-primary btn-large" disabled={!account.data || state === 'signing'} onClick={sign}>
            {state === 'signing' ? 'Check your wallet…' : 'Sign to link'}
          </button>
          {error && <p className="caption error">{error}</p>}
        </PageHeader>
      )}
    </section>
  )
}
