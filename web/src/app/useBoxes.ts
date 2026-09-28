import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseEventLogs, type Hash } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { chain, PANDOCK, pandockAbi } from '../config'

/** A box as /api/boxes (web/api/boxes.ts) stores it, from the chain's own events. */
export type Opening = {
  id: string
  status: 'pending' | 'won' | 'empty' | 'refund' | 'expired'
  token: string | null
  amount: string | null
  openedAt: string
  revealedAt: string | null
}

/** Opened boxes and their results, from Neon via /api/boxes, so a reload or another device keeps them. */
function useOpenings(address?: string) {
  return useQuery({
    queryKey: ['openings', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/boxes?owner=${address}`)
      if (!res.ok) throw new Error('boxes unavailable')
      return (await res.json()) as { pending: Opening[]; revealed: Opening[] }
    },
  })
}

// Pending ids are also kept in localStorage per wallet: if /api/boxes is down, an opened box must still be
// revealable, since one left unrevealed for about an hour is forfeited.
function usePending(address?: string) {
  const key = `pandock.pending.${address}`
  const read = (k: string): bigint[] => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '[]').map(BigInt)
    } catch {
      return []
    }
  }
  // State is tagged with the wallet it belongs to; when the wallet changes it is re-read during render
  // (React's "adjust state when a prop changes" pattern) rather than via setState in an effect.
  const [state, setState] = useState(() => ({ key, ids: read(key) }))
  if (state.key !== key) setState({ key, ids: read(key) })
  const pending = state.key === key ? state.ids : read(key)
  const update = (f: (p: bigint[]) => bigint[]) =>
    setState((s) => {
      const next = f(s.ids)
      try {
        localStorage.setItem(key, JSON.stringify(next.map(String)))
      } catch {
        /* storage unavailable */
      }
      return { key: s.key, ids: next }
    })
  return [pending, update] as const
}

/** Everything the app pages share: the wallet, the box contract, and one way to send a transaction. */
export function useBoxes() {
  const { address, isConnected, chainId } = useAccount()
  const client = usePublicClient({ chainId: chain.id })
  const { writeContractAsync } = useWriteContract()
  const [local, setPending] = usePending(address)
  const openings = useOpenings(address)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Pending = what the database knows plus anything only this browser knows, minus anything already revealed.
  const done = new Set(openings.data?.revealed.map((o) => o.id))
  const pending = [...new Set([...(openings.data?.pending.map((o) => o.id) ?? []), ...local.map(String)])]
    .filter((id) => !done.has(id))
    .map(BigInt)
    .sort((a, b) => (a < b ? -1 : 1))

  const { data: balance, refetch } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'balanceOf',
    args: [address!, 0n],
    query: { enabled: !!PANDOCK && !!address },
  })
  const { data: price } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'boxPrice',
    query: { enabled: !!PANDOCK },
  })

  /** Sends one transaction, waits for it, records it, refreshes the balance and returns the Pandock events it emitted.
   *  `onSigned` fires once the wallet has signed and the transaction is on its way, before it is mined. */
  const run = async (label: string, send: () => Promise<Hash>, onSigned?: (hash: Hash) => void) => {
    setBusy(label)
    setError('')
    try {
      const hash = await send()
      onSigned?.(hash)
      const receipt = await client!.waitForTransactionReceipt({ hash })
      // Best effort: the chain is the record, the database only remembers it for the page.
      await fetch('/api/boxes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx: hash }) })
        .then(() => openings.refetch())
        .catch(() => {})
      await refetch()
      return parseEventLogs({ abi: pandockAbi, logs: receipt.logs })
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed')
      return null // failed: callers must not treat this like a mined transaction with no events
    } finally {
      setBusy('')
    }
  }

  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== chain.id,
    live: !!PANDOCK,
    balance: balance ?? 0n,
    price,
    pending,
    setPending,
    revealed: openings.data?.revealed ?? [],
    busy,
    error,
    run,
    write: writeContractAsync,
  }
}
