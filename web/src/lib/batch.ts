import { encodeAbiParameters, encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import { erc20Abi, MEMO, memoAbi, payfettiAbi, PAYFETTI_ADDRESS, USDC } from "./chain";
import { proofFor, treeFromRows, verifyProof, type Row } from "./merkle";
import type { ParsedRow } from "./parse";

/**
 * The single `aggregate3` call that is a Payfetti run:
 *
 *   Multicall3From.aggregate3([
 *     USDC.transfer(payee, amount)  or  Memo.memo(USDC, transfer, runId, note),
 *     Payfetti.recordRun(runId, root, …)
 *   ])
 *
 * `allowFailure: true` on the payee calls, since Arc reverts transfers to
 * blocklisted addresses and one bad row must not destroy the run. `false` on
 * `recordRun`, so a reused `runId` reverts everything and nothing pays twice.
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

/**
 * Derived from content, never a clock or a random seed. A random id let a lost
 * tab re-pay everyone: the same list produced a fresh id and sailed past the
 * on-chain guard. Content-derived, the retry collides and the chain refuses it.
 * Change the label to pay an identical list on purpose. See `docs/security.md`.
 */
export function deriveRunId(args: {
  payer: Hex;
  rows: ParsedRow[];
  label: string;
}): Hex {
  const { payer, rows, label } = args;
  if (rows.length === 0) throw new Error("no payees");

  const noteHash = keccak256(toHex(label));
  const tree = treeFromRows(
    rows.map((r) => ({ payee: r.payee, amount: r.amount, note: r.note })),
    noteHash,
  );
  const total = rows.reduce((acc, r) => acc + r.amount, 0n);

  // viem rejects a non-EIP-55 mixed-case address, and the id must not depend
  // on how a wallet cased it.
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint32" },
        { type: "string" },
      ],
      [payer.toLowerCase() as Hex, tree.root, total, rows.length, label],
    ),
  );
}

/**
 * `memoId` is the run's `runId`, and the `Memo` event indexes it, so a run's
 * notes are one `getLogs` call. That is lookup, not discovery: Arc's RPC
 * refuses wide ranges, so past runs come from the explorer or an exported run
 * file. See `docs/architecture.md`.
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

    // Blank notes are wrapped too: skipping them would save 9,299 gas each but
    // leave the payee list read back from `Memo` logs incomplete.
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
