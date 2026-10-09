import { arc, arcTestnet } from "viem/chains";
import type { Hex } from "viem";

/**
 * USDC and Multicall3From sit at the same addresses on Arc mainnet and testnet,
 * so they are constants rather than environment variables.
 */

export const USDC = "0x3600000000000000000000000000000000000000" as const;
export const MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as const;

/** The ERC-20 view is 6 decimals, the native view 18. Never mix them. */
export const USDC_DECIMALS = 6;

/** One run must fit inside this. */
export const BLOCK_GAS_LIMIT = 30_000_000n;

/** Measured on Arc mainnet; see ../../docs/gas.md. */
export const GAS_PER_PAYEE = 46_459n;
export const GAS_BATCH_OVERHEAD = 39_096n;
export const GAS_RECORD_RUN = 94_719n;

/** Max payees in one transaction is ~642; we chunk well below it for headroom. */
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

export const EXPLORER = isMainnet ? "https://explorer.arc.io" : "https://testnet.arcscan.app";

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export function estimateRunGas(n: number): bigint {
  return GAS_BATCH_OVERHEAD + GAS_PER_PAYEE * BigInt(n) + GAS_RECORD_RUN;
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
