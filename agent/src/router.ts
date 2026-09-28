import { GoogleGenAI } from '@google/genai'

// Gemini limits are per model and per project, so each role walks a chain of models and a model
// that returns 429 is benched for the retryDelay it gives. See docs/agent.md, "Model routing".
// ponytail: no pre-emptive RPM/RPD buckets; unchanged state already skips the call. Add them if 429s get frequent.
export const CHAINS = {
  planner: (process.env.PLANNER_MODELS ?? 'gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite').split(','),
}

const benched = new Map<string, number>()
export const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : undefined

function benchFor(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (!/429|RESOURCE_EXHAUSTED/.test(msg)) return 0
  const s = msg.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/)
  return (s ? Number(s[1]) : 60) * 1000
}

/** Runs `call` on the first model in the role's chain that isn't benched; null if every model failed. */
export async function route<T>(role: keyof typeof CHAINS, call: (model: string) => Promise<T>) {
  const errors: string[] = []
  for (const model of CHAINS[role]) {
    if ((benched.get(model) ?? 0) > Date.now()) continue
    try {
      return { model, result: await call(model) }
    } catch (e) {
      const ms = benchFor(e)
      if (ms) benched.set(model, Date.now() + ms)
      errors.push(`${model}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`)
    }
  }
  return { model: null, errors }
}
