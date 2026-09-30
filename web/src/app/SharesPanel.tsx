import { useState } from 'react'
import { formatUnits, maxUint256 } from 'viem'
import { useReadContracts } from 'wagmi'
import { chain, deskAbi, erc20Abi, prizeTokens, SHARE_DESK, stockOf } from '../config'
import Logo from '../components/Logo'
import { hasLogo } from '../components/logos'
import type { Boxes } from './AppShell'

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 3 : 2 })
const shares = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: 3 })

/** The stock a wallet's boxes paid out: sell it back for USDC, or trade it in for new sealed boxes. */
export default function SharesPanel({ boxes }: { boxes: Boxes }) {
  const { address, price, busy, run, write } = boxes
  const [step, setStep] = useState('')
  const tokens = prizeTokens()
  const desk = SHARE_DESK

  const held = useReadContracts({
    allowFailure: false,
    contracts: tokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: 'balanceOf' as const, args: [address!] as const, chainId: chain.id },
      { address: t, abi: erc20Abi, functionName: 'allowance' as const, args: [address!, desk!] as const, chainId: chain.id },
    ]),
    query: { enabled: !!desk && !!address },
  })
  const rows = tokens
    .map((token, i) => ({ token, balance: (held.data?.[2 * i] as bigint | undefined) ?? 0n, allowance: (held.data?.[2 * i + 1] as bigint | undefined) ?? 0n }))
    .filter((r) => r.balance > 0n)
  // What the desk would pay, exactly: its own quote for each holding.
  const quotes = useReadContracts({
    allowFailure: false,
    contracts: rows.map((r) => ({ address: desk!, abi: deskAbi, functionName: 'quote' as const, args: [r.token, r.balance] as const, chainId: chain.id })),
    query: { enabled: !!desk && rows.length > 0 },
  })
  if (!desk || !address || !rows.length) return null

  const values = rows.map((_, i) => (quotes.data?.[i] as bigint | undefined) ?? 0n)
  const total = values.reduce((a, b) => a + b, 0n)
  const boxesFor = price ? total / price : 0n
  const change = price ? total - boxesFor * price : 0n

  /** One approval per token the first time, then the action itself. */
  const go = async (label: string, fn: 'sellAll' | 'trade') => {
    for (const r of rows.filter((r) => r.allowance < r.balance)) {
      setStep(`Approve ${stockOf(r.token).symbol}…`)
      if (!(await run(label, () => write({ address: r.token, abi: erc20Abi, functionName: 'approve', args: [desk, maxUint256] })))) return setStep('')
    }
    setStep('')
    const args = [rows.map((r) => r.token), rows.map((r) => r.balance)] as const
    if (await run(label, () => write({ address: desk, abi: deskAbi, functionName: fn, args }))) {
      held.refetch()
      quotes.refetch()
    }
  }

  return (
    <div className="shares">
      <span className="caption muted">Your shares</span>
      <div className="shares-card">
        <ul className="shares-list">
          {rows.map((r, i) => {
            const s = stockOf(r.token)
            return (
              <li key={r.token} className="shares-row">
                {hasLogo(s.symbol) ? <Logo symbol={s.symbol} className="shares-logo" /> : <span className="shares-logo" />}
                <span className="body-strong">{s.symbol}</span>
                <span className="caption muted">{shares(Number(formatUnits(r.balance, 18)))} sh</span>
                <span className="shares-value">{usd(Number(formatUnits(values[i], 18)))}</span>
              </li>
            )
          })}
        </ul>
        <div className="shares-actions">
          <span className="caption muted">Worth {usd(Number(formatUnits(total, 18)))} at today’s price</span>
          <button className="btn-primary" disabled={!!busy || boxesFor === 0n} onClick={() => go('trade', 'trade')}>
            {busy === 'trade' ? step || 'Trading…' : boxesFor > 0n ? `Trade for ${boxesFor} box${boxesFor > 1n ? 'es' : ''}` : 'Not enough for a box yet'}
          </button>
          {boxesFor > 0n && change > 0n && <span className="caption muted">plus {usd(Number(formatUnits(change, 18)))} back in USDC</span>}
          <button className="btn-light" disabled={!!busy || total === 0n} onClick={() => go('sell', 'sellAll')}>
            {busy === 'sell' ? step || 'Selling…' : `Sell all for ${usd(Number(formatUnits(total, 18)))}`}
          </button>
        </div>
      </div>
    </div>
  )
}
