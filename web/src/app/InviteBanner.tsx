import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSignMessage } from 'wagmi'
import { acceptMessage, clearRef, pendingRef } from '../referral'
import { useReferral } from './useReferral'


/** "@friend invited you": shown once a wallet is connected and this browser followed someone's invite link. */
export default function InviteBanner({ address }: { address: string }) {
  const [ref] = useState(pendingRef)
  const [state, setState] = useState<'idle' | 'signing' | 'done' | 'gone'>('idle')
  const [error, setError] = useState('')
  const { signMessageAsync } = useSignMessage()
  const client = useQueryClient()
  const mine = useReferral(address)
  const inviter = useQuery({
    queryKey: ['invite', ref],
    enabled: !!ref,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/referral?code=${ref}`)
      if (!res.ok) throw new Error('unknown invite')
      return ((await res.json()) as { name: string }).name
    },
  })

  // Nothing to accept: no invite, an unknown code, your own link, or this wallet already joined through someone.
  if (!ref || state === 'gone' || inviter.isError || !mine.data || mine.data.code === ref || (mine.data.referredBy && state !== 'done')) {
    if (ref && (inviter.isError || mine.data?.code === ref || mine.data?.referredBy)) clearRef()
    return null
  }

  const accept = async () => {
    setState('signing')
    setError('')
    try {
      const signature = await signMessageAsync({ message: acceptMessage(ref, address) })
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: ref, address, signature }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Could not accept the invite.')
      clearRef()
      setState('done')
      client.invalidateQueries({ queryKey: ['referral', address] })
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Could not accept the invite.')
      setState('idle')
    }
  }

  return (
    <div className="app-status invite-banner">
      <span className="status-dot status-dot-invite" aria-hidden="true" />
      {state === 'done' ? (
        <span className="caption">You joined through {inviter.data}. Your first box counts for both of you.</span>
      ) : (
        <>
          <span className="caption">{inviter.data ?? 'A friend'} invited you. Accept to count your boxes toward their score.</span>
          <button className="status-action" disabled={state === 'signing' || !inviter.data} onClick={accept}>
            {state === 'signing' ? 'Check wallet…' : 'Accept'}
          </button>
          <button className="status-dismiss" aria-label="Dismiss" onClick={() => (clearRef(), setState('gone'))}>
            ×
          </button>
        </>
      )}
      {error && <span className="caption error">{error}</span>}
    </div>
  )
}
