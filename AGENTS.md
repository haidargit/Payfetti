# Payfetti

One-to-many USDC payouts on Arc. A payer pastes `address, amount, note` rows and
signs **one** transaction that pays every payee and records the run. Each payee gets
a URL proving their own payment against the chain.

Arc is Circle's stablecoin L1 where USDC is the native gas token. That is the only
reason $1 payouts are viable here: about $0.00093 per payee, against a $0.25 to $15
per-payment floor on every conventional rail.

## Layout

| Path | What |
|---|---|
| `contracts/src/Payfetti.sol` | the run registry. No token logic, no owner, no upgrade path |
| `contracts/test/` | 20 tests, including 3 fuzz properties |
| `web/src/lib/` | Merkle tree, row parsing, batch builder, chain constants |
| `web/src/pages/` | create a run, verify a receipt |
| `scripts/` | read-only verifiers for every numeric claim in the README |
| `docs/` | threat model, measured gas, architecture, Arc gotchas |

## Build and test

```bash
cd contracts && forge test -vv && forge fmt --check
cd web && npm ci && npm run typecheck && npm test
```

Needs Foundry 1.8 or newer and the Node version in `.nvmrc`. Contracts need
`git submodule update --init --recursive` once.

## What not to break

1. **The contract never touches USDC.** No transfers, approvals, balances or
   `payable`. Money moves wallet to wallet inside Arc's `Multicall3From`, and the
   contract only writes the record beside it. This is why a bug here cannot lose
   funds. Do not add token logic to it.
2. **A run is one transaction.** `aggregate3([transfers..., recordRun])`, with
   `allowFailure: true` on the transfers and `false` on `recordRun`. Splitting it
   breaks both the receipts and the double-pay guard.
3. **Three Merkle implementations must agree exactly.** See
   [`.agents/rules/merkle-parity.md`](.agents/rules/merkle-parity.md).
4. **A receipt has two halves**, the inclusion proof and a USDC `Transfer` log from
   the same transaction. The proof alone only shows the payer *declared* a payment,
   so never present it as proof that money moved.
5. **No backend and no database.** The chain is the store. Any index added later
   must be rebuildable and must never become the source of truth.

Arc's own constraints bite in non-obvious ways. Read
[`.agents/rules/arc-constraints.md`](.agents/rules/arc-constraints.md) before
touching anything that builds or sends a transaction.

House style for comments and commits:
[`.agents/rules/style.md`](.agents/rules/style.md).
