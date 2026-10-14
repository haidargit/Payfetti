import { arc, arcTestnet } from "viem/chains";
import type { Hex } from "viem";

/**
 * USDC and Multicall3From sit at the same addresses on Arc mainnet and testnet,
 * so they are constants rather than environment variables.
 */

export const USDC = "0x3600000000000000000000000000000000000000" as const;
export const MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as const;

/**
 * Arc's predeployed `Memo`. Wraps one call, emits `keccak256(callData)` plus
 * arbitrary bytes, and routes through `CallFrom` so the payer stays
 * `msg.sender`. Nesting it inside `aggregate3` was measured: `docs/memo.md`.
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

/** `Memo` costs 9,299 gas more per payee, $0.000186 at the floor. */
export const GAS_PER_PAYEE_MEMO = 55_589n;

/** ~647 bare, ~539 with memos, so cap below both and ignore the mode. */
export const MAX_PAYEES = 500;

/** Arc's floor. Below it a transaction is silently dropped. */
export const MIN_GAS_PRICE = 20_000_000_000n;

/**
 * A copied `.env.example` leaves vars present but blank, and `"" ?? x` is `""`.
 * Blanks are unset here, so an empty address never reaches `recordRun`.
 */
function env(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

const CHAIN_ID = Number(env(import.meta.env.VITE_CHAIN_ID) ?? 5042002);
export const chain = CHAIN_ID === arc.id ? arc : arcTestnet;
export const isMainnet = chain.id === arc.id;

export const PAYFETTI_ADDRESS = (env(import.meta.env.VITE_PAYFETTI_ADDRESS) ??
  "0x7dacb26f14af8e844dabbb2dba1d31427204f835") as Hex;

/**
 * Must override viem's bundled URLs: its `arc` / `arcTestnet` chains point at
 * `rpc.*.arc.network`, which 403s with no CORS headers.
 * See ../../docs/arc-notes.md.
 */
export const ARC_RPC = "https://rpc.mainnet.arc.io";
export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.io";

export const RPC_URL = env(import.meta.env.VITE_RPC_URL) ?? (isMainnet ? ARC_RPC : ARC_TESTNET_RPC);

export const ARC_EXPLORER = "https://explorer.arc.io";
export const ARC_TESTNET_EXPLORER = "https://explorer.testnet.arc.io";

export const EXPLORER = isMainnet ? ARC_EXPLORER : ARC_TESTNET_EXPLORER;

/**
 * For a transaction on a named network, not the current one. `txUrl` follows
 * the build, so a mainnet build would link a testnet hash to a dead page.
 */
export function txUrlOn(net: "mainnet" | "testnet", hash: string): string {
  return `${net === "mainnet" ? ARC_EXPLORER : ARC_TESTNET_EXPLORER}/tx/${hash}`;
}

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
    name: "wasSkipped",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "runId", type: "bytes32" },
      { name: "payee", type: "address" },
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
 * From the verified source, not hand-written. `memoId` is indexed, so setting
 * it to `runId` makes a run's notes one `getLogs` call.
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
