import { useState } from 'react'
import { isAddress } from 'viem'
import { PANDOCK, pandockAbi } from '../config'
import Link from '../components/Link'
import type { Boxes } from './AppShell'

export default function GiftPage({ boxes }: { boxes: Boxes }) {
  const [recipients, setRecipients] = useState('')
  const [sent, setSent] = useState(0)
  const { balance, busy, error, run, write, live } = boxes

  const list = recipients.split(/[\s,]+/).filter(Boolean)
  const invalid = list.filter((a) => !isAddress(a))
  const enough = balance >= BigInt(list.length)

  const gift = async () => {
    const logs = await run('gift', () =>
      write({ address: PANDOCK!, abi: pandockAbi, functionName: 'gift', args: [list as `0x${string}`[]] }),
    )
    // gift() emits ERC-1155 TransferSingle events, which aren't in our ABI; a mined receipt is the success signal.
    if (logs) {
      setSent(list.length)
      setRecipients('')
    }
  }

  return (
    <section className="app-page gift-page">
      <div className="app-card">
        <span className="caption muted">Gift sealed boxes</span>
        <h1 className="display-lg">Nobody knows what’s inside.</h1>
        <p className="body muted">
          One sealed box to each address, in a single transaction. You have {balance.toString()} to give.
        </p>
        <textarea
          className="input"
          rows={6}
          placeholder="0x… one address per line"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          aria-invalid={invalid.length > 0}
        />
        {invalid.length > 0 && <p className="caption error">Not an address: {invalid[0]}</p>}
        {list.length > 0 && !enough && (
          <p className="caption error">
            That’s {list.length} boxes and you have {balance.toString()}. <Link to="/app">Buy more</Link>
          </p>
        )}
        <button
          className="btn-primary btn-large"
          disabled={!live || !list.length || invalid.length > 0 || !enough || !!busy}
          onClick={gift}
        >
          {busy === 'gift' ? 'Sending…' : `Gift ${list.length || ''} ${list.length === 1 ? 'box' : 'boxes'}`}
        </button>
        {sent > 0 && (
          <p className="body-strong">
            Sent {sent} sealed {sent === 1 ? 'box' : 'boxes'}.
          </p>
        )}
        {error && <p className="caption error">{error}</p>}
      </div>
    </section>
  )
}
