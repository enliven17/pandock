import { useQuery } from '@tanstack/react-query'

// Shape returned by /api/rwa (web/api/rwa.ts), which wraps CoinMarketCap's
// GET /v5/real-world-assets/quotes/latest. Kept in sync by hand: the api folder is server code.
export type RwaToken = {
  symbol: string
  name: string
  issuer: string | null
  price: number | null
  marketCap: number | null
  volume24h: number | null
}
export type RwaAsset = {
  rwaId: number
  symbol: string
  name: string
  type: string
  price: number | null // CMC average tokenized price across issuers, USD
  marketCap: number | null
  volume24h: number | null
  lastUpdated: string
  tokens: RwaToken[]
}
export type RwaPayload = { endpoint: string; fetchedAt: string; creditCount: number; assets: RwaAsset[] }

/** Tokenized-equity market data from CoinMarketCap, via our own server route (the key never reaches the browser). */
export function useRwa() {
  return useQuery({
    queryKey: ['cmc-rwa'],
    refetchInterval: 60_000, // CMC refreshes these quotes every 60s
    retry: 1,
    queryFn: async (): Promise<RwaPayload> => {
      const res = await fetch('/api/rwa')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `CMC data unavailable (${res.status})`)
      return body
    },
  })
}

export const bySymbol = (payload?: RwaPayload) =>
  Object.fromEntries((payload?.assets ?? []).map((a) => [a.symbol, a])) as Record<string, RwaAsset | undefined>

/** Signed gap of our on-chain price from the market price, as a fraction (0.004 = +0.4%). */
export const gap = (ours?: number, market?: number | null) =>
  ours !== undefined && market ? ours / market - 1 : undefined

/** Past this gap the price is flagged, the same tolerance the Treasurer agent uses before acting. */
export const TOLERANCE = 0.02

export const signedPct = (g: number) => `${g >= 0 ? '+' : '−'}${Math.abs(g * 100).toFixed(2)}%`
export const compactUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
