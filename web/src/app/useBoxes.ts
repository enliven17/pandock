import { useState } from 'react'
import { parseEventLogs, type Hash } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { chain, PANDOCK, pandockAbi } from '../config'

// ponytail: pending ids live in localStorage per wallet; switch to an event indexer if users open from many devices.
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
  const [pending, setPending] = usePending(address)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

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

  /** Sends one transaction, waits for it, refreshes the balance and returns the Pandock events it emitted. */
  const run = async (label: string, send: () => Promise<Hash>) => {
    setBusy(label)
    setError('')
    try {
      const receipt = await client!.waitForTransactionReceipt({ hash: await send() })
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
    busy,
    error,
    run,
    write: writeContractAsync,
  }
}
