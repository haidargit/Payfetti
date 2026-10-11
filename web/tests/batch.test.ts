import { describe, expect, it } from "vitest";
import { decodeFunctionData, fromHex, keccak256, toHex, type Hex } from "viem";
import { buildRun } from "../src/lib/batch";
import { MEMO, USDC, erc20Abi, memoAbi, PAYFETTI_ADDRESS, payfettiAbi } from "../src/lib/chain";
import type { ParsedRow } from "../src/lib/parse";

/**
 * Calldata parity against values Arc actually accepted.
 *
 * The vectors below are not invented: they are the exact bytes
 * `scripts/probe-memo.py` built by hand and that Arc testnet accepted through
 * `eth_call` when proving `Memo` nests inside `Multicall3From.aggregate3`. If
 * viem's encoder and the hand-rolled Python encoder ever disagree, one of them
 * is building calldata the chain would reject, and these tests say which.
 *
 * Same discipline as `merkle.test.ts`: pin to the chain, not to ourselves.
 */

const PAYEE_1 = "0x7061796665747469000000000000000000000001" as Hex;
const PAYEE_2 = "0x7061796665747469000000000000000000000002" as Hex;

/** keccak256("payfetti-memo-probe") — the probe's memoId, reused here as runId. */
const RUN_ID = "0x20f4d43a7f7d8c286bf183f30c3fd808b0abed3357fc0af406d982f7c25e9cf6" as Hex;

const MEMO_CALLDATA_1 =
  "0xc3b2c4f80000000000000000000000003600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008020f4d43a7f7d8c286bf183f30c3fd808b0abed3357fc0af406d982f7c25e9cf600000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000706179666574746900000000000000000000000100000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f7061727469636970616e74203030310000000000000000000000000000000000";

const TRANSFER_CALLDATA_1 =
  "0xa9059cbb000000000000000000000000706179666574746900000000000000000000000100000000000000000000000000000000000000000000000000000000000003e8";

function rows(): ParsedRow[] {
  return [
    { line: 1, raw: "", payee: PAYEE_1, amount: 1000n, note: "participant 001" },
    { line: 2, raw: "", payee: PAYEE_2, amount: 1000n, note: "participant 002" },
  ];
}

describe("memo-wrapped runs match the calldata Arc accepted", () => {
  it("builds byte-identical Memo calldata to the Python probe", () => {
    const run = buildRun(rows(), "probe", RUN_ID, { onChainNotes: true });
    expect(run.calls[0].target.toLowerCase()).toBe(MEMO.toLowerCase());
    expect(run.calls[0].callData).toBe(MEMO_CALLDATA_1);
  });

  it("builds byte-identical bare transfer calldata when notes are off", () => {
    const run = buildRun(rows(), "probe", RUN_ID, { onChainNotes: false });
    expect(run.calls[0].target.toLowerCase()).toBe(USDC.toLowerCase());
    expect(run.calls[0].callData).toBe(TRANSFER_CALLDATA_1);
  });
});

describe("the memo carries what a receipt needs", () => {
  const run = buildRun(rows(), "probe", RUN_ID, { onChainNotes: true });

  it("sets memoId to the runId, so one getLogs returns the whole run", () => {
    for (const call of run.calls.slice(0, 2)) {
      const { args } = decodeFunctionData({ abi: memoAbi, data: call.callData });
      expect(args[2]).toBe(RUN_ID);
    }
  });

  it("targets USDC with the inner call and carries the payee's own note", () => {
    const notes = ["participant 001", "participant 002"];
    run.calls.slice(0, 2).forEach((call, i) => {
      const { args } = decodeFunctionData({ abi: memoAbi, data: call.callData });
      expect((args[0] as string).toLowerCase()).toBe(USDC.toLowerCase());
      expect(fromHex(args[3] as Hex, "string")).toBe(notes[i]);
    });
  });

  it("wraps a transfer whose keccak256 is what Receipt.tsx looks for", () => {
    // Receipt.tsx recomputes keccak256(transfer(payee, amount)) and matches it
    // against callDataHash in the Memo event. Prove the two agree here, because
    // a mismatch would show every payee's note as unverified.
    const bare = buildRun(rows(), "probe", RUN_ID, { onChainNotes: false });
    const { args } = decodeFunctionData({ abi: memoAbi, data: run.calls[0].callData });
    expect(args[1]).toBe(bare.calls[0].callData);
    expect(keccak256(args[1] as Hex)).toBe(keccak256(TRANSFER_CALLDATA_1));
  });

  it("decodes the inner call back to the exact payee and amount", () => {
    const { args } = decodeFunctionData({ abi: memoAbi, data: run.calls[0].callData });
    const inner = decodeFunctionData({ abi: erc20Abi, data: args[1] as Hex });
    expect(inner.functionName).toBe("transfer");
    expect((inner.args![0] as string).toLowerCase()).toBe(PAYEE_1.toLowerCase());
    expect(inner.args![1]).toBe(1000n);
  });

  it("survives a note containing commas, quotes and non-ASCII", () => {
    const awkward = 'Bulan "Oktober", 50% — café';
    const r: ParsedRow[] = [{ line: 1, raw: "", payee: PAYEE_1, amount: 1n, note: awkward }];
    const built = buildRun(r, "x", RUN_ID, { onChainNotes: true });
    const { args } = decodeFunctionData({ abi: memoAbi, data: built.calls[0].callData });
    expect(fromHex(args[3] as Hex, "string")).toBe(awkward);
  });

  it("wraps blank notes too, so the on-chain payee list has no gaps", () => {
    const r: ParsedRow[] = [{ line: 1, raw: "", payee: PAYEE_1, amount: 1n, note: "" }];
    const built = buildRun(r, "x", RUN_ID, { onChainNotes: true });
    expect(built.calls[0].target.toLowerCase()).toBe(MEMO.toLowerCase());
    const { args } = decodeFunctionData({ abi: memoAbi, data: built.calls[0].callData });
    expect(args[3]).toBe("0x");
  });
});

describe("batch shape is unchanged by the memo option", () => {
  for (const onChainNotes of [true, false]) {
    it(`onChainNotes: ${onChainNotes} — N payee calls plus one recordRun`, () => {
      const run = buildRun(rows(), "probe", RUN_ID, { onChainNotes });
      expect(run.calls).toHaveLength(3);
      expect(run.onChainNotes).toBe(onChainNotes);

      // Payee calls tolerate failure, because Arc reverts transfers to
      // blocklisted addresses and one bad row must not kill the run.
      expect(run.calls.slice(0, 2).every((c) => c.allowFailure)).toBe(true);

      // recordRun must NOT, so a replayed runId reverts the whole batch and
      // nobody is paid twice.
      const last = run.calls[2];
      expect(last.target.toLowerCase()).toBe(PAYFETTI_ADDRESS.toLowerCase());
      expect(last.allowFailure).toBe(false);
      const { functionName, args } = decodeFunctionData({ abi: payfettiAbi, data: last.callData });
      expect(functionName).toBe("recordRun");
      expect(args![0]).toBe(RUN_ID);
      expect(args![2]).toBe(2000n);
      expect(args![3]).toBe(2);
    });
  }

  it("commits the same Merkle root either way, so receipts verify identically", () => {
    const a = buildRun(rows(), "probe", RUN_ID, { onChainNotes: true });
    const b = buildRun(rows(), "probe", RUN_ID, { onChainNotes: false });
    expect(a.root).toBe(b.root);
    expect(a.receipts.map((r) => r.proof)).toEqual(b.receipts.map((r) => r.proof));
  });

  it("defaults to writing notes on-chain", () => {
    expect(buildRun(rows(), "probe", RUN_ID).onChainNotes).toBe(true);
  });

  it("binds the run label, not the per-payee note, into the leaves", () => {
    // The leaf commits keccak256(run label). Per-payee notes were never in the
    // tree, which is exactly why Memo is what puts them on-chain.
    const run = buildRun(rows(), "probe", RUN_ID);
    expect(run.noteHash).toBe(keccak256(toHex("probe")));
  });
});
