import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// On a host with no Circle CLI login (Railway), CIRCLE_HOME_B64 carries the files of ~/.circle-cli
// (the agent wallet session, the accepted terms) as base64 JSON { "relative/path": "contents" }.
// They are written back before the CLI runs. Make it with `npm run circle-home` on a logged-in machine.
const packed = process.env.CIRCLE_HOME_B64
if (packed) {
  const home = process.env.CIRCLE_CLI_HOME ?? join(homedir(), '.circle-cli')
  const files = JSON.parse(Buffer.from(packed, 'base64').toString('utf8')) as Record<string, string>
  for (const [path, contents] of Object.entries(files)) {
    const file = join(home, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contents, { mode: 0o600 })
  }
}
