# Arc notes

Two things that cost us real time, in case they save someone else's.

## viem ships the wrong Arc RPC URLs

`import { arc, arcTestnet } from "viem/chains"` gives correct chain IDs (5042 and
5042002) and the right native currency, but its RPC URLs point at
`rpc.*.arc.network`, not the `rpc.*.arc.io` endpoints Arc's own docs publish.

Measured Oct 2026:

| Endpoint | Status | CORS header |
|---|---|---|
| `rpc.testnet.arc.io` | 200 | present |
| `rpc.mainnet.arc.io` | 200 | present |
| `rpc.testnet.arc.network` (viem default) | 403 | none |

A browser app built with the obvious `http()` transport fails every call with an
opaque CORS error, and the real cause, a 403 on a different hostname, never shows
up in the console. So pass the URL explicitly:

```ts
transports: { [chain.id]: http("https://rpc.testnet.arc.io") }
```

Handled in `web/src/lib/chain.ts` via `RPC_URL`.

## `forge script` cannot simulate anything that touches CallFrom

`forge script` always simulates locally before broadcasting, and the local EVM has
no Arc precompiles. Any transaction routed through `CallFrom`, which means anything
using `Multicall3From` or `Memo`, dies in simulation before it is sent:

```
Multicall3From::aggregate3([...])
  ├─ [3] 0x18...  └─ ← [StackUnderflow] EvmError: StackUnderflow
  └─ ← [OutOfGas] EvmError: OutOfGas
```

`StackUnderflow` on a bare address call means a precompile that isn't there. Since
Payfetti's whole flow is an `aggregate3` batch, this rules `forge script` out for
the main transaction.

`cast send` works instead, because it estimates via `eth_estimateGas` on Arc's own
node rather than locally:

```bash
cast send <TARGET> --data "$(cat calldata.txt)" \
  --rpc-url arc_testnet --account <keystore> \
  --gas-limit <estimate x1.4> --gas-price 25000000000 --priority-gas-price 0
```

Plain deploys are unaffected, since no precompile is involved. The frontend is
unaffected too: viem and wagmi send real transactions to the real node and never
simulate locally.
