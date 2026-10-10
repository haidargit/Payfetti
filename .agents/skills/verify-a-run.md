# Verify a run

Check that a payout run actually happened, the way a payee's receipt page must. All
read-only: signs nothing, spends nothing, needs no wallet.

A run is only genuine if **both** halves hold for a payee:

1. on-chain `verifyInclusion` returns true, so the payer committed to this exact
   amount, and
2. a USDC `Transfer(payer -> payee, amount)` log sits in the **same transaction** as
   that run's `RunRecorded` event, so the money moved.

A row with half 1 and not half 2 is a declaration, not a payment. That is the
expected outcome for a blocklisted or zero address, and it should report as skipped.

## Run it

```bash
python3 scripts/verify-run.py \
  --tx 0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79 \
  --proofs fixtures/batch-50-proofs.json
```

Expected on that run: the local Merkle root matches the on-chain root, 49 paid and
proven, 1 skipped (the deliberate zero address), 0 problems, and both forgery checks
rejected (an inflated amount, and a stranger reusing a real proof).

## Reproduce the cost figures

```bash
python3 scripts/measure-gas.py
```

Estimates come from `eth_estimateGas` against the live network, so they move a
little with chain state. They should land within about 1% of the figures in
`docs/gas.md`.

## If a proof fails

Suspect Merkle drift before suspecting the chain. See
[`merkle-parity.md`](../rules/merkle-parity.md).
