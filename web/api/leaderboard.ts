// GET /api/leaderboard — the testnet points table. Score = boxes bought + 3 × friends invited who bought a box.
// Purchases come from the chain's own Bought events (indexed into Neon by the agent, and by /api/boxes for buys
// made on the site); invites from /api/referral. Telegram usernames show for wallets linked through the bot.
//   GET /api/leaderboard              → { rows }
//   GET /api/leaderboard?address=0x…  → { rows, me }   (me: that wallet's row and rank, even outside the top 100)

import { neon } from '@neondatabase/serverless'
import { isAddress } from 'viem'
import deployment from '../src/deployments/arc-testnet.json' with { type: 'json' }

const PANDOCK = deployment.pandock.toLowerCase()
// Boxes the ShareDesk buys for people trading shares in don't score: it would top the table, and shares recycled
// into boxes shouldn't mint points.
const DESK = ((deployment as { shareDesk?: string }).shareDesk ?? '').toLowerCase()
export const INVITE_POINTS = 3

export type Row = { rank: number; wallet: string; bought: number; opened: number; invites: number; score: number; telegram: string | null }

const json = (body: unknown, status = 200, cache = true) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': status === 200 && cache ? 'public, s-maxage=30, stale-while-revalidate=60' : 'no-store' },
  })

export async function GET(req: Request): Promise<Response> {
  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'leaderboard unavailable' }, 503)
  const address = new URL(req.url).searchParams.get('address')
  const me = address && isAddress(address) ? address.toLowerCase() : null
  try {
    const sql = neon(url)
    await sql`create table if not exists referrals (referee text primary key, referrer text not null, created_at timestamptz not null default now())`
    const rows = (await sql`
      with bought as (select buyer as wallet, sum(amount)::int as bought from purchases where buyer <> ${DESK} group by buyer),
           opened as (select opener as wallet, count(*)::int as opened from openings where pandock = ${PANDOCK} group by opener),
           invited as (select r.referrer as wallet, count(*)::int as invites from referrals r
                       where exists (select 1 from purchases p where p.buyer = r.referee) group by r.referrer),
           players as (select wallet from bought union select wallet from invited),
           tg as (select distinct on (wallet) wallet, username from tg_links where username is not null order by wallet, linked_at desc),
           scored as (
             select p.wallet, coalesce(b.bought, 0) as bought, coalesce(o.opened, 0) as opened, coalesce(i.invites, 0) as invites,
                    coalesce(b.bought, 0) + ${INVITE_POINTS} * coalesce(i.invites, 0) as score, tg.username as telegram
             from players p left join bought b using (wallet) left join opened o using (wallet)
                            left join invited i using (wallet) left join tg using (wallet))
      select (rank() over (order by score desc, bought desc))::int as rank, * from scored
      order by score desc, bought desc, wallet`) as Row[]
    return json({ rows: rows.slice(0, 100), me: me ? (rows.find((r) => r.wallet === me) ?? null) : undefined }, 200, !me)
  } catch (e) {
    console.error('api/leaderboard:', e) // driver errors can carry the connection string
    return json({ error: 'leaderboard unavailable' }, 500)
  }
}
