// npm run approve            → list pending escalations
// npm run approve 3          → approve #3 (executed next cycle)
// npm run approve 3 reject   → reject #3
import { readQueue, writeQueue } from './log.js'

const [id, verdict] = process.argv.slice(2)
const q = readQueue()
if (!id) {
  for (const e of q.filter((e) => e.status === 'pending')) console.log(`#${e.id}  ${e.summary}  (${e.reason}, ${e.time})`)
  if (!q.some((e) => e.status === 'pending')) console.log('nothing pending')
} else {
  const e = q.find((x) => x.id === Number(id) && x.status === 'pending')
  if (!e) throw new Error(`no pending escalation #${id}`)
  writeQueue(q.map((x) => (x === e ? { ...x, status: verdict === 'reject' ? 'rejected' : 'approved', by: 'cli' } : x)))
  console.log(`#${id} ${verdict === 'reject' ? 'rejected' : 'approved'}`)
}
