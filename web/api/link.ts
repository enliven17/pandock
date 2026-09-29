// /api/link — pair a Telegram account with a wallet, for gifting from chat.
// The bot sends /link's one-time code only to that user's private chat; the wallet then signs a message
// built here from the code and its own address, so neither half can be forged by the other.
//
//   GET  /api/link?code=…                         → { username, tgUserId } while the code is unused and fresh
//   POST /api/link { code, address, signature }   → links them; the bot then delivers any boxes held for them

import { neon } from '@neondatabase/serverless'
import { getAddress, isAddress, isHex, verifyMessage } from 'viem'

// ponytail: a copy of src/linkMessage.ts: Vercel bundles api/ on its own and cannot import from src/. Keep both identical.
const linkMessage = (username: string | null, tgUserId: string, address: string, code: string) =>
  `Link Telegram ${username ? `@${username}` : 'account'} (${tgUserId}) to ${getAddress(address)} on Pandock.\nCode: ${code}`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })


function fail(e: unknown, message: string) {
  console.error('api/link:', e) // driver errors can carry the connection string: never send them back
  return json({ error: message }, 500)
}

type Code = { tg_user_id: string; username: string | null }

async function pending(code: string): Promise<Code | undefined> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured')
  const sql = neon(url)
  const rows = (await sql`select tg_user_id::text, username from tg_link_codes where code = ${code} and used_at is null and expires_at > now()`) as Code[]
  return rows[0]
}

export async function GET(req: Request): Promise<Response> {
  const code = new URL(req.url).searchParams.get('code') ?? ''
  if (!/^[\w-]{8,64}$/.test(code)) return json({ error: 'bad code' }, 400)
  try {
    const c = await pending(code)
    if (!c) return json({ error: 'This link has expired or was already used. Send /link to the bot again.' }, 404)
    return json({ username: c.username, tgUserId: c.tg_user_id })
  } catch (e) {
    return fail(e, 'linking unavailable')
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { code?: string; address?: string; signature?: string } | null
  const { code = '', address = '', signature = '' } = body ?? {}
  if (!/^[\w-]{8,64}$/.test(code) || !isAddress(address) || !isHex(signature)) return json({ error: 'code, address and signature are required' }, 400)
  try {
    const c = await pending(code)
    if (!c) return json({ error: 'This link has expired or was already used. Send /link to the bot again.' }, 404)
    const ok = await verifyMessage({ address, message: linkMessage(c.username, c.tg_user_id, address, code), signature })
    if (!ok) return json({ error: 'signature does not match this wallet' }, 401)
    const sql = neon(process.env.DATABASE_URL!)
    await sql`update tg_link_codes set used_at = now() where code = ${code}`
    // Relinking moves the account to the new wallet; `claimed = false` lets the bot deliver anything held for it.
    await sql`
      insert into tg_links (tg_user_id, username, wallet) values (${c.tg_user_id}, ${c.username}, ${address.toLowerCase()})
      on conflict (tg_user_id) do update set username = excluded.username, wallet = excluded.wallet, linked_at = now(), claimed = false`
    return json({ linked: true, username: c.username })
  } catch (e) {
    return fail(e, 'could not link')
  }
}
