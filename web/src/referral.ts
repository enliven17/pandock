import { getAddress } from 'viem'

// An invite link (/r/<code>) lands here as ?ref=<code>. The code is kept in this browser until a wallet accepts
// it (a signature, see InviteBanner); the first invite someone follows is the one that sticks.
const KEY = 'pandock.ref'

export function captureRef() {
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (!ref || !/^[0-9a-z]{4,16}$/.test(ref)) return
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, ref)
  } catch {
    /* storage unavailable: the invite just isn't remembered */
  }
}

export const pendingRef = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const clearRef = () => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}

/** The exact text an invited wallet signs. api/referral.ts keeps an identical copy (Vercel bundles api/ alone). */
export const acceptMessage = (code: string, address: string) => `Joining Pandock, invited by ${code}.\nWallet: ${getAddress(address)}`

/** Points for an invited friend who buys a box (a box you buy is one point). Same as api/leaderboard.ts. */
export const INVITE_POINTS = 3
