// The Pandock Telegram bot, run inside the agent's process (long polling; nothing to host).
//
//   /link            in a private chat: a one-time link to pair your Telegram account with a wallet
//   /gift @friend 2  or reply to someone with /gift 2: boxes from what you parked in the gift jar
//   /boxes           what you have parked and sealed
//
// It is also the Treasurer's approval channel: each escalation reaches the owner with Approve / Reject.
import { randomBytes } from 'node:crypto'
import { keccak256, toHex } from 'viem'
import { call } from './act.js'
import { client, GIFT_JAR, jarAbi, PANDOCK, pandockAbi } from './chain.js'
import { decide, sql } from './log.js'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const OWNER = process.env.TELEGRAM_OWNER_ID // the human who approves escalations
const SITE = process.env.SITE_URL ?? 'https://pandock.vercel.app'
const MAX_GIFT = 5

type User = { id: number; username?: string; first_name: string }
type Entity = { type: string; offset: number; length: number; user?: User }
type Message = {
  message_id: number
  chat: { id: number; type: string }
  from?: User
  text?: string
  entities?: Entity[]
  reply_to_message?: Message
}
type Update = { update_id: number; message?: Message; callback_query?: { id: string; from: User; data?: string; message?: Message } }

async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`)
  return json.result
}
const say = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true, ...extra }).catch((e) => console.error(e))

const ready = (async () => {
  await sql`create table if not exists tg_links (
    tg_user_id bigint primary key, username text, wallet text not null, linked_at timestamptz not null default now(), claimed boolean not null default false)`
  await sql`create table if not exists tg_link_codes (
    code text primary key, tg_user_id bigint not null, username text, expires_at timestamptz not null, used_at timestamptz)`
  await sql`create table if not exists tg_state (key text primary key, value text not null)`
  await sql`alter table escalations add column if not exists notified_at timestamptz`
})()

/** Chat accounts in the gift jar: by user id, or by username for someone we have never seen. */
const byId = (id: number) => keccak256(toHex(`tg:${id}`))
const byName = (name: string) => keccak256(toHex(`tg:@${name.toLowerCase()}`))
const tag = (u: { username?: string | null; first_name?: string }) => (u.username ? `@${u.username}` : (u.first_name ?? 'them'))

async function linkOf(q: { id?: number; username?: string }) {
  const rows = q.id
    ? await sql`select wallet, username from tg_links where tg_user_id = ${q.id}`
    : await sql`select wallet, username from tg_links where lower(username) = ${q.username!.toLowerCase()}`
  return rows[0] as { wallet: `0x${string}`; username: string | null } | undefined
}

// ---------------------------------------------------------------- commands

async function link(m: Message) {
  if (m.chat.type !== 'private') return say(m.chat.id, 'Send me /link in a private chat, so the link only reaches you.')
  const code = randomBytes(12).toString('base64url')
  await sql`insert into tg_link_codes (code, tg_user_id, username, expires_at)
    values (${code}, ${m.from!.id}, ${m.from!.username ?? null}, now() + interval '15 minutes')`
  return say(m.chat.id, `Open this within 15 minutes and sign with your wallet:\n${SITE}/app/link?code=${code}`)
}

async function boxes(m: Message) {
  const l = await linkOf({ id: m.from!.id })
  if (!l) return say(m.chat.id, 'No wallet linked yet. Send me /link in a private chat.')
  const [parked, sealed] = await Promise.all([
    GIFT_JAR ? client.readContract({ address: GIFT_JAR, abi: jarAbi, functionName: 'deposits', args: [l.wallet] }) : 0n,
    client.readContract({ address: PANDOCK, abi: pandockAbi, functionName: 'balanceOf', args: [l.wallet, 0n] }),
  ])
  return say(m.chat.id, `${l.wallet.slice(0, 6)}…${l.wallet.slice(-4)}: ${sealed} sealed in your wallet, ${parked} parked for gifting.\nPark more on ${SITE}/app/gift`)
}

/** "/gift @friend 2", "/gift 2" as a reply, or a mention of someone without a username. Strict parsing, no model. */
function parseGift(m: Message) {
  const text = m.text ?? ''
  const rest = text.replace(/^\/gift(@\w+)?/i, '').trim()
  const n = Number(rest.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)?.[1] ?? 1)
  const named = rest.match(/@(\w{5,32})/)?.[1]
  const mentioned = m.entities?.find((e) => e.type === 'text_mention')?.user
  const to = mentioned ? { id: mentioned.id, username: mentioned.username, first_name: mentioned.first_name }
    : named ? { username: named }
    : m.reply_to_message?.from ? { id: m.reply_to_message.from.id, username: m.reply_to_message.from.username, first_name: m.reply_to_message.from.first_name }
    : undefined
  return { to, n }
}

async function gift(m: Message) {
  if (!GIFT_JAR) return say(m.chat.id, 'Gifting is not set up on this deployment yet.')
  const { to, n } = parseGift(m)
  if (!to) return say(m.chat.id, 'Who to? Reply to their message with /gift 1, or write /gift @username 1.')
  if (n < 1 || n > MAX_GIFT) return say(m.chat.id, `Between 1 and ${MAX_GIFT} boxes at a time.`)
  if (to.id === m.from!.id) return say(m.chat.id, 'Those are already yours.')
  const from = await linkOf({ id: m.from!.id })
  if (!from) return say(m.chat.id, `${tag(m.from!)}, link a wallet first: send me /link in a private chat.`)
  const parked = await client.readContract({ address: GIFT_JAR, abi: jarAbi, functionName: 'deposits', args: [from.wallet] })
  if (parked < BigInt(n)) return say(m.chat.id, `You have ${parked} parked for gifting. Park boxes on ${SITE}/app/gift first.`)

  // One id per chat message, so the jar refuses a replay of the same message.
  const messageId = BigInt(keccak256(toHex(`${m.chat.id}:${m.message_id}`)))
  const friend = await linkOf(to.id ? { id: to.id } : { username: to.username })
  try {
    if (friend) {
      const tx = await call(GIFT_JAR, jarAbi, 'gift', [from.wallet, friend.wallet, BigInt(n), messageId])
      return say(m.chat.id, `🎁 ${tag(m.from!)} sent ${tag(to)} ${n} sealed box${n > 1 ? 'es' : ''}. tx ${tx.slice(0, 10)}…`)
    }
    const account = to.id ? byId(to.id) : byName(to.username!)
    const tx = await call(GIFT_JAR, jarAbi, 'hold', [from.wallet, account, BigInt(n), messageId])
    return say(m.chat.id, `🎁 ${n} box${n > 1 ? 'es' : ''} from ${tag(m.from!)} held for ${tag(to)}. ${tag(to)}, send me /link in a private chat to claim. tx ${tx.slice(0, 10)}…`)
  } catch (e) {
    console.error('gift failed:', e)
    const why = e instanceof Error && /OverDailyLimit/.test(e.message) ? 'that is over your daily gifting limit' : 'the transaction did not go through'
    return say(m.chat.id, `Could not send it: ${why}.`)
  }
}

const HELP = `Pandock: sealed boxes of tokenized stocks on Arc.
/link: pair this Telegram account with your wallet (private chat)
/gift @friend 2: send boxes you parked for gifting (or reply to someone with /gift 2)
/boxes: what you have
${SITE}`

async function onMessage(m: Message) {
  if (!m.text?.startsWith('/') || !m.from) return
  const cmd = m.text.split(/[\s@]/)[0].toLowerCase()
  if (cmd === '/start' || cmd === '/help') return say(m.chat.id, HELP)
  if (cmd === '/link') return link(m)
  if (cmd === '/gift') return gift(m)
  if (cmd === '/boxes') return boxes(m)
}

// ---------------------------------------------------------------- approvals

async function onCallback(q: NonNullable<Update['callback_query']>) {
  const [kind, verdict, id] = (q.data ?? '').split(':')
  if (kind !== 'esc') return
  if (String(q.from.id) !== OWNER) return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Only the owner decides these.' })
  const to = verdict === 'approve' ? 'approved' : 'rejected'
  const ok = await decide(Number(id), 'pending', to, `telegram:${tag(q.from)}`)
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: ok ? `#${id} ${to}` : `#${id} was already decided` })
  if (ok && q.message)
    await tg('editMessageText', {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: `${q.message.text}\n\n${to === 'approved' ? '✅ Approved, runs next cycle' : '❌ Rejected'} by ${tag(q.from)}`,
    }).catch(() => {})
}

/** New escalations go to the owner once, with buttons. */
async function notifyEscalations() {
  if (!OWNER) return
  const rows = (await sql`select id, summary, reason from escalations where status = 'pending' and notified_at is null order by id`) as {
    id: number
    summary: string
    reason: string
  }[]
  for (const e of rows) {
    await say(Number(OWNER), `Treasurer asks: ${e.summary}\n\n${e.reason}`, {
      reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `esc:approve:${e.id}` }, { text: 'Reject', callback_data: `esc:reject:${e.id}` }]] },
    })
    await sql`update escalations set notified_at = now() where id = ${e.id}`
  }
}

/** Boxes held for someone who has just linked a wallet go to that wallet. */
async function deliverHeld() {
  if (!GIFT_JAR) return
  const rows = (await sql`select tg_user_id, username, wallet from tg_links where not claimed`) as {
    tg_user_id: string
    username: string | null
    wallet: `0x${string}`
  }[]
  for (const l of rows) {
    let got = 0n
    for (const account of [byId(Number(l.tg_user_id)), ...(l.username ? [byName(l.username)] : [])]) {
      const n = await client.readContract({ address: GIFT_JAR, abi: jarAbi, functionName: 'held', args: [account] })
      if (n === 0n) continue
      await call(GIFT_JAR, jarAbi, 'claim', [account, l.wallet])
      got += n
    }
    await sql`update tg_links set claimed = true where tg_user_id = ${l.tg_user_id}`
    if (got) await say(Number(l.tg_user_id), `🎁 ${got} sealed box${got > 1n ? 'es' : ''} waiting for you just landed in your wallet. Open them on ${SITE}/app/boxes`)
  }
}

// ---------------------------------------------------------------- loop

export async function startBot() {
  if (!TOKEN) return console.log('TELEGRAM_BOT_TOKEN not set: bot off')
  await ready
  const me = await tg<{ username: string }>('getMe')
  console.log(`Telegram bot @${me.username}${OWNER ? '' : ' (no TELEGRAM_OWNER_ID: approvals stay on the CLI)'}`)
  await tg('setMyCommands', {
    commands: [
      { command: 'gift', description: 'Send boxes you parked: /gift @friend 1' },
      { command: 'link', description: 'Pair this account with your wallet' },
      { command: 'boxes', description: 'What you have' },
      { command: 'help', description: 'How it works' },
    ],
  }).catch(() => {})
  setInterval(() => {
    notifyEscalations().catch((e) => console.error('escalations:', e))
    deliverHeld().catch((e) => console.error('deliver:', e))
  }, 20_000)

  let offset = Number(((await sql`select value from tg_state where key = 'offset'`)[0] as { value: string } | undefined)?.value ?? 0)
  for (;;) {
    try {
      const updates = await tg<Update[]>('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] })
      for (const u of updates) {
        offset = u.update_id + 1
        await sql`insert into tg_state (key, value) values ('offset', ${String(offset)}) on conflict (key) do update set value = excluded.value`
        if (u.message) await onMessage(u.message).catch((e) => console.error('message:', e))
        if (u.callback_query) await onCallback(u.callback_query).catch((e) => console.error('callback:', e))
      }
    } catch (e) {
      console.error('telegram poll:', e instanceof Error ? e.message : e)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
