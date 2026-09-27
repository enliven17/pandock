import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// In production /api/* are Vercel functions. In dev, this runs the same handlers inside Vite,
// so the CMC key stays on the server side here too.
function api(): Plugin {
  return {
    name: 'pandock-api',
    configureServer(server) {
      server.middlewares.use('/api/rwa', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/rwa.ts')) as typeof import('./api/rwa.ts')
          const response = await mod.GET(new Request(`http://localhost${req.originalUrl ?? req.url ?? ''}`))
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'api error' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load CMC_API_KEY (no VITE_ prefix, so it is never bundled) into the dev server's process.env.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.CMC_API_KEY && !process.env.CMC_API_KEY) process.env.CMC_API_KEY = env.CMC_API_KEY
  return { plugins: [react(), api()] }
})
