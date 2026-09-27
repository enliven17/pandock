import { formatUnits } from 'viem'

export const fmt = (v: bigint, max = 6) =>
  Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: max })

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
