import { describe, expect, it } from "vitest";
import { decodeFunctionData, fromHex, keccak256, toHex, type Hex } from "viem";
import { buildRun, deriveRunId } from "../src/lib/batch";
import { MEMO, USDC, erc20Abi, memoAbi, PAYFETTI_ADDRESS, payfettiAbi } from "../src/lib/chain";
import type { ParsedRow } from "../src/lib/parse";

/**
 * Calldata parity against bytes Arc accepted. The vectors come from
 * `scripts/probe-memo.py`, so a disagreement between viem's encoder and the
 * Python one means somebody is building calldata the chain would reject.
 */

const PAYEE_1 = "0x7061796665747469000000000000000000000001" as Hex;
const PAYEE_2 = "0x7061796665747469000000000000000000000002" as Hex;

/** keccak256("payfetti-memo-probe"), the probe's memoId, reused as runId. */
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
    // Receipt.tsx matches this against callDataHash in the Memo event, and a
    // mismatch would show every note as unverified.
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
    it(`onChainNotes: ${onChainNotes}, N payee calls plus one recordRun`, () => {
      const run = buildRun(rows(), "probe", RUN_ID, { onChainNotes });
      expect(run.calls).toHaveLength(3);
      expect(run.onChainNotes).toBe(onChainNotes);

      // Arc reverts transfers to blocklisted addresses, and one bad row must
      // not kill the run.
      expect(run.calls.slice(0, 2).every((c) => c.allowFailure)).toBe(true);

      // recordRun must not, so a replayed runId reverts the whole batch.
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
    // The leaf commits keccak256(run label), never the per-payee note, which
    // is why Memo is what puts those on-chain.
    const run = buildRun(rows(), "probe", RUN_ID);
    expect(run.noteHash).toBe(keccak256(toHex("probe")));
  });
});

/**
 * The double-pay guard. Not a double click, which the disabled button already
 * blocks, but a payer who loses the tab mid-send and pastes the same list again.
 */
describe("deriveRunId closes the lost-tab double-pay hole", () => {
  const PAYER = "0x8d026a62f466f7c457be8e3e139c701b791e668e" as Hex;
  const OTHER = "0x00000000000000000000000000000000deadbeef" as Hex;

  it("the same list, payer and label derives the same id", () => {
    // Two independent attempts, as if the first tab had been lost.
    const first = deriveRunId({ payer: PAYER, rows: rows(), label: "October stipend" });
    const second = deriveRunId({ payer: PAYER, rows: rows(), label: "October stipend" });
    expect(second).toBe(first);
  });

  it("is stable across calls separated in time, unlike a clock seed", async () => {
    const before = deriveRunId({ payer: PAYER, rows: rows(), label: "x" });
    await new Promise((r) => setTimeout(r, 25));
    expect(deriveRunId({ payer: PAYER, rows: rows(), label: "x" })).toBe(before);
  });

  it("does not care how the wallet cased the payer address", () => {
    const upper = ("0x" + PAYER.slice(2).toUpperCase()) as Hex;
    expect(deriveRunId({ payer: upper, rows: rows(), label: "x" })).toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "x" }),
    );
  });

  // Each of these is a genuinely different run and must be payable.
  it("changes when the label changes, so a repeat payout stays possible", () => {
    expect(deriveRunId({ payer: PAYER, rows: rows(), label: "October stipend" })).not.toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "November stipend" }),
    );
  });

  it("changes when an amount changes", () => {
    const edited = rows();
    edited[0] = { ...edited[0], amount: 1001n };
    expect(deriveRunId({ payer: PAYER, rows: edited, label: "x" })).not.toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "x" }),
    );
  });

  it("changes when a payee changes", () => {
    const edited = rows();
    edited[1] = { ...edited[1], payee: OTHER };
    expect(deriveRunId({ payer: PAYER, rows: edited, label: "x" })).not.toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "x" }),
    );
  });

  it("changes when a payee is dropped", () => {
    expect(deriveRunId({ payer: PAYER, rows: rows().slice(0, 1), label: "x" })).not.toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "x" }),
    );
  });

  it("differs per payer, so two payers can run identical lists", () => {
    expect(deriveRunId({ payer: OTHER, rows: rows(), label: "x" })).not.toBe(
      deriveRunId({ payer: PAYER, rows: rows(), label: "x" }),
    );
  });

  it("refuses an empty run rather than deriving a meaningless id", () => {
    expect(() => deriveRunId({ payer: PAYER, rows: [], label: "x" })).toThrow();
  });

  it("feeds the derived id straight through to recordRun and the memos", () => {
    const runId = deriveRunId({ payer: PAYER, rows: rows(), label: "x" });
    const run = buildRun(rows(), "x", runId, { onChainNotes: true });
    expect(run.runId).toBe(runId);
    const { args } = decodeFunctionData({ abi: memoAbi, data: run.calls[0].callData });
    expect(args[2]).toBe(runId);
  });
});
