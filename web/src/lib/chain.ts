import { arc, arcTestnet } from "viem/chains";
import type { Hex } from "viem";

/**
 * USDC and Multicall3From sit at the same addresses on Arc mainnet and testnet,
 * so they are constants rather than environment variables.
 */

export const USDC = "0x3600000000000000000000000000000000000000" as const;
export const MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as const;

/**
 * Arc's predeployed `Memo`. Wraps one call and emits a `Memo` event carrying
 * `keccak256(callData)` plus arbitrary bytes, routing the inner call through the
 * `CallFrom` precompile so the payer stays `msg.sender`.
 *
 * Nesting it inside `Multicall3From.aggregate3` is what lets one transaction
 * carry N transfers each with its own on-chain note. Circle's docs describe the
 * two contracts separately and never state that the combination works, so it was
 * measured on Arc testnet rather than assumed: see `docs/memo.md`.
 */
export const MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as const;

/** The `CallFrom` precompile both predeploys route through. Read from `Memo.CALL_FROM()`. */
export const CALL_FROM = "0x1800000000000000000000000000000000000003" as const;

/** The ERC-20 view is 6 decimals, the native view 18. Never mix them. */
export const USDC_DECIMALS = 6;

/** One run must fit inside this. */
export const BLOCK_GAS_LIMIT = 30_000_000n;

/** Measured on Arc mainnet; see ../../docs/gas.md. */
export const GAS_PER_PAYEE = 46_459n;
export const GAS_BATCH_OVERHEAD = 39_096n;
export const GAS_RECORD_RUN = 94_719n;

/**
 * Wrapping each transfer in `Memo` costs 9,299 gas more per payee — $0.000186 at
 * Arc's 20 Gwei floor, or 3.7c on a 200-payee run. Measured on Arc testnet with
 * `eth_estimateGas`; the bare figure re-measured at 46,291 in the same run,
 * 0.4% off the mainnet number above, which is the drift this method carries.
 */
export const GAS_PER_PAYEE_MEMO = 55_589n;

/**
 * Max payees in one 30M-gas transaction is ~647 bare, ~539 with memos. We cap
 * well below the tighter of the two so the limit never depends on the mode.
 */
export const MAX_PAYEES = 500;

/** Arc's floor. Below it a transaction is silently dropped. */
export const MIN_GAS_PRICE = 20_000_000_000n;

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 5042002);
export const chain = CHAIN_ID === arc.id ? arc : arcTestnet;
export const isMainnet = chain.id === arc.id;

export const PAYFETTI_ADDRESS = (import.meta.env.VITE_PAYFETTI_ADDRESS ??
  "0x7dacb26f14af8e844dabbb2dba1d31427204f835") as Hex;

/**
 * Must override viem's bundled URLs: its `arc` / `arcTestnet` chains point at
 * `rpc.*.arc.network`, which 403s with no CORS headers.
 * See ../../docs/arc-notes.md.
 */
export const RPC_URL =
  import.meta.env.VITE_RPC_URL ??
  (isMainnet ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io");

export const EXPLORER = isMainnet ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export function estimateRunGas(n: number, onChainNotes = false): bigint {
  const perPayee = onChainNotes ? GAS_PER_PAYEE_MEMO : GAS_PER_PAYEE;
  return GAS_BATCH_OVERHEAD + perPayee * BigInt(n) + GAS_RECORD_RUN;
}

/** Arc fees are USDC at 18-decimal native precision: cost = gas × price / 1e18. */
export function gasCostUsdc(gas: bigint, gasPrice: bigint): number {
  return Number((gas * gasPrice * 1_000_000n) / 10n ** 18n) / 1_000_000;
}

export const payfettiAbi = [
  {
    type: "function",
    name: "recordRun",
    stateMutability: "nonpayable",
    inputs: [
      { name: "runId", type: "bytes32" },
      { name: "payeeRoot", type: "bytes32" },
      { name: "total", type: "uint256" },
      { name: "count", type: "uint32" },
      { name: "memo", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getRun",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "runId", type: "bytes32" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "payeeRoot", type: "bytes32" },
          { name: "total", type: "uint256" },
          { name: "count", type: "uint32" },
          { name: "recordedAt", type: "uint64" },
          { name: "blockNumber", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "runExists",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "runId", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "verifyInclusion",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "runId", type: "bytes32" },
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "noteHash", type: "bytes32" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "markSkipped",
    stateMutability: "nonpayable",
    inputs: [
      { name: "runId", type: "bytes32" },
      { name: "payees", type: "address[]" },
    ],
    outputs: [],
  },
] as const;

export const multicall3FromAbi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

/**
 * Taken from the verified source at `explorer.testnet.arc.io`, not hand-written.
 *
 * `memoId` is indexed, so setting it to the run's `runId` makes every note in a
 * run retrievable with one `getLogs` call — which is why run history needs no
 * indexer and no backend.
 */
export const memoAbi = [
  {
    type: "function",
    name: "memo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "data", type: "bytes" },
      { name: "memoId", type: "bytes32" },
      { name: "memoData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Memo",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "callDataHash", type: "bytes32", indexed: false },
      { name: "memoId", type: "bytes32", indexed: true },
      { name: "memo", type: "bytes", indexed: false },
      { name: "memoIndex", type: "uint256", indexed: false },
    ],
  },
  {
    type: "error",
    name: "MemoFailed",
    inputs: [{ name: "returnData", type: "bytes" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
