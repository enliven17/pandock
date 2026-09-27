import { PATHS } from './logos'

/** Single-colour brand mark; inherits currentColor. ETFs (SPY, QQQ) have none and render nothing. */
export default function Logo({ symbol, className }: { symbol: string; className?: string }) {
  const d = PATHS[symbol]
  if (!d) return null
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
