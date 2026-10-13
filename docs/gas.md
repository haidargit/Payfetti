# Gas & cost model

> **All figures below are MEASURED on Arc mainnet**, Oct 8 2026, chain 5042, at the
> 20 Gwei base-fee floor. Reproduce with `python3 scripts/measure-gas.py`.
>
> Contract figures come from `forge test --gas-report`; transfer and batch figures
> come from `eth_estimateGas` against mainnet using a `from` address that already
> holds USDC. Read-only: nothing signed, nothing spent, no wallet needed.
>
> Arc cost formula (`docs.arc.io/arc/references/gas-and-fees.md`):
> **cost in USDC = gas × baseFeePerGas ÷ 10¹⁸**, minimum base fee **20 Gwei**.
> At the floor: **1M gas ≈ $0.02**.

---

## The headline

| Payees | Gas | Cost @ 20 Gwei | Same payout via PayPal |
|---|---|---|---|
| 10 | 598,405 | $0.012 | ~$3–5 |
| **50** | **2,382,688, executed** | **$0.0477** | ~$15–25 |
| **200** | 9,425,620 (estimate) | **$0.189** | ~$60–100 |
| 500 | 23,363,327 (estimate) | $0.467 | ~$150–250 |
| 642 | 29,960,509 (estimate) | $0.599 | n/a (at the block limit) |

**Marginal cost per payee: 46,459 gas ≈ $0.00093.**

### Where the comparison figures come from

The Arc column is measured. The PayPal column, and the rail table in the README,
are **published list prices checked October 2026**. They are not benchmarks we ran
and nothing refreshes them.

| Rail | Figure used | Source |
|---|---|---|
| Card / PayPal | $0.30–0.50 | [Stripe](https://stripe.com/pricing) 2.9% + 30c, [PayPal](https://www.paypal.com/us/webapps/mpp/merchant-fees) 3.49% + $0.49 |
| ACH | ~$0.25 | typical flat origination fee, which varies by bank rather than having one list price |
| International wire | $10–15 | sender's side only |

Two of the three are deliberately generous to the incumbent:

- **Card counts only the fixed component.** At $1.50 a head Stripe's 2.9% adds
  another 4.4c on top of the 30c, so the real figure is nearer $0.34. The fixed
  part is what creates the floor, and the floor is the argument, so the percentage
  is left out rather than claimed.
- **Wire sits well below the $25–50 US banks commonly publish** for an outgoing
  international transfer, and recipients and intermediary banks often take their own
  cut on top.

Percentage-priced ACH also exists and is cheaper on small amounts: Stripe's is 0.8%
capped at $5, about 1.2c on a $1.50 payment. Still more than ten times our figure,
but the flat fee is not universal.

Erring against ourselves costs nothing when the gap is three orders of magnitude.

### The 50-payee row was sent, not estimated

Arc testnet tx [`0x9ef59d48…28a79`](https://explorer.testnet.arc.io/tx/0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79),
one `aggregate3` with 51 subcalls (50 transfers + `recordRun`), 13,284 bytes of calldata:

| | |
|---|---|
| **gas used** | **2,382,688** |
| node pre-estimate | 2,402,765, **0.8% high** |
| gas price | exactly 20 Gwei (`--priority-gas-price 0`) |
| **cost** | **$0.047654** |
| block limit | 7.9% of 30M |
| result | **49 paid & proven · 1 skipped · 0 problems** |

Node estimates are accurate to within ~1%, so a UI cost preview can be trusted.
Reproduce the verification with `scripts/verify-run.py`.

## Measured: `Payfetti.sol` (forge gas-report)

| Function | Gas (median) | Gas (max) | Cost @ 20 Gwei | Notes |
|---|---|---|---|---|
| `recordRun` | 93,873 | 94,719 | **~$0.0019** | one fresh `Run` struct, 3 SSTOREs |
| `markSkipped` | 25,076 | 73,631 | ~$0.0005–0.0015 | scales with list length. **Executed on Arc testnet Oct 12 2026**: one payee, 50,091 gas, $0.001002, estimate 0.8% high |
| `verifyInclusion` | 3,564 | 4,160 | **$0** | `view` → free over `eth_call` |
| `getRun` | 7,379 | n/a | **$0** | `view` |
| `leafOf` | 731 | n/a | **$0** | `pure` |

**Deployed bytecode: 2,555 bytes** (initcode 2,584).

**Deploy cost, actually deployed to Arc testnet, Oct 8 2026:**

| | |
|---|---|
| **gas used (real)** | **605,687** |
| forge's pre-estimate | 787,393 (carries a safety buffer, ignore it) |
| cost at 20 Gwei | **~$0.0121** |
| cost at a 25 Gwei cap | **~$0.0151** |

Far below the **$0.50–1** generic figure in Arc's docs.

### Cap the gas price, or forge overpays by ~9×

The first testnet deploy let forge auto-estimate the fee and it chose a **155 Gwei
priority fee** on top of the 20 Gwei base, presumably from outlier transactions in
recent blocks. Result: **177.75 Gwei effective, $0.1077 paid** for a deploy that
should cost ~$0.012.

Arc's priority fees are normally negligible (mainnet observed at 20.000001 Gwei,
i.e. ~zero priority). So this is forge's estimator misfiring, not the network.

**Always pass `--with-gas-price 25000000000`** (25 Gwei) on deploys and sends. It
must stay **above the 20 Gwei floor** or the transaction is silently dropped.

| | Gas price | Deploy cost |
|---|---|---|
| auto-estimated (what happened) | 177.75 Gwei | $0.1077 |
| capped at 25 Gwei | 25 Gwei | **$0.0151** |

**The contract adds ~$0.002 to a run**, a rounding error against the transfers.

## Measured: USDC transfers on Arc

### Standalone transfer (one transaction, one payee)

| Destination | Gas | Cost |
|---|---|---|
| **fresh/never-seen address** (realistic for payouts) | 74,814 | $0.00150 |
| existing USDC holder | 49,326 | $0.00099 |

A fresh payee costs more because it needs a new balance slot.

### Why the standalone number overstates batch cost

`eth_estimateGas` on a standalone transfer includes the **21,000-gas base
transaction fee**. A batch pays that **once**, not per payee. So never project batch
cost by multiplying the standalone figure, which inflates the result by ~60%.

Measure the batch directly instead. Per-payee cost inside `aggregate3`:

| Batch size | Total gas | Per payee |
|---|---|---|
| 1 | 85,169 | 85,169 |
| 2 | 131,377 | 65,688 |
| 5 | 271,666 | 54,333 |
| 10 | 503,686 | 50,368 |
| 25 | 1,200,103 | 48,004 |
| 50 | 2,362,047 | **47,240** |

Per-payee cost **falls with scale** and asymptotes to ~46.5k as the fixed overhead
amortizes. Fitting the 10→50 range:

- **marginal cost per extra payee: 46,459 gas** ($0.000929)
- **fixed overhead per batch: 39,096 gas** ($0.00078)

So a run costs roughly `39,096 + 46,459 × payees + 94,719` gas.

## Measured: the cost of an on-chain note per payee

Wrapping each transfer in Arc's `Memo` predeploy writes the payee's note
permanently on-chain. Measured with `eth_estimateGas` on Arc testnet — rerun it
with `python3 scripts/probe-memo.py`:

| Per payee | Gas | At 20 Gwei |
|---|---|---|
| bare transfer | 46,291 | $0.000926 |
| wrapped in `Memo` | 55,589 | $0.001112 |
| **the note costs** | **9,299** | **$0.000186** |

A 200-payee run goes from **$0.1854 to $0.2228** — 3.7 cents — and the ceiling in
one block falls from ~647 to ~539 payees. `MAX_PAYEES` stays 500, so the cap is
valid in both modes.

The bare figure here re-measured at **46,291** against the **46,459** above. The
0.4% gap is `eth_estimateGas` drift against a sent transaction, not a change in
cost; neither number supersedes the other. `estimateRunGas(n, onChainNotes)` in
`web/src/lib/chain.ts` carries both.

Full write-up, including why `Memo` nesting inside `Multicall3From` had to be
measured rather than read off the docs: `docs/memo.md`.

## Measured: a real 4-call batch on testnet (the `CallFrom` probe)

One `aggregate3` containing 3 USDC transfers (one of them a deliberate
zero-address revert) plus `recordRun`:

| | |
|---|---|
| estimated by Arc's node | 187,699 gas |
| **actual gas used** | **185,063** |
| effective gas price | **exactly 20 Gwei** (`--priority-gas-price 0`) |
| **cost** | **$0.0037** |

Node estimates land within ~1.5% of actual, so a UI cost preview can be trusted.

**Always pass `--priority-gas-price 0`** alongside `--gas-price 25000000000`. Without
it, forge/cast inherit a wild priority-fee estimate (177 Gwei observed) and overpay
~9×.

## Limits

**Hard ceiling: one run must fit in 30M gas** (Arc's per-block capacity).

- theoretical max: **~642 payees** bare, **~539** with on-chain notes
- **chunk above ~500** for headroom, since the base fee can rise and estimates aren't exact. 500
  sits under the tighter of the two ceilings, so the cap never depends on whether notes are on

The UI must enforce this, not discover it at submission time.

## Reminders that bite

- **`maxFeePerGas` below 20 Gwei → the transaction is silently dropped.** No error,
  no receipt. Set it explicitly. (Observed live: the chain sits at 20.000001 Gwei.)
- Max base fee is **20,000 Gwei**, 1000x the floor. A cost preview should quote at
  the current base fee and say that it floats.
- Amounts in `USDC.transfer` are **6-decimal**; gas accounting is **18-decimal**
  native. Factor 10¹².
- **Live proof of the truncation trap:** a sampled mainnet account reports
  `balanceOf` = `31.950113` USDC but a native balance of `31.95011344274752`. The
  6-decimal view silently drops `...44274752`. **Never use `balanceOf` for
  accounting or crediting.**
- `recordRun`'s `total` is stored in 6-decimal units, matching the transfers.

## Still unmeasured

- [x] ~~Deploy gas~~ → **605,687 actual** on the real testnet deploy.
- [x] ~~`recordRun` inside a real `aggregate3`~~ confirmed; 185,063 gas for a
      4-call batch, `CallFrom` preserves the sender
- [ ] Whether `Memo` can nest inside `Multicall3From` (both require an EOA caller)
- [x] ~~`allowFailure` isolating a failing transfer~~ confirmed live
