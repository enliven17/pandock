// GET /api/leaderboard — who bought the most boxes, from the chain's own Bought events (indexed into Neon by the
// agent, and by /api/boxes for buys made on the site). Telegram usernames show for wallets linked through the bot.

import { neon } from '@neondatabase/serverless'
import deployment from '../src/deployments/arc-testnet.json' with { type: 'json' }

const PANDOCK = deployment.pandock.toLowerCase()

export type Row = { wallet: string; bought: number; opened: number; telegram: string | null }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, s-maxage=30, stale-while-revalidate=60' : 'no-store' },
  })

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'leaderboard unavailable' }, 503)
  try {
    const sql = neon(url)
    const rows = (await sql`
      with bought as (select buyer as wallet, sum(amount)::int as bought from purchases group by buyer),
           opened as (select opener as wallet, count(*)::int as opened from openings where pandock = ${PANDOCK} group by opener),
           tg as (select distinct on (wallet) wallet, username from tg_links where username is not null order by wallet, linked_at desc)
      select b.wallet, b.bought, coalesce(o.opened, 0) as opened, tg.username as telegram
      from bought b left join opened o on o.wallet = b.wallet left join tg on tg.wallet = b.wallet
      order by b.bought desc, b.wallet
      limit 100`) as Row[]
    return json({ rows })
  } catch (e) {
    console.error('api/leaderboard:', e) // driver errors can carry the connection string
    return json({ error: 'leaderboard unavailable' }, 500)
  }
}
