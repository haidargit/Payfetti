# Security model

> What this design protects against, and what it does not.
> Last updated Oct 8, 2026 · `contracts/src/Payfetti.sol`

---

## 1. The single most important property

**The contract cannot lose anyone's money, because it never has any.**

`Payfetti.sol` contains no token transfers, no `approve`, no `transferFrom`, no
`payable` function, no `receive`/`fallback`, and no way to move value. It holds no
USDC balance and no allowance over anyone's balance. Funds move **wallet → wallet**
inside Arc's `Multicall3From`; this contract only writes a record alongside them.

Consequences:

- A bug here cannot drain funds. The worst case is a wrong or missing *record*.
- There is no custody, so no custody risk, and no "the contract got hacked" scenario.
- It needs no reentrancy guard: it makes no external calls at all.

This is the main reason the design puts the money in `Multicall3From` rather than in
our own distributor contract. A pull-based distributor (`approve` → `transferFrom` →
fan out) would have been more conventional, and would have introduced an allowance
and a momentary custody window. We don't want either.

## 2. No privileged roles

No `owner`, no admin, no pause, no upgrade path, no proxy. Once deployed the
bytecode is final. There is no key whose compromise would matter, because there is
no key with any power over the contract.

Access control is **structural rather than checked**: every record is stored under
`msg.sender`, and no function accepts a payer address as an argument. So:

- a run can never be recorded in someone else's name,
- only a run's own payer can flag its skipped payees,
- `runId`s are namespaced per payer, so nobody can squat or block another payer's
  identifier by front-running it.

Pinned by `test_recordRun_attributesToDirectCaller_notAnIntermediary`.

## 3. What a receipt actually proves

This is the sharpest limitation in the design, and it is deliberate.

`verifyInclusion` proves **inclusion in a declaration**, not that money moved.
Nothing prevents a payer from calling `recordRun` with a Merkle root describing 200
payouts while sending zero transfers. The inclusion proof would still return
`true`. The contract cannot inspect its sibling subcalls, so it cannot verify
transfers itself.

**A complete receipt therefore has two halves:**

| Half | What it proves | Where it comes from |
|---|---|---|
| 1. Merkle inclusion proof | the payer *committed* to paying this payee exactly this amount in this run | `verifyInclusion`, free over `eth_call` |
| 2. USDC `Transfer(payer → payee, amount)` log | the money actually moved | the transaction's own logs |

**Both must be in the same transaction.** Because `recordRun` and the transfers are
subcalls of one `aggregate3`, they necessarily share a transaction hash, and that
shared hash is what makes the pair unforgeable:

- a fabricated declaration has **no matching transfer** in its transaction;
- a transfer with no declaration has **no committed amount** to check against.

> **Requirement on the frontend:** the receipt view MUST verify both halves and
> must show the transaction hash. Verifying only the Merkle proof would present a
> fabricable claim as proof of payment. This is a correctness requirement, not a
> nice-to-have.

### Which `Transfer` log to read

Arc emits USDC transfers from **two** emitters: the system emitter
`0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` at **18** decimals (EIP-7708) and the
ERC-20 contract `0x3600…0000` at **6** decimals. The receipt check must pick one and
scale consistently, or it will mis-compare amounts by 10¹².

**Observed live** in the probe transaction: one 0.001 USDC transfer produced *both*
logs: `1e15` from the system emitter and `1000` from the ERC-20 contract. A verifier
reading both without filtering would double-count.

**Use the ERC-20 emitter** (`0x3600…0000`, 6 decimals): it matches the amounts in our
Merkle leaves directly, needing no conversion. One caveat seen in the same
transaction: a **self-transfer emits only the ERC-20 log**, no system log, because
EIP-7708 fires only on an actual balance change.

## 4. Self-reported fields

`total` and `count` in `recordRun` are **display metadata and are not verified**
against the Merkle leaves, because the contract never sees them. A payer can record a
`total` that does not match the sum of their leaves.

This is acceptable because nobody needs to rely on them: the authoritative amount
for any payee is the one inside their own Merkle leaf, which cannot be forged. The UI
should compute and display the true total from the list it built, not read it back
from the chain and present it as verified.

## 5. Arc-specific failure modes we handle

| Arc behaviour | Risk | Our handling |
|---|---|---|
| **Blocklist reverts** on transfers to screened addresses, consuming gas with no receipt | one bad address kills a 200-payee run | `allowFailure: true` isolates failures. Confirmed live: a batch containing a guaranteed-revert `transfer(address(0))` succeeded, emitted no logs for that subcall, and every sibling call completed |
| **20 Gwei minimum base fee**; lower `maxFeePerGas` is **silently dropped**, with no error and no receipt | a run appears to vanish | set `maxFeePerGas` explicitly; never rely on a default |
| **Dual 6/18-decimal USDC** sharing one balance | 10¹² scaling errors; `balanceOf` truncates sub-USDC amounts and undercounts | transfer amounts always 6-decimal; **never** use `balanceOf` for accounting |
| **Non-zero transfer to `0x0` reverts** | a wasted run | reject zero addresses client-side before building the batch |
| **30M gas per block** | an oversized run cannot land | max ~642 payees; UI chunks above ~500 for headroom (`docs/gas.md`) |
| `PREVRANDAO` returns 0, so no on-chain randomness | n/a | we never use randomness |

## 5b. Verified on-chain

Arc testnet, Oct 8 2026. A 50-payee run plus follow-up probes:

| Property | Evidence |
|---|---|
| `CallFrom` preserves the sender | `runExists(payer)=true`, `runExists(Multicall3From)=false` |
| `allowFailure` isolates a failure | a `transfer(address(0))` row reverted, emitted no logs; the other 49 transfers completed |
| Receipts verify (both halves) | 49/50 rows passed inclusion proof **and** had a matching ERC-20 `Transfer` in the same tx |
| Forged amount rejected | `verifyInclusion` with an inflated amount → `false` |
| Forged payee rejected | a stranger reusing a real proof → `false` |
| Merkle root parity | the Python tree reproduces the on-chain root exactly |
| **Idempotency guard** | resubmitting the same `runId` reverts with `RunAlreadyRecorded(payer, runId)`, selector `0xe6779d42`. Because it reverts at the `aggregate3` level, **the 49 transfers do not re-execute**: a resubmitted batch cannot double-pay |
| Dual-emitter hazard | 49 transfers produced 49 ERC-20 logs **and** 49 system logs. A verifier must filter to one emitter; we use the ERC-20 one |

## 6. Residual risks

| Risk | Severity | Status |
|---|---|---|
| A payer declares a run and sends no transfers | **Medium** | mitigated by the two-half receipt (§3); requires correct frontend |
| `total`/`count` misreported | Low | documented as unverified metadata (§4) |
| ~~`CallFrom` sender preservation~~ | n/a | Confirmed on Arc testnet, Oct 8 2026. `runExists(payer)=true`, `runExists(Multicall3From)=false`. A run is ONE transaction |
| `markSkipped` flags are write-only (never unset) | Low | by design: retries create a new run, so skip flags are historical |
| `markSkipped` with a very large payee list could exceed the block gas limit | Low | ~20k gas per payee; chunk the call |
| Payee wallet loss / wrong address pasted by the payer | **High, and out of our control** | on-chain transfers are irreversible. The UI must make the preview and validation step hard to skip |
| Merkle tree built in TS must match the contract's sorted-pair, double-hashed leaves exactly | Low | `scripts/keccak.py` is chain-verified, and `web/tests/merkle.test.ts` pins the TS tree against values the deployed contract accepted. Runs in CI |
| **A smart-contract wallet cannot be a payer.** `CallFrom` allows only its allowlisted predeploys, so Safe and ERC-4337 accounts revert | Medium, **unfixable** | a protocol constraint, not our bug. Treasuries on a multisig cannot use Payfetti at all; say so rather than letting them discover it at submission. See `docs/memo.md` |
| **On-chain notes are public and permanent**, and may carry personal data | Medium | per-run opt-out, on by default, with the consequence stated in the UI beside the switch. Notes are the payer's own text; we neither screen nor redact them |
| **A fixture committed from a real run would publish third parties' addresses, amounts and reasons** into a public repo, collated into one searchable file | **High if it ever happens** | committed fixtures are testnet only, with payees generated by `keccak256(runLabel ‖ index)` so no private key exists for them. Rule and pre-commit checklist: `.agents/rules/fixtures.md` |

## 7. Not done yet

- [ ] Static analysis (`slither`): low value given no token logic, but cheap
- [ ] `forge coverage` report
- [x] ~~Cross-implementation Merkle test: TypeScript tree vs. `scripts/keccak.py`~~ (`web/tests/merkle.test.ts`, runs in CI)
- [x] ~~Testnet verification of `CallFrom` and transfer gas~~ (both confirmed Oct 8 2026)
- [x] ~~Confirm whether `Memo` can nest inside `Multicall3From`~~ → **it does**, measured on Arc
  testnet Oct 11 2026. `docs/memo.md` has the cases, the controls that make them mean something,
  and what `eth_call` still cannot prove. Reproduce with `python3 scripts/probe-memo.py`

## 8. Explicitly out of scope for v1

No compliance/sanctions screening of payees (Arc enforces USDC blocklists at the
protocol level, but that is not the same as screening). No refunds or clawbacks, since
transfers are final. No fee collection. No rate limiting. No account recovery.
