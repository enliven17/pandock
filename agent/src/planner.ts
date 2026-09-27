import { Type, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai'
import { json } from './log.js'
import type { State } from './observe.js'
import { ai, route } from './router.js'

export type Proposal =
  | { tool: 'restock'; symbol: string; usdc: number; reason: string }
  | { tool: 'reprice'; target_payout_bps: number; reason: string }
  | { tool: 'escalate'; summary: string; reason: string }
  | { tool: 'no_action'; reason: string }

const reason = { type: Type.STRING, description: 'One or two sentences with the numbers behind this decision.' }
const TOOLS: FunctionDeclaration[] = [
  {
    name: 'restock',
    description: 'Buy more of one stock for the prize pool with sale proceeds (USDC). Only confirmed stocks, within the spendable budget.',
    parameters: {
      type: Type.OBJECT,
      properties: { symbol: { type: Type.STRING }, usdc: { type: Type.NUMBER, description: 'USDC to spend' }, reason },
      required: ['symbol', 'usdc', 'reason'],
    },
  },
  {
    name: 'reprice',
    description:
      'Republish the prize table at live prices, scaling every tier to a target expected payout (bps of the box price). The contract rejects targets outside the band.',
    parameters: {
      type: Type.OBJECT,
      properties: { target_payout_bps: { type: Type.INTEGER }, reason },
      required: ['target_payout_bps', 'reason'],
    },
  },
  {
    name: 'escalate',
    description: 'Ask the human owner to look at something that is not the agent’s call (policy, odd prices, anything irreversible or unusual).',
    parameters: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, reason }, required: ['summary', 'reason'] },
  },
  {
    name: 'no_action',
    description: 'Nothing is worth doing this cycle.',
    parameters: { type: Type.OBJECT, properties: { reason }, required: ['reason'] },
  },
]

const SYSTEM = `You are the Treasurer of Pandock, a small business on Arc that sells sealed boxes (0.10 USDC) which open into
a random slice of a tokenized stock. You run its money inside limits you cannot change. Each cycle you get the business's
state and decide what to do by calling tools; call several if needed, or no_action.

What good looks like:
- Every stock's pool can keep paying prizes: about $100 of each (≈50 of the top $2 prize) is healthy; below ~$60 needs a restock.
  Restock the thinnest confirmed pools first, sized by demand (boxes sold per hour/day), never beyond the spendable budget.
- Buyers are always owed a prize or a refund: never spend into the refund reserve (the budget already excludes it).
- The prize table is fair and sustainable: its expected payout must stay inside the owner's band. Use reprice to re-derive
  share amounts when prices drift, and choose the target: nearer the top of the band when pools are healthy and demand is slow
  (to attract buyers), nearer the bottom when pools are thin or the daily spend cap is close.
- Never act on a stock whose price is unconfirmed (oracle and CoinMarketCap disagree or one is missing); escalate if it persists.
- Large restocks above the soft threshold are routed to a human automatically; you still propose them if they are right.
- Don't churn: if the table is within drift tolerance and pools are fine, no_action is the right answer.
Every reason must cite the numbers you used. You are audited: your reasons go into a hash-chained log anchored on-chain.`

/** What the model sees: the state, the limits, and the deterministic policy's suggestion as a baseline. */
export function brief(s: State, extra: Record<string, unknown>) {
  return json({
    box_price_usdc: Number(s.boxPrice) / 1e18,
    usdc_balance: Number(s.usdc) / 1e18,
    pending_openings: s.pending.length,
    demand: s.demand,
    payout_band_bps: s.band,
    daily_cap_usdc: Number(s.cap) / 1e18,
    spent_today_usdc: Number(s.spentToday) / 1e18,
    ...extra,
  })
}

export async function decide(briefing: string) {
  const gemini = ai
  if (!gemini) return { model: null, errors: ['GEMINI_API_KEY not set'] }
  return route('planner', async (model) => {
    const res = await gemini.models.generateContent({
      model,
      contents: briefing,
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.2,
        tools: [{ functionDeclarations: TOOLS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    })
    const calls = res.functionCalls ?? []
    if (!calls.length) throw new Error('no tool call')
    return calls.map((c) => ({ tool: c.name, ...c.args }) as Proposal)
  })
}
