import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { keccak256, toHex } from 'viem'

const DIR = new URL('../log/', import.meta.url)
const LOG = new URL('decisions.jsonl', DIR)
const QUEUE = new URL('escalations.json', DIR)
mkdirSync(DIR, { recursive: true })

export const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x))
const GENESIS = keccak256(toHex('pandock-treasurer'))

function lastHead(): `0x${string}` {
  if (!existsSync(LOG)) return GENESIS
  const lines = readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean)
  return lines.length ? JSON.parse(lines.at(-1)!).head : GENESIS
}

/** Appends one hash-chained entry: head = keccak256(prev head ‖ entry). Returns the new head. */
export function record(entry: Record<string, unknown>) {
  const prev = lastHead()
  const body = json({ prev, ...entry })
  const head = keccak256(toHex(prev + body))
  appendFileSync(LOG, json({ ...JSON.parse(body), head }) + '\n')
  return head
}

export type Escalation = { id: number; time: string; action: unknown; summary: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'done'; by?: string }

export const readQueue = (): Escalation[] => (existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : [])
export const writeQueue = (q: Escalation[]) => writeFileSync(QUEUE, JSON.stringify(q, null, 2))

/** Queues an action for a human, unless the same one is already waiting. */
export function escalate(action: unknown, summary: string, reason: string) {
  const q = readQueue()
  if (q.some((e) => e.status === 'pending' && e.summary === summary)) return
  q.push({ id: (q.at(-1)?.id ?? 0) + 1, time: new Date().toISOString(), action: JSON.parse(json(action)), summary, reason, status: 'pending' })
  writeQueue(q)
}
