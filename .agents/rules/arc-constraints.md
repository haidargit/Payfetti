# Arc constraints

Chain behaviour that differs from Ethereum and has already cost us time. Figures are
measured, not quoted: see `docs/gas.md`.

## Gas price has a floor, and missing it fails silently

Minimum base fee is **20 Gwei**. A transaction below it is dropped with no error and
no receipt, so it looks like it vanished. Always set the price explicitly, and pass
`--gas-price 25000000000 --priority-gas-price 0` on sends.

Priority fees on Arc are effectively zero, but Foundry's estimator has been seen
inventing a 155 Gwei tip and overpaying by about 9x. Cap it.

## USDC has two decimal views over one balance

The ERC-20 interface is **6 decimals**; the native view is **18**. Transfers and
`recordRun`'s `total` are 6-decimal. Mixing them is a factor of 10^12.

Never use `balanceOf` for accounting: it truncates. A sampled account reporting
`31.950113` actually holds `31.95011344274752`.

Receipt verification must also filter to the **ERC-20 emitter** (`0x3600…0000`), not
Arc's system emitter, or it will double-count a single transfer.

## Transfers can revert, so failure must be isolated

Arc enforces USDC blocklists at protocol level, and a non-zero transfer to `0x0`
always reverts. `allowFailure: true` on every transfer is what stops one bad row
destroying a 200-payee run. Reject zero addresses client-side too.

## One run must fit in a block

30M gas per block caps a run at roughly **642 payees**. The UI chunks above 500 for
headroom, since the base fee can rise and estimates are not exact. Enforce this
before submission rather than discovering it at send time.

## `forge script` cannot simulate Arc

It always simulates locally first, and the local EVM has no Arc precompiles, so
anything through `CallFrom` (`Multicall3From`, `Memo`) dies with `StackUnderflow`
before broadcast. Use `cast send`, which estimates on Arc's own node. Plain deploys
are fine. See `docs/arc-notes.md`.

## viem ships the wrong RPC URLs

`viem/chains` points at `rpc.*.arc.network`, which returns 403 with no CORS headers.
Arc publishes `rpc.*.arc.io`. Always pass the URL explicitly; `web/src/lib/chain.ts`
handles this via `RPC_URL`.
