import { getAddress } from 'viem'

/** The exact text a wallet signs to pair with a Telegram account. api/link.ts keeps an identical copy (Vercel bundles api/ alone). */
export const linkMessage = (username: string | null, tgUserId: string, address: string, code: string) =>
  `Link Telegram ${username ? `@${username}` : 'account'} (${tgUserId}) to ${getAddress(address)} on Pandock.\nCode: ${code}`
