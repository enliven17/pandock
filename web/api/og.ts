// GET /api/og?code=… — the 1200×630 card X shows under an invite link (/r/<code>): who invites you, their score
// and rank. satori lays out plain element objects (no JSX in api/) into SVG, resvg turns that into a PNG;
// pieces come from public/og/. (@vercel/og wraps the same two, but its builds don't bundle as an ESM function here.)

import { neon } from '@neondatabase/serverless'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import deployment from '../src/deployments/arc-testnet.json' with { type: 'json' }

// same exclusion as api/leaderboard.ts: the ShareDesk's trade-in boxes don't score
const DESK = ((deployment as { shareDesk?: string }).shareDesk ?? '').toLowerCase()
type El = { type: string; props: Record<string, unknown> }
const el = (type: string, style: Record<string, unknown>, ...children: (El | string)[]): El => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
})
const img = (src: string, style: Record<string, unknown>): El => ({ type: 'img', props: { src, style } })

/** The inviter's name and standing, if the code is known; otherwise a plain card. */
async function standing(code: string | null) {
  const url = process.env.DATABASE_URL
  if (!code || !url || !/^[0-9a-z]{4,16}$/.test(code)) return null
  const sql = neon(url)
  const rows = (await sql`
    with me as (select wallet from referral_codes where code = ${code}),
         bought as (select buyer as wallet, sum(amount)::int as bought from purchases where buyer <> ${DESK} group by buyer),
         invited as (select r.referrer as wallet, count(*)::int as invites from referrals r
                     where exists (select 1 from purchases p where p.buyer = r.referee) group by r.referrer),
         scored as (select w.wallet, coalesce(b.bought, 0) + 3 * coalesce(i.invites, 0) as score
                    from (select wallet from bought union select wallet from invited union select wallet from me) w
                    left join bought b using (wallet) left join invited i using (wallet)),
         ranked as (select wallet, score, (rank() over (order by score desc))::int as rank from scored)
    select r.wallet, r.score, r.rank,
           (select username from tg_links t where t.wallet = r.wallet and username is not null order by linked_at desc limit 1) as telegram
    from ranked r join me using (wallet)`.catch((e) => (console.error('api/og:', e), []))) as {
    wallet: string
    score: number
    rank: number
    telegram: string | null
  }[]
  const r = rows[0]
  if (!r) return null
  return { name: r.telegram ? `@${r.telegram}` : `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`, score: r.score, rank: r.rank }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const origin = url.origin
  const who = await standing(url.searchParams.get('code'))
  const get = (path: string) => fetch(`${origin}${path}`).then((r) => r.arrayBuffer())
  const [bold, regular, boxPng, markPng] = await Promise.all([get('/fonts/inter-700.woff'), get('/fonts/inter-400.woff'), get('/og/box.png'), get('/og/mark.png')])
  const png = (b: ArrayBuffer) => `data:image/png;base64,${Buffer.from(b).toString('base64')}`

  const card = el(
    'div',
    { width: 1200, height: 630, background: 'linear-gradient(135deg, #1b1b1d 0%, #121213 100%)', fontFamily: 'Inter', color: '#e8e8ea', position: 'relative' },
    el(
      'div',
      { flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 80px', width: 700 },
      el('div', { fontSize: 76, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1.04 }, 'Open the box.'),
      el('div', { fontSize: 76, fontWeight: 700, letterSpacing: -2.6, lineHeight: 1.04, color: '#6096d6' }, 'Own the market.'),
      el('div', { fontSize: 30, color: '#a1a1a6', marginTop: 34 }, who ? `${who.name} invites you to Pandock` : 'Sealed boxes of tokenized stocks'),
      ...(who
        ? [el('div', { fontSize: 26, color: '#8e8e93', marginTop: 12 }, `${who.score} point${who.score === 1 ? '' : 's'} · #${who.rank} on the testnet leaderboard`)]
        : []),
    ),
    img(png(boxPng), { position: 'absolute', right: 70, top: 110, width: 400, height: 415 }),
    el(
      'div',
      { position: 'absolute', left: 80, bottom: 52, alignItems: 'center', fontSize: 26, fontWeight: 700, color: '#c7c7cc' },
      img(png(markPng), { width: 38, height: 31, marginRight: 12 }),
      'Pandock · now on testnet',
    ),
  )

  const svg = await satori(card as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    ],
  })
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
  return new Response(new Uint8Array(image), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  })
}