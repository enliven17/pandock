import { useRef, useState } from 'react'
import { isAddress, parseEventLogs, type Hash } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { PANDOCK, pandockAbi, stockOf } from '../config'
import { fmt } from '../format'
import { gsap, useGSAP } from '../motion'
import SplitReveal from '../components/SplitReveal'

type Result = { id: bigint; text: string; win: boolean }

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

export default function MyBoxes() {
  const root = useRef<HTMLElement>(null)
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [pending, setPending] = usePending(address)
  const [results, setResults] = useState<Result[]>([])
  const [recipients, setRecipients] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const { data: balance, refetch } = useReadContract({
    address: PANDOCK,
    abi: pandockAbi,
    functionName: 'balanceOf',
    args: [address!, 0n],
    query: { enabled: !!PANDOCK && !!address },
  })

  // Newest result pops in like a lid coming off.
  useGSAP(
    () => {
      if (!results.length) return
      gsap.from('.result:first-child', { scale: 0.6, opacity: 0, rotate: -6, duration: 0.9, ease: 'elastic.out(1, 0.55)' })
    },
    { scope: root, dependencies: [results.length] },
  )

  const run = async (label: string, send: () => Promise<Hash>) => {
    setBusy(label)
    setError('')
    try {
      const receipt = await client!.waitForTransactionReceipt({ hash: await send() })
      await refetch()
      return parseEventLogs({ abi: pandockAbi, logs: receipt.logs })
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed')
      return []
    } finally {
      setBusy('')
    }
  }

  const open = async () => {
    const logs = await run('open', () =>
      writeContractAsync({ address: PANDOCK!, abi: pandockAbi, functionName: 'open', args: [balance!] }),
    )
    const ids = logs.flatMap((l) => (l.eventName === 'Opened' ? [l.args.openingId] : []))
    setPending((p) => [...p, ...ids])
  }

  const reveal = async (id: bigint) => {
    const logs = await run(`reveal-${id}`, () =>
      writeContractAsync({ address: PANDOCK!, abi: pandockAbi, functionName: 'reveal', args: [id] }),
    )
    for (const l of logs) {
      let r: Result | null = null
      if (l.eventName === 'Revealed')
        r = l.args.amount === 0n
          ? { id, text: 'Empty this time', win: false }
          : { id, text: `${fmt(l.args.amount)} ${stockOf(l.args.token).symbol}`, win: true }
      if (l.eventName === 'Refunded') r = { id, text: `${fmt(l.args.amount)} USDC back`, win: false }
      if (l.eventName === 'Expired') r = { id, text: 'Expired unopened', win: false }
      if (r) {
        setPending((p) => p.filter((x) => x !== id))
        setResults((rs) => [r!, ...rs])
      }
    }
  }

  const list = recipients.split(/[\s,]+/).filter(Boolean)
  const valid = list.length > 0 && list.every((a) => isAddress(a))
  const gift = () =>
    run('gift', () =>
      writeContractAsync({ address: PANDOCK!, abi: pandockAbi, functionName: 'gift', args: [list as `0x${string}`[]] }),
    ).then(() => setRecipients(''))

  // Before a wallet is connected the odds section stands in for this one.
  if (!isConnected) return null

  return (
    <section id="boxes" ref={root} className="boxes">
      <SplitReveal>
        <h2 className="display-xl">My boxes.</h2>
      </SplitReveal>
      {(
        <div className="boxes-grid">
          <div className="panel" data-rise>
            <span className="caption muted">Sealed</span>
            <span className="count">{balance?.toString() ?? '0'}</span>
            <button className="btn-primary" disabled={!balance || !!busy} onClick={open}>
              {busy === 'open' ? 'Opening…' : 'Open all'}
            </button>
            {pending.map((id) => (
              <div key={id.toString()} className="item">
                <span className="body">Box {id.toString()}</span>
                <button className="btn-secondary" disabled={!!busy} onClick={() => reveal(id)}>
                  {busy === `reveal-${id}` ? 'Revealing…' : 'Reveal'}
                </button>
              </div>
            ))}
            <div className="results">
              {results.map((r) => (
                <div key={r.id.toString()} className={`item result ${r.win ? 'result-win' : ''}`}>
                  <span className="body">Box {r.id.toString()}</span>
                  <span className="body-strong">{r.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" data-rise>
            <span className="caption muted">Gift sealed boxes</span>
            <textarea
              className="input"
              rows={5}
              placeholder="0x… one address per line"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!valid || !!busy || (balance ?? 0n) < BigInt(list.length)}
              onClick={gift}
            >
              {busy === 'gift' ? 'Sending…' : `Gift ${list.length || ''} ${list.length === 1 ? 'box' : 'boxes'}`}
            </button>
          </div>
        </div>
      )}
      {error && <p className="caption error">{error}</p>}
    </section>
  )
}
