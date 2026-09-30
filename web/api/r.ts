// GET /r/<code> (rewritten to /api/r?code=…) — an invite link. Crawlers (X, Telegram, Discord) read the card tags;
// people are sent straight on to the site with ?ref=<code>, which the app keeps until the wallet accepts the invite.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const raw = url.searchParams.get('code') ?? ''
  const code = /^[0-9a-z]{4,16}$/.test(raw) ? raw : ''
  const origin = url.origin
  const to = code ? `/?ref=${code}` : '/'
  const title = 'Open a Pandock box'
  const text = 'Sealed boxes of tokenized stocks. 0.10 USDC a box, now on testnet.'
  const image = code ? `${origin}/api/og?code=${code}` : `${origin}/api/og`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(text)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(`${origin}/r/${code}`)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(text)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(text)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0;url=${esc(to)}" />
</head>
<body><a href="${esc(to)}">Continue to Pandock</a><script>location.replace(${JSON.stringify(to)})</script></body>
</html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=300' } })
}
