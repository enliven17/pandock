// GET /api/rwa — tokenized-equity market data for the stocks inside a Pandock box, from the
// CoinMarketCap Pro API (Real World Assets). Runs server-side only: the CMC key never reaches the browser.
//
// One call to /v5/real-world-assets/quotes/latest covers all 29 assets (1 credit per 250 assets),
// and CMC refreshes it every 60s, so responses are cached for 60s at the edge.
// `?raw=1` returns CMC's untouched response body, which the site shows as evidence of the call.

const CMC = 'https://pro-api.coinmarketcap.com'
// Must match web/src/config.ts STOCKS (all 29 ArcStocks tokens). Still one credit: quotes/latest
// bills 1 per 250 assets. Symbols CMC doesn't track are skipped (skip_invalid).
export const SYMBOLS = [
  'NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ', 'SGOV', 'CRCL', 'USO', 'SPCX', 'GLD', 'GME', 'MU',
  'RDDT', 'HIMS', 'MSTR', 'MSFT', 'AMC', 'COST', 'LLY', 'INTC', 'DJT', 'DELL', 'AMD', 'RBLX', 'SLV', 'AVGO',
]

type CmcToken = {
  symbol: string
  name: string
  price: number | null
  issuer_name: string | null
  market_cap: number | null
  volume_24h: number | null
}
type CmcAsset = {
  rwa_id: number
  name: string
  symbol: string
  asset_type: string
  average_tokenized_price: number | null
  tokenized_market_cap: number | null
  tokenized_volume_24h: number | null
  last_updated: string
  tokens?: CmcToken[]
}
type CmcResponse = {
  data: { rwa_assets: CmcAsset[] } | null
  status: { timestamp: string; error_code: number; error_message: string | null; credit_count: number }
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
  tokens: { symbol: string; name: string; issuer: string | null; price: number | null; marketCap: number | null; volume24h: number | null }[]
}
export type RwaPayload = {
  endpoint: string
  fetchedAt: string
  creditCount: number
  assets: RwaAsset[]
}

const json = (body: unknown, status = 200, cache = true) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // CMC updates this data every 60s; don't spend credits faster than it changes.
      'cache-control': cache ? 'public, s-maxage=60, stale-while-revalidate=120' : 'no-store',
    },
  })

export async function GET(request: Request): Promise<Response> {
  const key = process.env.CMC_API_KEY
  if (!key) return json({ error: 'CMC_API_KEY is not configured on the server' }, 503, false)

  const endpoint = `/v5/real-world-assets/quotes/latest?symbol=${SYMBOLS.join(',')}&skip_invalid=true`
  let res: globalThis.Response
  try {
    res = await fetch(CMC + endpoint, { headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' } })
  } catch {
    return json({ error: 'Could not reach CoinMarketCap' }, 502, false)
  }
  const body = (await res.json().catch(() => null)) as CmcResponse | null
  if (!res.ok || !body?.data) {
    // Pass CMC's own message through (never the key) so a bad plan or a typo is diagnosable.
    return json({ error: body?.status?.error_message ?? `CoinMarketCap returned ${res.status}` }, 502, false)
  }

  if (new URL(request.url).searchParams.get('raw')) return json(body)

  const payload: RwaPayload = {
    endpoint: `GET ${endpoint}`,
    fetchedAt: body.status.timestamp,
    creditCount: body.status.credit_count,
    assets: body.data.rwa_assets.map((a) => ({
      rwaId: a.rwa_id,
      symbol: a.symbol,
      name: a.name,
      type: a.asset_type,
      price: a.average_tokenized_price,
      marketCap: a.tokenized_market_cap,
      volume24h: a.tokenized_volume_24h,
      lastUpdated: a.last_updated,
      tokens: (a.tokens ?? []).map((t) => ({
        symbol: t.symbol,
        name: t.name,
        issuer: t.issuer_name,
        price: t.price,
        marketCap: t.market_cap,
        volume24h: t.volume_24h,
      })),
    })),
  }
  return json(payload)
}
