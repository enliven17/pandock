// npm run approve            → list pending escalations
// npm run approve 3          → approve #3 (executed next cycle)
// npm run approve 3 reject   → reject #3
import { decide, escalations } from './log.js'

const [id, verdict] = process.argv.slice(2)
if (!id) {
  const pending = await escalations('pending')
  for (const e of pending) console.log(`#${e.id}  ${e.summary}  (${e.reason}, ${new Date(e.time).toISOString()})`)
  if (!pending.length) console.log('nothing pending')
} else {
  const to = verdict === 'reject' ? 'rejected' : 'approved'
  if (!(await decide(Number(id), 'pending', to, 'cli'))) throw new Error(`no pending escalation #${id}`)
  console.log(`#${id} ${to}`)
}