import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { GIFT_JAR, jarAbi, PANDOCK, pandockAbi, TELEGRAM_BOT } from '../config'
import Link from '../components/Link'
import type { Boxes } from './AppShell'

/** Park boxes in the gift jar so /gift in Telegram can send them; take them back any time. */
export default function TelegramGifting({ boxes }: { boxes: Boxes }) {
  const { address, balance, busy, run, write } = boxes
  const [n, setN] = useState(1)
  const { data: parked = 0n, refetch } = useReadContract({
    address: GIFT_JAR,
    abi: jarAbi,
    functionName: 'deposits',
    args: [address!],
    query: { enabled: !!GIFT_JAR && !!address },
  })
  const { data: limit } = useReadContract({ address: GIFT_JAR, abi: jarAbi, functionName: 'dailyLimit', query: { enabled: !!GIFT_JAR } })
  if (!GIFT_JAR || !address) return null
  const jar = GIFT_JAR

  const amount = BigInt(n)
  // Parking is a plain transfer to the jar; the jar credits whoever sent it.
  const park = async () => {
    if (await run('park', () => write({ address: PANDOCK!, abi: pandockAbi, functionName: 'safeTransferFrom', args: [address, jar, 0n, amount, '0x'] }))) refetch()
  }
  const unpark = async () => {
    if (await run('unpark', () => write({ address: jar, abi: jarAbi, functionName: 'withdraw', args: [amount] }))) refetch()
  }

  return (
    <div className="tg-gifting">
      <div className="tg-copy">
        <span className="caption muted">Gift from Telegram</span>
        <h3 className="tg-title">Send boxes with a message.</h3>
        <p className="body muted">
          Park a few boxes here, then write <code>/gift @friend 1</code> in any chat with{' '}
          <a href={`https://t.me/${TELEGRAM_BOT}`} target="_blank" rel="noreferrer">@{TELEGRAM_BOT}</a>, or reply to someone with <code>/gift 1</code>.
          Friends without a linked wallet get theirs held until they <Link to="/app/link">link one</Link>
          {limit ? `. Up to ${limit} a day.` : '.'}
        </p>
        <p className="caption muted">
          First time? Send <code>/link</code> to @{TELEGRAM_BOT} in a private chat.
        </p>
      </div>
      <div className="tg-controls">
        <span className="sealed-count">{parked.toString()}</span>
        <span className="caption muted-dark">parked · {balance.toString()} sealed in your wallet</span>
        <div className="tg-row">
          <input
            className="input tg-amount"
            type="number"
            min={1}
            max={50}
            value={n}
            aria-label="Boxes"
            onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          />
          <button className="btn-light" disabled={!!busy || balance < amount} onClick={park}>
            {busy === 'park' ? 'Parking…' : 'Park'}
          </button>
          <button className="btn-light" disabled={!!busy || parked < amount} onClick={unpark}>
            {busy === 'unpark' ? 'Taking back…' : 'Take back'}
          </button>
        </div>
      </div>
    </div>
  )
}
