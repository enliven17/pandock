import { ARC_ORACLE, client, erc20Abi, mainnet, MARKET, marketAbi, oracleAbi, PANDOCK, pandockAbi, STOCKS, UNDERLYING } from './chain.js'

export type Prize = { token: `0x${string}`; weight: bigint; amount: bigint }
export type StockState = { token: `0x${string}`; pool: bigint; oracle: bigint; market: bigint }
export type State = Awaited<ReturnType<typeof observe>>

const SCAN = 1000n // ponytail: liabilities scan the last 1000 openings; index events if boxes outgrow that

/** One read of everything the Treasurer decides on. Prices are USD with 6 decimals, amounts 18. */
export async function observe() {
  const symbols = Object.keys(STOCKS)
  const p = { address: PANDOCK, abi: pandockAbi } as const
  const [block, usdc, boxPrice, table, next, minBps, maxBps, cap, spentDay, spentToday] = await Promise.all([
    client.getBlock(),
    client.getBalance({ address: PANDOCK }),
    client.readContract({ ...p, functionName: 'boxPrice' }),
    client.readContract({ ...p, functionName: 'prizes' }),
    client.readContract({ ...p, functionName: 'nextOpeningId' }),
    client.readContract({ ...p, functionName: 'payoutMinBps' }),
    client.readContract({ ...p, functionName: 'payoutMaxBps' }),
    client.readContract({ ...p, functionName: 'dailyCap' }),
    client.readContract({ ...p, functionName: 'spentDay' }),
    client.readContract({ ...p, functionName: 'spentToday' }),
  ])

  const [pools, marketPx, oraclePx] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: symbols.map((s) => ({ address: STOCKS[s], abi: erc20Abi, functionName: 'balanceOf' as const, args: [PANDOCK] as const })),
    }),
    client.multicall({
      allowFailure: false,
      contracts: symbols.map((s) => ({ address: MARKET, abi: marketAbi, functionName: 'priceOf' as const, args: [STOCKS[s]] as const })),
    }),
    mainnet.multicall({
      contracts: symbols.map((s) => ({ address: ARC_ORACLE, abi: oracleAbi, functionName: 'getPrice' as const, args: [UNDERLYING[s]] as const })),
    }),
  ])

  const from = next > SCAN ? next - SCAN : 0n
  const ids = Array.from({ length: Number(next - from) }, (_, i) => from + BigInt(i))
  const openings = ids.length
    ? await client.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({ ...p, functionName: 'openings' as const, args: [id] as const })),
      })
    : []
  const pending = ids.filter((_, i) => openings[i][0] !== '0x0000000000000000000000000000000000000000')

  const stocks: Record<string, StockState> = Object.fromEntries(
    symbols.map((s, i) => [
      s,
      {
        token: STOCKS[s],
        pool: pools[i],
        market: marketPx[i],
        oracle: oraclePx[i].status === 'success' ? oraclePx[i].result : 0n,
      },
    ]),
  )
  const today = block.timestamp / 86400n
  return {
    block: block.number,
    time: Number(block.timestamp),
    usdc,
    boxPrice,
    table: table as readonly Prize[],
    pending,
    band: { min: Number(minBps), max: Number(maxBps) },
    cap,
    spentToday: spentDay === today ? spentToday : 0n,
    stocks,
  }
}

/** USD (6 dp) value of `amount` shares at `price6`. */
export const usd6 = (amount: bigint, price6: bigint) => (amount * price6) / 10n ** 18n
