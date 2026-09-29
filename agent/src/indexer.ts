// Box purchases, copied from Pandock's Bought events into Neon for the leaderboard. Runs each cycle from the
// last block it reached, in RPC-sized windows; the site also records its own buys the moment they land.
import { client, DEPLOY_BLOCK, PANDOCK, pandockAbi } from './chain.js'
import { sql } from './log.js'

const CHUNK = 50_000n // the Canteen RPC rejects wider log ranges

const ready = (async () => {
  await sql`create table if not exists purchases (
    tx text not null, log_index int not null, buyer text not null, amount int not null, block bigint not null,
    primary key (tx, log_index))`
  await sql`create index if not exists purchases_buyer on purchases (buyer)`
  await sql`create table if not exists agent_state (key text primary key, value text not null)`
})()

export async function indexPurchases() {
  await ready
  const key = `bought:${PANDOCK.toLowerCase()}`
  const row = (await sql`select value from agent_state where key = ${key}`)[0] as { value: string } | undefined
  let from = row ? BigInt(row.value) + 1n : DEPLOY_BLOCK
  const head = await client.getBlockNumber()
  let added = 0
  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head
    const logs = await client.getContractEvents({ address: PANDOCK, abi: pandockAbi, eventName: 'Bought', fromBlock: from, toBlock: to })
    for (const l of logs) {
      await sql`insert into purchases (tx, log_index, buyer, amount, block)
        values (${l.transactionHash}, ${l.logIndex}, ${l.args.buyer!.toLowerCase()}, ${Number(l.args.amount)}, ${l.blockNumber.toString()})
        on conflict do nothing`
      added++
    }
    await sql`insert into agent_state (key, value) values (${key}, ${to.toString()}) on conflict (key) do update set value = excluded.value`
    from = to + 1n
  }
  return added
}
