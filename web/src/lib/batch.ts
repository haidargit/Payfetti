import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import { erc20Abi, MEMO, memoAbi, payfettiAbi, PAYFETTI_ADDRESS, USDC } from "./chain";
import { proofFor, treeFromRows, verifyProof, type Row } from "./merkle";
import type { ParsedRow } from "./parse";

/**
 * Builds the single `aggregate3` call that IS a Payfetti run.
 *
 *   Multicall3From.aggregate3([
 *     <one call per payee> × N,               // allowFailure: true
 *     Payfetti.recordRun(runId, root, …)      // allowFailure: false
 *   ])
 *
 * Each payee call is one of two shapes:
 *
 *   onChainNotes: false   USDC.transfer(payee, amount)
 *   onChainNotes: true    Memo.memo(USDC, transfer(payee, amount), runId, note)
 *
 * The memo form costs 9,299 gas more per payee and writes the note permanently
 * on-chain. Both forms emit the same `Transfer(payer → payee)` log, because
 * `Memo` routes through the `CallFrom` precompile and the payer stays
 * `msg.sender` — so a receipt verifies identically either way.
 *
 * `allowFailure: true` on every payee call, because Arc reverts transfers to
 * blocklisted addresses and one bad row must not destroy a 200-payee run. A
 * memo-wrapped failure reverts the whole subcall, `Memo` included, so a skipped
 * payee leaves no stray `Memo` event behind.
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
  /** Whether each payee's note was written on-chain via `Memo`. */
  onChainNotes: boolean;
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

/**
 * `memoId` is the run's own `runId`. The `Memo` event indexes it, so once you
 * know a run's id its notes come back from a single-block `getLogs` — O(1), no
 * indexer, no backend.
 *
 * That is lookup, not discovery. Arc's public RPC refuses `getLogs` ranges even
 * 10,000 blocks wide, and at sub-second blocks the chain is already ~66M blocks
 * deep, so enumerating a payer's past runs by scanning is not possible here.
 * Discovery reads the explorer's transaction list and re-verifies each hit
 * against Arc; the durable copy is an exported run file. See docs/architecture.md.
 */
export function buildRun(
  parsed: ParsedRow[],
  memo: string,
  runId: Hex,
  opts: { onChainNotes?: boolean } = {},
): BuiltRun {
  if (parsed.length === 0) throw new Error("no payees");
  const onChainNotes = opts.onChainNotes ?? true;

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

  const calls = rows.map((r) => {
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [r.payee, r.amount],
    });

    if (!onChainNotes) {
      return { target: USDC as Hex, allowFailure: true, callData: transfer };
    }

    // Every row is wrapped, including rows with a blank note. Skipping the blank
    // ones would save 9,299 gas each but leave gaps in the on-chain run history,
    // so the payee list read back from `Memo` logs would be incomplete.
    return {
      target: MEMO as Hex,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: memoAbi,
        functionName: "memo",
        args: [USDC, transfer, runId, toHex(r.note)],
      }),
    };
  });

  calls.push({
    target: PAYFETTI_ADDRESS,
    allowFailure: false,
    callData: encodeFunctionData({
      abi: payfettiAbi,
      functionName: "recordRun",
      args: [runId, tree.root, total, rows.length, memo],
    }),
  });

  return {
    runId,
    noteHash,
    root: tree.root,
    total,
    count: rows.length,
    onChainNotes,
    calls,
    receipts,
  };
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
