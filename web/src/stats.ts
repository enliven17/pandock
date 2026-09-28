import { formatUnits } from 'viem'
import { useReadContracts } from 'wagmi'
import { chain, PANDOCK, pandockAbi, prizeTokens } from './config'

const TOTALS = ['boxesSold', 'nextOpeningId', 'refunds', 'anchors'] as const

/** Lifetime totals from the contract's own counters, plus shares paid out per prize token. */
export function useStats() {
  const tokens = prizeTokens()
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      ...TOTALS.map((functionName) => ({ address: PANDOCK!, abi: pandockAbi, functionName, chainId: chain.id })),
      ...tokens.map((t) => ({ address: PANDOCK!, abi: pandockAbi, functionName: 'paidOut' as const, args: [t] as const, chainId: chain.id })),
    ],
    query: { enabled: !!PANDOCK, refetchInterval: 30_000 },
  })
  if (!data) return undefined
  const [sold, opened, refunds, decisions, ...paid] = data as bigint[]
  return {
    sold: Number(sold),
    opened: Number(opened),
    refunds: Number(refunds),
    decisions: Number(decisions),
    paidOut: tokens.map((token, i) => ({ token, shares: Number(formatUnits(paid[i], 18)) })),
  }
}
