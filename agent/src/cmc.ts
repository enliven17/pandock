// Second price opinion from the CoinMarketCap Pro API (Real World Assets): CMC's average tokenized
// price for each equity, against the ArcStocks oracle. Server-side only; the key stays in agent/.env.

const TTL = 3 * 60_000 // CMC refreshes every 60s; a cycle never spends a credit twice
let cache: { at: number; prices: Record<string, number> } | undefined

export async function cmcPrices(symbols: string[]): Promise<Record<string, number>> {
  const key = process.env.CMC_API_KEY
  if (!key) return {}
  if (cache && Date.now() - cache.at < TTL) return cache.prices
  try {
    const res = await fetch(
      `https://pro-api.coinmarketcap.com/v5/real-world-assets/quotes/latest?symbol=${symbols.join(',')}&skip_invalid=true`,
      { headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' } },
    )
    const body = (await res.json()) as { data?: { rwa_assets: { symbol: string; average_tokenized_price: number | null }[] } }
    const prices = Object.fromEntries(
      (body.data?.rwa_assets ?? []).flatMap((a) => (a.average_tokenized_price ? [[a.symbol, a.average_tokenized_price]] : [])),
    )
    cache = { at: Date.now(), prices }
    return prices
  } catch {
    return {} // unavailable → every stock is unconfirmed this cycle
  }
}
