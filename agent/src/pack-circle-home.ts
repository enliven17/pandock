// npm run circle-home → prints CIRCLE_HOME_B64 for a host without a Circle login (see circle-home.ts).
// Only the testnet session goes in: the agent never touches mainnet.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const home = process.env.CIRCLE_CLI_HOME ?? join(homedir(), '.circle-cli')
const session = JSON.parse(readFileSync(join(home, 'profiles', 'agent', 'session.json'), 'utf8'))
if (!session.testnet) throw new Error('no testnet session: circle wallet login <email> --testnet')
const files = {
  'profiles/agent/session.json': JSON.stringify({ email: session.email, testnet: session.testnet }),
  'terms.json': readFileSync(join(home, 'terms.json'), 'utf8'),
}
process.stdout.write(Buffer.from(JSON.stringify(files)).toString('base64'))
