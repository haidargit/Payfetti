# Payfetti

Pay hundreds of people tiny amounts in one transaction, for pennies, each with a receipt they can verify.

Built on [Arc](https://docs.arc.io), Circle's stablecoin L1, where USDC is the native gas token.

Built for [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants).

**Live on Arc testnet:** [`0x7dacb26f…04f835`](https://testnet.arcscan.app/address/0x7dacb26f14af8e844dabbb2dba1d31427204f835).
Deployed bytecode matches this source byte for byte, at 2,555 bytes. Mainnet pending.

## The problem

You run a survey. 200 people answer. You promised each one $1.

| How you'd pay them today | Fee each   | On a $200 payout                      |
| ------------------------ | ---------- | ------------------------------------- |
| PayPal / card            | $0.30–0.50 | $60–100 in fees                       |
| ACH                      | ~$0.25     | ~$50, plus 200 manual entries         |
| International wire       | $10–15     | $2,000–3,000. Structurally impossible |
| Gift cards               | "free"     | What people actually do               |

Every incumbent rail has a per-payment floor of roughly $0.25 to $15. Below about $2
the fee eats the payment, so the payment usually doesn't happen at all. The study
gets cancelled, or 200 × $1 becomes one $200 raffle.

That floor isn't a tax, it's a hiring filter. If paying someone $2 costs $12, you
don't pay them $2 and grumble. You never make the offer.

## What it does

1. Paste rows: `address, amount, note`
2. Validation: checksums, duplicates, zero addresses, total against your balance
3. Exact dollar cost, shown before you send
4. One click, one transaction
5. Per-payee success or skip, with explorer links
6. Each payee gets a receipt URL proving their own payment

## Why Arc

| Rail               | Per-payment floor |
| ------------------ | ----------------- |
| International wire | $10–15            |
| Card interchange   | $0.25–0.50        |
| ACH                | ~$0.25            |
| **Arc**            | **$0.00093**      |

Measured, not estimated. 200 payees in one `aggregate3` costs 9,425,620 gas, about
**$0.189**. Each extra payee adds 46,459 gas, about **$0.00093**, and that figure
falls as batch size grows and the fixed overhead amortises. One run fits roughly 642
payees inside Arc's 30M gas block.

Reproduce it yourself. Read-only, no wallet, no money:

```bash
python3 scripts/measure-gas.py
```

| Payees | On Arc                               | Same payout via PayPal |
| ------ | ------------------------------------ | ---------------------- |
| 50     | **$0.048** (executed, not estimated) | $15–25                 |
| 200    | **$0.189**                           | $60–100                |
| 500    | **$0.467**                           | $150–250               |

Two Arc-specific properties make this a product rather than a script:

- **`Multicall3From` and the `CallFrom` precompile.** N transfers in one
  transaction, no `approve` step, and `msg.sender` survives, so there is no custody
  and no signature plumbing.
- **Sub-second deterministic finality.** The UI can say "paid" and mean it.

On Ethereum this is arithmetically impossible: 200 transfers would cost more than the
$200 payout.

## How it works

```
Browser → static React app → wallet signs ONE tx → Arc
                                                   └→ Multicall3From.aggregate3([
                                                        USDC.transfer(payee_i, amount_i) × N,  // allowFailure: true
                                                        Payfetti.recordRun(runId, root, …)     // msg.sender preserved
                                                      ])
```

`Multicall3From` only accepts calls from an EOA, so the Payfetti contract rides
*inside* the batch rather than wrapping it. Because `CallFrom` preserves the sender,
`recordRun` sees the payer as `msg.sender` and the record is self-authenticating.

`allowFailure: true` is mandatory. Arc enforces USDC blocklists at the protocol
level, so a transfer to a screened address reverts, and without per-call isolation
one bad address would kill a 200-payee run.

### Verified on-chain, not argued

A 50-payee run on Arc testnet:
[`0x9ef59d48…`](https://testnet.arcscan.app/tx/0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79),
51 subcalls, 13,284 bytes of calldata, 2,382,688 gas, $0.0477.

```
✅ PAID & PROVEN :  49   (inclusion proof + Transfer in the same tx)
⏭️  SKIPPED       :   1   (zero address, allowFailure worked)
❌ PROBLEMS      :   0
```

Resubmitting that same batch reverts with `RunAlreadyRecorded` at the `aggregate3`
level, so the 49 transfers never re-execute. A resubmitted batch cannot double-pay.

Check it yourself, also read-only:

```bash
python3 scripts/verify-run.py \
  --tx 0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79 \
  --proofs fixtures/batch-50-proofs.json
```

### What the contract is for

Moving the money is the easy part. The contract does three things:

| Job                                               | Why                                                            |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Rejects a duplicate `runId`                       | a double-click or a retry cannot double-pay                    |
| Stores a Merkle root over `(payee, amount, note)` | each payee gets a receipt proving *they* were paid this amount |
| Records skipped payees                            | re-run only the failures, not the whole batch                  |

It never touches USDC. A bug here cannot lose funds; the worst case is a wrong
record. See [`docs/security.md`](docs/security.md).

### What a receipt proves, and what it doesn't

A Merkle proof alone only shows the payer *declared* a payment. A complete receipt is
two halves that share one transaction hash: the inclusion proof, and the payee's USDC
`Transfer` log from that same transaction. Because `recordRun` and the transfers are
subcalls of one `aggregate3` they cannot be separated, so a fabricated declaration
has no matching transfer and a stray transfer has no committed amount to check
against. The receipt view verifies both.

It also means no backend and no indexer: the run's block number goes in the receipt
URL, making a lookup O(1) instead of a log scan.
[`docs/architecture.md`](docs/architecture.md) covers why that is deliberate, and the
one feature where it genuinely costs us something.

## Stack

Solidity 0.8.24 · Foundry · React 18 + TypeScript + Vite · wagmi + viem · ConnectKit

## Build and test

```bash
git submodule update --init --recursive
cd contracts && forge test -vv
```

```bash
cd web && npm ci && npm test && npm run dev
```

Needs Foundry 1.8 or newer, and the Node version pinned in `.nvmrc`.

## Layout

```
contracts/
  src/Payfetti.sol      the run registry: no token logic, no owner, no upgrade path
  test/Payfetti.t.sol   20 tests, including 3 fuzz properties
  script/Deploy.s.sol   deploy to arc / arc_testnet
web/                    React frontend: create a run, verify a receipt
docs/
  security.md           threat model, including what a receipt does not prove
  gas.md                every cost figure, measured
  architecture.md       why there is no backend or database
  arc-notes.md          two Arc gotchas that cost us a day
scripts/                read-only verifiers for the claims above
fixtures/               Merkle proofs for the 50-payee testnet run
```

## Status

- [x] `Payfetti.sol` and tests, 20 passing
- [x] Deployed to Arc testnet, bytecode matching source
- [x] `CallFrom`, `allowFailure`, receipts and idempotency verified on-chain
- [x] 50-payee run executed: 49 paid, 1 skipped, $0.0477
- [x] Frontend: create and receipt flows
- [ ] Deployed and verified on Arc mainnet
- [ ] Frontend hosted
- [ ] End-to-end 50-payee mainnet run

## Honest limits

- **Payees need a wallet address.** This is the real ceiling on reach and v1 does not
  solve it. Email claim links, passkey wallets and local cash-out are phase two.
- v1 charges no fee and does no compliance screening.
- Payfetti doesn't create work. It makes paying for work that already exists
  possible, which is one layer below a marketplace.

## Disclosure

Built with AI assistance, disclosed per Arc Microgrants submission requirements.

## License

MIT
