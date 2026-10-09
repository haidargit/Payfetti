import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import { erc20Abi, payfettiAbi, PAYFETTI_ADDRESS, USDC } from "./chain";
import { proofFor, treeFromRows, verifyProof, type Row } from "./merkle";
import type { ParsedRow } from "./parse";

/**
 * Builds the single `aggregate3` call that IS a Payfetti run.
 *
 *   Multicall3From.aggregate3([
 *     USDC.transfer(payee_i, amount_i) × N,   // allowFailure: true
 *     Payfetti.recordRun(runId, root, …)      // allowFailure: false
 *   ])
 *
 * `allowFailure: true` on every transfer, because Arc reverts transfers to
 * blocklisted addresses and one bad row must not destroy a 200-payee run.
 *
 * `allowFailure: false` on `recordRun`, so a reused `runId` reverts the whole
 * batch and no transfer executes. That is what stops a resubmission double-paying.
 */

export type BuiltRun = {
  runId: Hex;
  noteHash: Hex;
  root: Hex;
  total: bigint;
  count: number;
  calls: { target: Hex; allowFailure: boolean; callData: Hex }[];
  receipts: { payee: Hex; amount: bigint; note: string; index: number; proof: Hex[] }[];
};

/** A runId unique to this payer+moment. Namespaced per payer on-chain anyway. */
export function newRunId(label?: string): Hex {
  const seed = label?.trim()
    ? label.trim()
    : `payfetti-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return keccak256(toHex(seed));
}

export function buildRun(parsed: ParsedRow[], memo: string, runId: Hex): BuiltRun {
  if (parsed.length === 0) throw new Error("no payees");

  const noteHash = keccak256(toHex(memo));
  const rows: Row[] = parsed.map((r) => ({ payee: r.payee, amount: r.amount, note: r.note }));

  const tree = treeFromRows(rows, noteHash);

  // Self-check every proof BEFORE building a transaction. A tree bug must never
  // reach a chain, since it would produce receipts that can never verify.
  const receipts = rows.map((r, i) => {
    const proof = proofFor(tree, i);
    if (!verifyProof(tree.leaves[i], proof, tree.root)) {
      throw new Error(`internal error: proof ${i} failed local verification`);
    }
    return { payee: r.payee, amount: r.amount, note: r.note, index: i, proof };
  });

  const total = rows.reduce((acc, r) => acc + r.amount, 0n);

  const calls = rows.map((r) => ({
    target: USDC as Hex,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [r.payee, r.amount],
    }),
  }));

  calls.push({
    target: PAYFETTI_ADDRESS,
    allowFailure: false,
    callData: encodeFunctionData({
      abi: payfettiAbi,
      functionName: "recordRun",
      args: [runId, tree.root, total, rows.length, memo],
    }),
  });

  return { runId, noteHash, root: tree.root, total, count: rows.length, calls, receipts };
}

/** A shareable receipt URL. Self-contained so no backend or indexer is needed. */
export function receiptUrl(
  base: string,
  payer: Hex,
  run: BuiltRun,
  r: BuiltRun["receipts"][number],
  memo: string,
): string {
  const q = new URLSearchParams({
    payer,
    runId: run.runId,
    payee: r.payee,
    amount: r.amount.toString(),
    memo,
    proof: r.proof.join(","),
  });
  return `${base}#/receipt?${q.toString()}`;
}
