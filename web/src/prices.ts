import { createPublicClient, http } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { ARC_ORACLE, arcMainnet, oracleAbi, STOCKS } from './config'

// Prices always come from the ArcStocks oracle on Arc mainnet, even when the app runs on testnet.
const mainnet = createPublicClient({ chain: arcMainnet, transport: http() })

/** symbol → USD price, refreshed every 30s. Missing entries mean the oracle read failed. */
export function usePrices() {
  return useQuery({
    queryKey: ['arcstocks-prices'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const stocks = Object.values(STOCKS)
      const res = await mainnet.multicall({
        contracts: stocks.map((s) => ({
          address: ARC_ORACLE,
          abi: oracleAbi,
          functionName: 'getPrice' as const,
          args: [s.underlying] as const,
        })),
      })
      return Object.fromEntries(
        stocks.flatMap((s, i) => (res[i].status === 'success' ? [[s.symbol, Number(res[i].result) / 1e6]] : [])),
      ) as Record<string, number>
    },
  })
}

export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
