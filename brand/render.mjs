// npm run render → brand/x-profile.png (800×800), brand/x-banner.png (3000×1000) at 2× for crisp uploads,
// and the Telegram bot's cards into web/public/tg/ (1280×720).
// Uses the installed Edge (or CHROME_PATH); the sources are plain HTML in source/, so they can be opened and edited directly.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = new URL('./source/', import.meta.url)
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' }
// ES modules need http(s), not file://, so the sources are served locally for the capture.
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname // query strings (tg.html?kind=…) are for the page, not the file
  const body = await readFile(join(fileURLToPath(root), decodeURIComponent(path))).catch(() => null)
  if (!body) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body)
}).listen(0)
const port = server.address().port

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
for (const [page, out, w, h] of [
  ['profile.html', 'x-profile.png', 400, 400],
  ['banner.html', 'x-banner.png', 1500, 500],
  // the bot's photo cards, served by the site from web/public/tg/
  ['tg.html?kind=linked', '../web/public/tg/linked.png', 1280, 720],
  ['tg.html?kind=gift', '../web/public/tg/gift.png', 1280, 720],
  ['tg.html?kind=bought', '../web/public/tg/bought.png', 1280, 720],
]) {
  const tab = await browser.newPage()
  await tab.setViewport({ width: w, height: h, deviceScaleFactor: out.includes('/tg/') ? 1 : 2 }) // Telegram recompresses photos; 1× is plenty
  await tab.goto(`http://localhost:${port}/${page}`, { waitUntil: 'networkidle0' })
  await tab.evaluate(() => document.fonts.ready)
  await tab.screenshot({ path: fileURLToPath(new URL(`./${out}`, import.meta.url)), clip: { x: 0, y: 0, width: w, height: h } })
  console.log('wrote', out)
}
await browser.close()
server.close()
