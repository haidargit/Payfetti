# Architecture: why there is no backend and no database

> The short version: **the chain is the database, and a receipt from a database
> would be worth less than a receipt from the chain.** But that is not true of
> *every* feature, and this document is honest about where it breaks down.

---

## Where each traditional responsibility lives

| Traditional backend concern | Normally | In Payfetti |
|---|---|---|
| Database | Postgres / Mongo | the chain; the `_runs` mapping *is* the table |
| Business logic | Go / PHP / Node service | the contract: idempotency, attribution, proof checks |
| Auth / sessions | passwords, JWT, cookies | the wallet signature. **`msg.sender` is the authentication** |
| API layer | REST / GraphQL | the ABI. `eth_call` reads (free), transactions write |
| Access control | `WHERE user_id = ?` | structural: records live under `msg.sender`, so no query can reach another payer's run |
| Secrets management | `.env`, Vault, KMS | **there are no secrets.** Nothing to rotate or leak |
| Hosting | a server you patch | static files on a CDN |

## Why a database would make the product *worse*

**A receipt in our Postgres is a claim. A receipt from the chain is proof.**

The reason a research lab would use Payfetti is that a payee can verify payment
**without trusting us**, and without us still existing. If receipts lived in our
database, their value would depend on our uptime, our honesty, and our not being
breached. The moment a server stands between the payee and the truth, we become a
party that must be trusted, and the compliance artifact stops being evidence.

That is not architectural purity. It is the feature.

## The honest exception: run history

This is where the no-backend stance genuinely costs something, and it should not be
hand-waved.

Looking up **one** run is O(1): the receipt URL carries payer + runId, and the run
record stores its own `blockNumber`, so the receipt page jumps straight to the
transaction. No scanning, no indexer.

Listing **all of a payer's runs** is the opposite shape. It means filtering
`RunRecorded` logs by payer across millions of blocks. `payer` is an indexed event
topic so `eth_getLogs` *can* do it, but public RPCs range-limit those queries. This
is precisely the job an indexer exists for, and a database would do it better.

### What "just add a database" actually costs

The database is the cheap part. What comes with it:

1. **A server.** A browser cannot talk to Postgres; you need an API in front.
2. **Authentication.** Payer A must not read payer B's runs, so accounts and
   sessions, or signature login (SIWE). Today `msg.sender` does this for free.
3. **Secrets.** DB credentials would be the project's first secret. Right now there
   are none to rotate, leak, or protect.
4. **A privacy surface.** We would hold a list of who paid whom, how much, and when.
   That is sensitive data we currently do not possess and therefore cannot lose.
5. **Operations.** Backups, migrations, uptime, all for a feature that lists things the
   chain already knows.

So "add a DB" is really "add a backend, auth, secrets, and a PII store."

### The distinction that matters

**Database as source of truth.** Wrong here. It makes receipts depend on us.

**Database as cache or index.** Fine, and the standard dApp pattern (The Graph,
Ponder, Subsquid). The chain stays authoritative; the index is a rebuildable read
optimisation. If it is wrong, stale, or deleted, **nothing is lost**: every receipt
still verifies directly against Arc.

If we add storage later, it must be the second kind. That constraint is the whole
point of this document.

## The plan, by stage

| Stage | Run history | Needs a backend? |
|---|---|---|
| **v1 (now)** | `localStorage` on the device that created the run + a downloadable run file | no |
| **v1.5** | paginated `eth_getLogs` filtered by the indexed `payer` topic, from the contract's deploy block, cached locally | no |
| **v2** | an indexer for instant cross-device history | yes, as a cache, never as the record |

**v1's honest limitation:** clear your browser and the *list* is gone. The runs
themselves are not: they are on Arc, and every receipt link still verifies. This is
why the app also offers an **export** of the run (payees, amounts, proofs, tx hash):
for a researcher who must show an ethics board what was paid, a signed-by-the-chain
JSON file they keep is arguably better than a row in a vendor's database.

## When a backend genuinely becomes necessary

| Feature | Needs backend? | Why |
|---|---|---|
| Email claim links for payees without wallets | **yes** | store email↔address, send mail |
| Compliance / sanctions screening | yes | vendor API keys are secrets |
| Recurring or scheduled runs | yes | something must wake up and fire |
| Cross-device run history | yes, as an index | see above |
| CSV upload of 10k rows | maybe | the browser handles a few thousand fine |
| Everything in v1 | no | |

The first row is also the wallet problem, the honest ceiling on who can receive
money. So "when do we need a backend" and "when do we grow past the crypto-native
audience" turn out to be the same question.

## Why Circle's own samples *do* have backends

Not an inconsistency, just different requirements. `arc-escrow` and `arc-p2p-payments`
run Next.js + Supabase because they use **developer-controlled wallets** (custody
means private keys on a server), **webhooks**, **passkey registration**, and **AI
validation**. Every one of those genuinely needs a server.

Payfetti does none of them. The payer signs with their own wallet; we never hold
keys, and never hold funds.

## Related

- `security.md`, what a receipt proves and what it does not
- `gas.md`, the measured cost model behind the UI's fee preview
- `arc-notes.md`, two Arc gotchas that cost us time
