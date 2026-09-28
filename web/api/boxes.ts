// /api/boxes — a wallet's opened boxes and what came out of them, kept in Neon so a reload (or another
// device) doesn't lose them. The browser only ever sends a transaction hash: this reads the receipt from
// Arc itself and stores the Pandock events in it, so nothing a client claims is taken on trust.
//
//   GET  /api/boxes?owner=0x…   → { pending: [...], revealed: [...] }
//   POST /api/boxes { tx }      → records that transaction's Opened / Revealed / Refunded / Expired events

import { neon } from '@neondatabase/serverless'
import { createPublicClient, defineChain, http, isAddress, isHash, parseAbi, parseEventLogs } from 'viem'
import deployment from '../src/deployments/arc-testnet.json' with { type: 'json' }

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
})
const client = createPublicClient({ chain: arcTestnet, transport: http() })
const PANDOCK = deployment.pandock.toLowerCase()

const events = parseAbi([
  'event Opened(uint256 indexed openingId, address indexed opener, uint64 targetBlock)',
  'event Expired(uint256 indexed openingId, address indexed opener)',
  'event Revealed(uint256 indexed openingId, address indexed opener, address token, uint256 amount)',
  'event Refunded(uint256 indexed openingId, address indexed opener, uint256 amount)',
])

export type Opening = {
  id: string
  status: 'pending' | 'won' | 'empty' | 'refund' | 'expired'
  token: string | null
  amount: string | null
  openedAt: string
  revealedAt: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

type Sql = ReturnType<typeof db>

/** Driver errors can carry the connection string: log them server-side, send the browser a plain message. */
function fail(e: unknown, message: string) {
  console.error('api/boxes:', e)
  return json({ error: message }, 500)
}

function db() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured on the server')
  return neon(url)
}

let ready: Promise<unknown> | undefined
// ponytail: the table creates itself on first use; move to a migration once there is a second table.
const schema = (sql: Sql) =>
  (ready ??= sql`
    create table if not exists openings (
      pandock text not null,
      id numeric not null,
      opener text not null,
      target_block bigint not null,
      status text not null default 'pending',
      token text,
      amount numeric,
      opened_tx text not null,
      result_tx text,
      opened_at timestamptz not null default now(),
      revealed_at timestamptz,
      primary key (pandock, id)
    )`.then(() => sql`create index if not exists openings_opener on openings (pandock, opener)`))

export async function GET(req: Request): Promise<Response> {
  const owner = new URL(req.url).searchParams.get('owner') ?? ''
  if (!isAddress(owner)) return json({ error: 'owner must be an address' }, 400)
  try {
    const sql = db()
    await schema(sql)
    const rows = (await sql`
      select id::text, status, token, amount::text, opened_at, revealed_at from openings
      where pandock = ${PANDOCK} and opener = ${owner.toLowerCase()}
      order by coalesce(revealed_at, opened_at) desc, id desc
      limit 500`) as { id: string; status: Opening['status']; token: string | null; amount: string | null; opened_at: string; revealed_at: string | null }[]
    const all: Opening[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      token: r.token,
      amount: r.amount,
      openedAt: r.opened_at,
      revealedAt: r.revealed_at,
    }))
    return json({ pending: all.filter((o) => o.status === 'pending'), revealed: all.filter((o) => o.status !== 'pending') })
  } catch (e) {
    return fail(e, 'boxes unavailable')
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { tx?: string } | null
  if (!body?.tx || !isHash(body.tx)) return json({ error: 'tx must be a transaction hash' }, 400)
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: body.tx, timeout: 20_000 })
    if (receipt.status !== 'success') return json({ error: 'transaction reverted' }, 422)
    const logs = parseEventLogs({ abi: events, logs: receipt.logs.filter((l) => l.address.toLowerCase() === PANDOCK) })
    const sql = db()
    await schema(sql)
    for (const l of logs) {
      const id = l.args.openingId.toString()
      const opener = l.args.opener.toLowerCase()
      if (l.eventName === 'Opened')
        await sql`
          insert into openings (pandock, id, opener, target_block, opened_tx)
          values (${PANDOCK}, ${id}, ${opener}, ${l.args.targetBlock.toString()}, ${body.tx})
          on conflict (pandock, id) do nothing`
      else {
        const [status, token, amount] =
          l.eventName === 'Revealed'
            ? [l.args.amount === 0n ? 'empty' : 'won', l.args.amount === 0n ? null : l.args.token.toLowerCase(), l.args.amount.toString()]
            : l.eventName === 'Refunded'
              ? ['refund', null, l.args.amount.toString()]
              : ['expired', null, null]
        // Upsert: a box opened before this database existed still gets its result recorded.
        await sql`
          insert into openings (pandock, id, opener, target_block, opened_tx, status, token, amount, result_tx, revealed_at)
          values (${PANDOCK}, ${id}, ${opener}, 0, ${body.tx}, ${status}, ${token}, ${amount}, ${body.tx}, now())
          on conflict (pandock, id) do update set
            status = excluded.status, token = excluded.token, amount = excluded.amount,
            result_tx = excluded.result_tx, revealed_at = excluded.revealed_at`
      }
    }
    return json({ recorded: logs.length })
  } catch (e) {
    return fail(e, 'could not record transaction')
  }
}
