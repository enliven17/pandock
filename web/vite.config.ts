import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

type Handler = (req: Request) => Promise<Response>

/** Node request → Web Request, the shape the Vercel handlers take. */
// Connect strips the mount path from req.url and keeps the full one in originalUrl.
async function toRequest(req: IncomingMessage & { originalUrl?: string }): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))
  return new Request(`http://localhost${req.originalUrl ?? req.url}`, { method: req.method, headers, body })
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(await response.text())
}

// In production /api/* are Vercel functions. In dev, this runs the same handlers inside Vite,
// so the CMC key and the database URL stay on the server side here too.
function api(): Plugin {
  const route = (server: ViteDevServer, path: string) =>
    server.middlewares.use(path, async (req, res) => {
      try {
        const mod = (await server.ssrLoadModule(`${path}.ts`)) as Record<string, Handler | undefined>
        const handler = mod[req.method ?? 'GET']
        if (!handler) return send(res, new Response('method not allowed', { status: 405 }))
        await send(res, await handler(await toRequest(req)))
      } catch (e) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'api error' }))
      }
    })
  return {
    name: 'pandock-api',
    configureServer(server) {
      route(server, '/api/rwa')
      route(server, '/api/boxes')
      route(server, '/api/link')
      route(server, '/api/leaderboard')
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-only secrets (no VITE_ prefix, so never bundled) into the dev server's process.env.
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['CMC_API_KEY', 'DATABASE_URL']) if (env[k]) process.env[k] = env[k] // the env file wins, also across restarts
  return { plugins: [react(), api()] }
})
