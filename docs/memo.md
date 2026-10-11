# On-chain notes: `Memo` inside `Multicall3From`

Reproduce everything here with:

```bash
python3 scripts/probe-memo.py
```

Read-only — `eth_call` and `eth_estimateGas` only. No signature, no funds moved.

## The question

Arc predeploys two contracts we need at once:

| Contract | Address (mainnet and testnet) | What it does |
|---|---|---|
| `Multicall3From` | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | batches N calls, preserving the EOA as `msg.sender` |
| `Memo` | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | wraps one call, emitting a note bound to `keccak256(callData)` |
| `CallFrom` | `0x1800000000000000000000000000000000000003` | the precompile both route through |

Circle's docs cover them in separate pages and **never state that one can be
nested inside the other**. The batched-transactions page does not mention `Memo`
at all. Without nesting, a note per payee would cost one transaction per payee,
which destroys the batching that makes Payfetti viable at all.

Reading the source does not settle it either. `Memo`'s verified source says:

```solidity
// @dev EOA-only: contract callers hit the callFrom sender-spoofing constraint
//      and the call reverts without raising {MemoFailed}.
(bool success, bytes memory returnData) = CALL_FROM.callFrom(msg.sender, target, data);
```

`Memo` forwards whatever `msg.sender` it sees. `Multicall3From` claims to make
that the original EOA. Whether the precompile permits the resulting *nested*
spoof is implemented in the node, not in Solidity, so it has to be measured.

## Result

Measured on Arc testnet:

| Case | Result |
|---|---|
| `aggregate3([USDC.transfer])` | pass |
| `Memo.memo(USDC, transfer)` direct from an EOA | pass |
| **`aggregate3([Memo.memo])`** | **pass** |
| **`aggregate3([Memo.memo × 2])`** | **pass** |
| `callFrom(someone_else, …)` from an EOA | refused — `unauthorized caller` |
| `callFrom(self, …)` from an EOA | refused — `unauthorized caller` |

**`Memo` nests inside `Multicall3From`.** One transaction carries N transfers,
each with its own permanent on-chain note.

### Why the last two rows matter

`eth_call` sets `tx.origin` to whatever `from` you pass, so it cannot distinguish
an EOA from a contract. Passing a contract address as `from` therefore proves
nothing, and an earlier version of this probe drew a false conclusion from
exactly that mistake.

The controls that do bite ask the precompile to act for an address that is not
the origin, and to act for an EOA calling it directly. **Both are refused**, so
`CallFrom`'s access control is demonstrably enforced inside `eth_call` — which is
what makes the four passes above evidence rather than an artefact. The refusals
also reveal the actual rule: `CallFrom` allows only its allowlisted predeploys,
never an EOA directly.

### What is still unproven

`eth_call` cannot show that a *contract* payer would be rejected, because it
treats any `from` as an origin. Circle's source comment already states this, and
Payfetti's payer is always an EOA, so it does not affect us. It does mean
**smart-contract wallets — Safe, ERC-4337 — cannot be a Payfetti payer**, which
is a protocol constraint, not an implementation gap. See `docs/security.md`.

A signed transaction would be the final word. The `eth_call` result plus the
working controls is what is claimed here, and nothing stronger.

## Cost

| Payees | Bare | With memo | Ratio |
|---|---|---|---|
| 1 | 59,937 | 76,519 | 1.28× |
| 5 | 245,803 | 299,585 | 1.22× |
| 10 | 477,169 | 577,404 | 1.21× |
| 25 | 1,171,614 | 1,411,369 | 1.20× |

Marginal cost of one more payee, from the 5 → 25 slope:

| | Gas | At 20 Gwei |
|---|---|---|
| bare | 46,291 | $0.000926 |
| with memo | 55,589 | $0.001112 |
| **memo adds** | **9,299** | **$0.000186** |

A 200-payee run goes from **$0.1854 to $0.2228** — 3.7 cents — and the ceiling in
a 30M-gas block from ~647 to ~539 payees. `MAX_PAYEES` is 500, so it stays valid
in both modes and the cap never depends on the setting.

The bare figure re-measured at **46,291** against the **46,459** in `docs/gas.md`,
which was measured on mainnet. The 0.4% gap is the drift this method carries;
neither number is wrong.

## How Payfetti uses it

```
Multicall3From.aggregate3([
  Memo.memo(USDC, transfer(payee_i, amount_i), runId, note_i) × N,  // allowFailure: true
  Payfetti.recordRun(runId, root, total, count, label)              // allowFailure: false
])
```

`memoId` is the run's own `runId`. Because the `Memo` event indexes it, one
`getLogs` filtered on that topic returns **every note in a run** — which is why
run history needs no indexer, no backend and no browser storage.

Both modes emit the same `Transfer(payer → payee)` log, since `CallFrom` keeps
the payer as `msg.sender`. A receipt therefore verifies identically either way,
and the Merkle root is unchanged — `web/tests/batch.test.ts` pins both.

`allowFailure: true` still isolates a blocklisted payee. The wrapped failure
reverts the whole subcall, `Memo` included, so a skipped payee leaves no stray
`Memo` event and no gap between the notes and the money.

### The third reading on a receipt

`Memo` publishes `keccak256(callData)`. Recomputing `transfer(payee, amount)` and
matching that hash proves a published note belongs to **this** transfer and not
to some other payee in the same run. `Receipt.tsx` does this as a third check,
and its absence is reported as "no on-chain note", never as a failure — a payer
is allowed to keep notes off-chain.

## The privacy cost

An on-chain note is **public and permanent**. Anyone can read it, forever, and it
cannot be deleted. For our market — "participant 001", a bounty reference, an
invoice number — that is the point. For a note containing a person's name or
anything else identifying, it is a disclosure.

So it is a per-run choice, on by default, with the consequence stated in the UI
next to the switch rather than buried here. With it off, notes live only in the
receipt links, exactly as before.

## Calldata parity

`scripts/probe-memo.py` encodes this calldata by hand in Python. The exact bytes
Arc accepted are pinned as vectors in `web/tests/batch.test.ts`, so viem's
encoder is checked against **bytes a chain accepted** rather than against itself
— the same discipline the Merkle tests use.
