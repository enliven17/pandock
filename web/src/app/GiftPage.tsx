import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { isAddress } from 'viem'
import { PANDOCK, pandockAbi } from '../config'
import { short } from '../format'
import { gsap, reducedMotion, useGSAP } from '../motion'
import Link from '../components/Link'
import Box from '../components/Box'
import Magnetic from '../components/Magnetic'
import PageHeader from './PageHeader'
import type { Boxes } from './AppShell'

const SHOW = 10 // box drawings in the summary, at most

export default function GiftPage({ boxes }: { boxes: Boxes }) {
  const root = useRef<HTMLElement>(null)
  const [recipients, setRecipients] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState(0)
  const { balance, busy, error, run, write, live } = boxes

  const valid = recipients.filter((a) => isAddress(a))
  const invalid = recipients.length - valid.length
  const enough = balance >= BigInt(recipients.length)

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('.gift-grid > *', { y: 28, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.2 })
    },
    { scope: root },
  )
  // Each new recipient's box drops into the summary.
  useGSAP(
    () => {
      if (!recipients.length || reducedMotion()) return
      gsap.from('.gift-boxes .gift-box:last-of-type', { y: -30, opacity: 0, duration: 0.6, ease: 'back.out(2)' })
    },
    { scope: root, dependencies: [recipients.length] },
  )

  // Paste a list or type one address and press Enter / comma / space: each becomes a chip.
  const add = (text: string) => {
    const parts = text.split(/[\s,;]+/).filter(Boolean)
    if (parts.length) setRecipients((r) => [...r, ...parts.filter((p) => !r.includes(p))])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && recipients.length) {
      setRecipients((r) => r.slice(0, -1))
    }
  }
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    add(e.clipboardData.getData('text'))
  }

  const gift = async () => {
    const list = valid as `0x${string}`[]
    const logs = await run('gift', () => write({ address: PANDOCK!, abi: pandockAbi, functionName: 'gift', args: [list] }))
    // gift() emits ERC-1155 TransferSingle events, which aren't in our ABI; a mined receipt is the success signal.
    if (logs) {
      setSent(list.length)
      setRecipients([])
    }
  }

  return (
    <section ref={root} className="app-page">
      <PageHeader
        kicker="Gift"
        title={<>Nobody knows<br />what’s inside.</>}
        lead="Send one sealed box to each address, all in one transaction. They open it themselves."
      />

      <div className="gift-grid">
        <div className="gift-input-card">
          <label className="caption muted" htmlFor="gift-to">Recipients</label>
          <div className="chips-input" onClick={() => document.getElementById('gift-to')?.focus()}>
            {recipients.map((a) => (
              <span key={a} className={`addr-chip ${isAddress(a) ? '' : 'is-invalid'}`} title={a}>
                {isAddress(a) ? short(a) : a}
                <button aria-label={`Remove ${a}`} onClick={() => setRecipients((r) => r.filter((x) => x !== a))}>
                  ×
                </button>
              </span>
            ))}
            <input
              id="gift-to"
              className="chips-field"
              placeholder={recipients.length ? '' : 'Paste addresses or type 0x… and press Enter'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
              onBlur={() => draft && add(draft)}
            />
          </div>
          {invalid > 0 && (
            <p className="caption error">
              {invalid} {invalid === 1 ? 'entry isn’t' : 'entries aren’t'} a valid address. Remove {invalid === 1 ? 'it' : 'them'} to continue.
            </p>
          )}
          {sent > 0 && (
            <p className="body-strong">
              Sent {sent} sealed {sent === 1 ? 'box' : 'boxes'}.
            </p>
          )}
        </div>

        <div className="gift-summary">
          <div className="gift-boxes" aria-hidden="true">
            {recipients.length ? (
              recipients.slice(0, SHOW).map((a) => <Box key={a} className="gift-box" />)
            ) : (
              <Box className="gift-box is-ghost" />
            )}
            {recipients.length > SHOW && <span className="gift-more">+{recipients.length - SHOW}</span>}
          </div>
          <div className="gift-numbers">
            <span className="sealed-count">{recipients.length}</span>
            <span className="caption muted-dark">to send · you have {balance.toString()} sealed</span>
          </div>
          {!enough && (
            <p className="caption gift-short">
              {recipients.length - Number(balance)} short. <Link to="/app">Buy more</Link>
            </p>
          )}
          <Magnetic>
            <button
              className="btn-light btn-large gift-cta"
              disabled={!live || !recipients.length || invalid > 0 || !enough || !!busy}
              onClick={gift}
            >
              {busy === 'gift' ? 'Sending…' : `Gift ${recipients.length || ''} ${recipients.length === 1 ? 'box' : 'boxes'}`}
            </button>
          </Magnetic>
        </div>
      </div>
      {error && <p className="caption error">{error}</p>}
    </section>
  )
}
