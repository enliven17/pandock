import { neon } from '@neondatabase/serverless'
import { keccak256, toHex } from 'viem'

// The decision log and the escalation queue live in Neon, not on disk: the agent's host (Railway) has no
// lasting filesystem, and the site's Treasurer page reads the same rows.
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set (agent/.env)')
const sql = neon(url)

export const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x))
const GENESIS = keccak256(toHex('pandock-treasurer'))

// ponytail: tables create themselves on first use; move to migrations if the schema starts changing.
const ready = (async () => {
  await sql`
    create table if not exists decisions (
      seq bigserial primary key,
      time timestamptz not null,
      block bigint not null,
      prev text not null,
      head text not null unique,
      body text not null -- the exact hashed text, so anyone can recompute head = keccak256(prev || body)
    )`
  await sql`
    create table if not exists escalations (
      id serial primary key,
      time timestamptz not null default now(),
      action jsonb,
      summary text not null,
      reason text not null,
      status text not null default 'pending',
      decided_by text,
      decided_at timestamptz
    )`
})()

async function lastHead(): Promise<`0x${string}`> {
  await ready
  const rows = (await sql`select head from decisions order by seq desc limit 1`) as { head: `0x${string}` }[]
  return rows[0]?.head ?? GENESIS
}

/** Appends one hash-chained entry: head = keccak256(prev head ‖ entry). Returns the new head. */
export async function record(entry: Record<string, unknown> & { time: string; block: bigint }) {
  const prev = await lastHead()
  const body = json({ prev, ...entry })
  const head = keccak256(toHex(prev + body))
  await sql`insert into decisions (time, block, prev, head, body) values (${entry.time}, ${entry.block.toString()}, ${prev}, ${head}, ${body})`
  return head
}

export type Escalation = {
  id: number
  time: string
  action: unknown
  summary: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'done'
  decided_by: string | null
}

export async function escalations(status: Escalation['status']) {
  await ready
  return (await sql`select id, time, action, summary, reason, status, decided_by from escalations where status = ${status} order by id`) as Escalation[]
}

/** Queues an action for a human, unless the same one is already waiting. */
export async function escalate(action: unknown, summary: string, reason: string) {
  await ready
  await sql`
    insert into escalations (action, summary, reason)
    select ${action === null ? null : json(action)}::jsonb, ${summary}, ${reason}
    where not exists (select 1 from escalations where status = 'pending' and summary = ${summary})`
}

/** Moves an escalation on (pending → approved/rejected, approved → done). False if it wasn't in `from`. */
export async function decide(id: number, from: Escalation['status'], to: Escalation['status'], by?: string) {
  await ready
  const rows = await sql`
    update escalations set status = ${to}, decided_by = coalesce(${by ?? null}, decided_by), decided_at = coalesce(decided_at, now())
    where id = ${id} and status = ${from} returning id`
  return rows.length > 0
}
