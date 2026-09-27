# Pandock Treasurer — agent design

Pandock is a small business: it sells 0.10 USDC boxes, holds a pool of tokenized stock to pay prizes from, and owes every opened box either a prize or a refund. Today a person would have to run that money by hand. The **Treasurer** is an AI agent that runs it instead, inside limits it cannot move.

Hackathon fit: Tameion RFB 4 (Autonomous Business Operator), with pieces of RFB 1 (treasury, idle cash into USYC). The business is Pandock itself, which the FAQ allows ("your own company counts").

## What the agent decides

Every cycle (default: every 15 minutes, plus on any `Bought` / `Opened` spike):

| Decision | Inputs | Output |
|---|---|---|
| **Restock** which stock, how much | pool balance per stock, open liabilities (opened, not yet revealed), sales rate, prices | buy STOCK tokens with sale proceeds |
| **Reprice** the prize table | live prices, pool per stock, target payout | new `setPrizes` table: share amounts re-derived so each tier keeps its dollar value |
| **Reserve** how much USDC to keep liquid | refund exposure (tiers the pool can't cover), forecast of next-24h openings | keep reserve; move the surplus |
| **Yield** idle surplus in or out of USYC | reserve target vs balance, forecast | mint or redeem USYC via the Teller |
| **Escalate** what is not its call | policy thresholds (below) | a pending approval for a human, with its reasoning |

What it does *not* decide: the box price, the payout band, the per-day spend cap, who the owner is. Those live in the contract or the wallet policy and only a human can change them.

## Guardrails, in three layers

The agent's authority is bounded somewhere it cannot reach (Tameion FAQ Q4):

1. **Contract policy (Pandock)** — a new `operator` role for the agent, separate from `owner`:
   - `setPrizes` by the operator reverts unless the table's **expected payout is inside the owner's band** (e.g. 70–80% of box price), computed on-chain from a price source. The agent cannot publish a table that pays out more (drains the pool) or less (cheats buyers) than the band.
   - The operator can only move sale proceeds to **allow-listed sinks** (the stock market, the USYC Teller), capped per day. `withdraw` anywhere else stays owner-only.
2. **Wallet policy (Circle agent wallet)** — per-transaction and daily USDC limits plus a recipient allowlist on the agent's wallet, set with `circle wallet limit set`. Policy writes are **OTP-gated to a human**, so the agent cannot raise its own limits.
3. **Escalation policy (agent)** — anything over a soft threshold (a single restock above X USDC, a table change that moves any tier's odds by more than Y points, redeeming USYC early) is queued for a human instead of executed. The human is pinged on **Telegram** and approves or rejects there or on the dashboard; the decision and the outcome both go in the log.

## Decision log

Every cycle writes one entry: what the agent saw (balances, prices, liabilities), what it decided and why (the model's stated reasoning), which rule allowed it, and the resulting transaction hashes. Entries are **hash-chained** (each carries the previous entry's hash), and the chain head is **anchored on-chain** each cycle via a `Logged(bytes32 head)` event, so the record can't be quietly rewritten after the fact. The site gets a **Treasurer** page that shows the log live, including escalations and how the human answered.

This is the "continuous audit" from the Tameion prior-art section: a reviewer replays the agent's reasoning instead of reconstructing it from statements.

## Decisions taken

- **Network**: Arc Testnet first (Circle agent wallet, policy limits and USYC are available there); a mainnet mirror on real ArcStocks later if time allows.
- **Human approvals**: dashboard + Telegram.
- **Model**: Gemini, spread across several models by role (see *Model routing*).
- **Second price source**: CoinMarketCap Pro API on our Startup plan (API key, server-side only; see *Price cross-check*).

## Architecture

```
            ┌───────────── agent/ (Node, TypeScript) ─────────────┐
 Arc RPC ──▶│ observe ──▶ decide (Gemini, function calling) ─▶ act ─▶ log │──▶ Pandock (setPrizes, sinks)
 ArcStocks  │   balances,   proposes actions as tool     Circle    │──▶ Market (buy stock)
 oracle ───▶│   prices,     calls; deterministic checks  agent     │──▶ USYC Teller
 events ───▶│   liabilities run before anything is sent  wallet    │──▶ Logged(head) anchor
 CMC API ──▶│   second price opinion                              │
            └──────────────────────────┬───────────────────────────┘
                                       ▼
               web/ Treasurer page · approval queue · Telegram bot
```

- **Decide**: Gemini with function calling over a small tool set (`restock`, `set_prize_table`, `move_to_reserve`, `redeem_reserve`, `escalate`, `no_action`). The model proposes; code checks every proposal against the same rules the contract enforces *before* sending, so a bad proposal is caught and logged rather than reverted on-chain.
- **Approve**: escalations land in a queue shown on the Treasurer page and sent to a Telegram bot with Approve / Reject buttons; whichever answers first wins, and the answer is logged with who gave it.
- **Act**: transactions go out from a Circle agent wallet (`circle wallet execute …`), so the wallet policy applies to every call.
- **Market**: mainnet uses the ArcStocks hub (`requestBuy`). Arc Testnet has no ArcStocks, so a small `MockMarket` sells mock `STOCK.arc` tokens at prices relayed from the ArcStocks oracle on mainnet; the agent's code path is the same behind one interface.

## Model routing

Gemini rate limits are **per model and per project** (RPM, input TPM, RPD; RPD resets at midnight Pacific), not per API key, and the exact numbers depend on the account's tier and are only shown in AI Studio. So the agent spreads its calls across models by role, and treats every limit as configuration plus feedback rather than a hard-coded number.

| Role | When it runs | Primary | Falls back to |
|---|---|---|---|
| **Planner**: proposes restock / reprice / reserve / yield actions via function calling | once per cycle, only if the observed state changed | `gemini-3.8-flash` | `gemini-3.7-flash` → `gemini-3.6-flash` |
| **Scribe**: writes the one-paragraph reason for the log and the Telegram message | after each executed or escalated action | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` |
| **Reviewer**: second opinion before anything is escalated or above the soft threshold | rarely, only on escalations | `gemini-3.1-pro-preview` | `gemini-3.8-flash` |

How the router keeps clear of limits:
- **Per-model token buckets** for RPM and RPD, sized from env (`GEMINI_LIMITS=model:rpm:rpd,…`) so they match the project's real tier.
- **429 handling**: on `RESOURCE_EXHAUSTED` the model is benched for the `retryDelay` the error returns (or exponential backoff with jitter), and the role moves to the next model in its chain.
- **Fewer calls in the first place**: cycles are event-driven plus a slow heartbeat; if the state hash hasn't changed since the last cycle the planner isn't called at all. The static system prompt and tool schemas use context caching.
- **Deterministic floor**: if every model in a role's chain is exhausted, the agent does not guess. Money-moving actions fall back to a rule-based safe policy (no new spend; only refunds and reveals that are already owed), and the cycle is logged as "model unavailable".
- Preview models (`gemini-3.1-pro-preview`) have tighter limits, which is why only the rare Reviewer role uses one.
- More keys in the same project add no quota; spreading across several Google Cloud projects to multiply limits is not part of the design.

Model IDs are from Google's model list as of 2026-09-25; they live in one config file so they can be swapped without touching the agent.

## Price cross-check (CoinMarketCap)

Every price the agent acts on comes from the ArcStocks oracle, and a single source is a single point of failure: one stale or wrong print and a reprice could publish a table that overpays, or a restock could buy at the wrong price. So the agent gets a second opinion from the **CoinMarketCap Pro API** (our Startup plan) before it moves money.

- **What it compares**: the ArcStocks oracle price for each stock against CMC's quote for the same equity. `STOCK.arc` tokens are not listed on CMC, so the comparison uses CMC's tokenized-equity / RWA data for the same underlying (e.g. an xStocks listing); small gaps between tokenized venues are normal.
- **When it asks**: not every cycle. Before a reprice, before any restock, and whenever the oracle moves more than a set amount between cycles. Quotes are cached for a few minutes so a cycle never spends credits twice.
- **What it does with the answer**: if the two sources are within a tolerance band (starting point: 2%), the action goes ahead and both prices go in the log. Outside the band, the agent does not act on that stock; it logs both numbers and escalates to a human with the gap. If CMC is unavailable, the agent treats that stock as unconfirmed and skips money-moving actions on it for the cycle.
- **Where the key lives**: `CMC_API_KEY` in the agent's `.env` (git-ignored). CMC is only ever called from the agent service, never from the browser. If the site later shows CMC data (e.g. 24h change on a card), it reads it from the agent's own endpoint.
- **Budget**: sized from the plan's real limits, read at startup from `GET /v1/key/info` (credits per day/month, requests per minute), with a daily credit cap in config and a warning in the log as it gets close.

The contract's payout-band check can't read CMC (it needs an on-chain price), so this is a layer on the agent side, in front of the contract rule, not a replacement for it.

## Circle stack used

| Tool | Where |
|---|---|
| Agent Wallets + spending policy | the agent's wallet, limits, recipient allowlist |
| USDC (native, gas) | box sales, restocking, refunds |
| USYC | idle reserve earns yield; redeemed ahead of forecast need |
| Contracts | operator role, payout band, sink allowlist, log anchor |
| Paymaster | gasless `open` / `reveal` for box holders (the agent can reveal on their behalf) |
| Gateway / CCTP (App Kit) | buyers fund boxes from other chains |

## What to demo (under 3 minutes)

One full loop, run by the agent on its own: boxes sell → the agent sees the pool running low on NVDA and prices moving → restocks and reprices inside the band → parks surplus in USYC → a large restock trips the threshold and escalates → a human approves on the dashboard → every step is visible in the log, with the chain head on-chain.

## Traction plan

Genuine usage, not a synthetic dataset:
- Pandock itself, with real testnet buyers (friends, the Canteen and Arc Discords).
- Businesses buying boxes in bulk as **customer or employee rewards** (a gift budget the Treasurer draws down), which is where outside businesses come in.
- Report: boxes sold, USDC moved by the agent, restocks and reprices made, decisions escalated vs approved.

## Open questions

- USYC on Arc Testnet needs the agent wallet **allowlisted by Circle Support** (≈24h). File the ticket as soon as the wallet exists.
- Circle agent wallets list Arc Testnet but not Arc mainnet; a mainnet mirror would run from a plain key with the contract policy as the only hard limit.
- The project's actual per-model RPM/RPD (AI Studio → Rate limit) to size the buckets.
- CMC Startup plan limits (from `/v1/key/info`) and which CMC endpoint gives the cleanest per-ticker tokenized-equity quote.

## Timeline (Tameion: Sep 27 – Oct 10)

Tameion judges the work done *during* the event, so implementation starts Sep 27; this document and the existing site are the starting point to report.

1. Contract: operator role, payout band with price source, sinks, log anchor, `MockMarket`. Tests.
2. Agent: observe → decide → act → log loop against a local fork, then Arc Testnet.
3. Circle agent wallet + policy; USYC once allowlisted.
4. Treasurer page, approval queue and Telegram bot.
5. Deploy, onboard buyers and business customers, record the demo, submit (deadline Oct 10, 11:59 PM ET).
