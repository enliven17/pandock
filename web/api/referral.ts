// /api/referral — invite links for the leaderboard.
//
//   GET  /api/referral?address=0x…   → { code, invites, pending, referredBy }   (makes the wallet's code on first ask)
//   GET  /api/referral?code=…        → { name }                                   (who a link belongs to)
//   POST /api/referral { code, address, signature }  → the invited wallet accepts, once
//
// An invite only scores once the invited wallet has bought a box, and it takes that wallet's own signature,
// so nobody can claim someone else's purchase as their invite.

import { neon } from '@neondatabase/serverless'
import { getAddress, isAddress, isHex, keccak256, verifyMessage } from 'viem'

// ponytail: a copy of src/referral.ts's message: Vercel bundles api/ on its own. Keep both identical.
const acceptMessage = (code: string, address: string) => `Joining Pandock, invited by ${code}.\nWallet: ${getAddress(address)}`

/** A wallet's invite code: short, stable, derived from the address (no one picks it, so there is nothing to squat). */
const codeOf = (address: string) => BigInt(keccak256(address.toLowerCase() as `0x${string}`).slice(0, 14)).toString(36)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function fail(e: unknown, message: string) {
  console.error('api/referral:', e) // driver errors can carry the connection string: never send them back
  return json({ error: message }, 500)
}

function db() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured')
  return neon(url)
}
type Sql = ReturnType<typeof db>

let ready: Promise<unknown> | undefined
const referralSchema = (sql: Sql) =>
  (ready ??= (async () => {
    await sql`create table if not exists referral_codes (code text primary key, wallet text unique not null, created_at timestamptz not null default now())`
    await sql`create table if not exists referrals (referee text primary key, referrer text not null, created_at timestamptz not null default now())`
    await sql`create index if not exists referrals_referrer on referrals (referrer)`
    await sql`create table if not exists purchases (
      tx text not null, log_index int not null, buyer text not null, amount int not null, block bigint not null,
      primary key (tx, log_index))`
  })())

/** "@telegram" when the wallet linked one, else a short address. */
async function nameOf(sql: Sql, wallet: string) {
  const tg = (await sql`select username from tg_links where wallet = ${wallet} and username is not null order by linked_at desc limit 1`.catch(() => [])) as { username: string }[]
  return tg[0] ? `@${tg[0].username}` : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams
  try {
    const sql = db()
    await referralSchema(sql)
    const code = q.get('code')
    if (code) {
      if (!/^[0-9a-z]{4,16}$/.test(code)) return json({ error: 'bad code' }, 400)
      const row = (await sql`select wallet from referral_codes where code = ${code}`)[0] as { wallet: string } | undefined
      if (!row) return json({ error: 'unknown invite' }, 404)
      return json({ name: await nameOf(sql, row.wallet) })
    }
    const address = q.get('address') ?? ''
    if (!isAddress(address)) return json({ error: 'address or code is required' }, 400)
    const wallet = address.toLowerCase()
    const mine = codeOf(wallet)
    await sql`insert into referral_codes (code, wallet) values (${mine}, ${wallet}) on conflict do nothing`
    const [stats] = (await sql`
      select count(*) filter (where exists (select 1 from purchases p where p.buyer = r.referee))::int as invites,
             count(*) filter (where not exists (select 1 from purchases p where p.buyer = r.referee))::int as pending
      from referrals r where r.referrer = ${wallet}`) as { invites: number; pending: number }[]
    const by = (await sql`select referrer from referrals where referee = ${wallet}`)[0] as { referrer: string } | undefined
    return json({ code: mine, invites: stats.invites, pending: stats.pending, referredBy: by ? await nameOf(sql, by.referrer) : null })
  } catch (e) {
    return fail(e, 'invites unavailable')
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { code?: string; address?: string; signature?: string } | null
  const { code = '', address = '', signature = '' } = body ?? {}
  if (!/^[0-9a-z]{4,16}$/.test(code) || !isAddress(address) || !isHex(signature)) return json({ error: 'code, address and signature are required' }, 400)
  try {
    const sql = db()
    await referralSchema(sql)
    const row = (await sql`select wallet from referral_codes where code = ${code}`)[0] as { wallet: string } | undefined
    if (!row) return json({ error: 'unknown invite' }, 404)
    const wallet = address.toLowerCase()
    if (row.wallet === wallet) return json({ error: 'that is your own invite' }, 400)
    if (!(await verifyMessage({ address, message: acceptMessage(code, address), signature }))) return json({ error: 'signature does not match this wallet' }, 401)
    // One inviter per wallet, first accepted wins; a wallet that invited this one can't be invited back by it.
    const done = await sql`
      insert into referrals (referee, referrer) select ${wallet}, ${row.wallet}
      where not exists (select 1 from referrals where referee = ${row.wallet} and referrer = ${wallet})
      on conflict (referee) do nothing returning referee`
    if (!done.length) return json({ error: 'this wallet has already accepted an invite' }, 409)
    return json({ accepted: true, by: await nameOf(sql, row.wallet) })
  } catch (e) {
    return fail(e, 'could not accept the invite')
  }
}
