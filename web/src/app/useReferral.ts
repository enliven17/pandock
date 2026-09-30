import { useQuery } from '@tanstack/react-query'

type Mine = { code: string; invites: number; pending: number; referredBy: string | null }

/** The wallet's own invite code and standing (also makes the code on first ask). */
export function useReferral(address?: string) {
  return useQuery({
    queryKey: ['referral', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/referral?address=${address}`)
      if (!res.ok) throw new Error('invites unavailable')
      return (await res.json()) as Mine
    },
  })
}
