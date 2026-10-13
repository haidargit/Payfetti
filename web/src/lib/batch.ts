import { encodeAbiParameters, encodeFunctionData, keccak256, toHex, type Hex } from "viem";
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
 * `msg.sender`, so a receipt verifies identically either way.
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

/**
 * The runId is derived from the run's **content**, never from a clock or a
 * random seed. This is what makes the on-chain double-pay guard actually work.
 *
 * `recordRun` reverts on a `runId` this payer has already used, and
 * `allowFailure: false` propagates that revert to the whole `aggregate3`, so no
 * transfer executes. With a random id that guard only ever caught a resubmission
 * of the *same built batch*, which is the easy case, already prevented by
 * disabling the button.
 *
 * The case it missed is the dangerous one: a payer signs, the transaction
 * broadcasts, and then the laptop sleeps or the tab is reloaded before the
 * receipt arrives. The payment lands; the UI does not. Reopening the app and
 * pasting the same list would mint a *fresh* random id, sail past the guard, and
 * pay all 200 people a second time, irreversibly.
 *
 * Deriving the id from (payer, root, total, count, label) means that second
 * attempt produces the *same* id and the chain refuses it. The guard we already
 * verified on-chain starts covering the realistic failure, with no contract
 * change.
 *
 * Paying an identical list again on purpose stays possible: change the label.
 * "October stipend" and "November stipend" are different runs; the same list
 * under the same label, twice, is the thing we want to stop.
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

  // Lowercased for the same reason `leafOf` does it: viem rejects a
  // non-EIP-55 mixed-case address, and the same payer must always derive the
  // same id regardless of how their wallet cased it.
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
 * `memoId` is the run's own `runId`. The `Memo` event indexes it, so once you
 * know a run's id its notes come back from a single-block `getLogs`: O(1), no
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
