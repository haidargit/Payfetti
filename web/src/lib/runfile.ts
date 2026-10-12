import type { Hex } from "viem";
import { PAYFETTI_ADDRESS, chain } from "./chain";
import { receiptUrl, type BuiltRun } from "./batch";
import { formatUsdc } from "./parse";

/**
 * The run file is the payer's durable copy, and the only one that exists.
 *
 * Arc's public RPC refuses wide `getLogs` ranges, so a payer's past runs cannot
 * be enumerated by scanning (docs/architecture.md). Proofs live nowhere but the
 * receipt links, so losing them loses a payee's ability to prove payment even
 * though the payment itself is final. Exporting is therefore part of the run,
 * not a convenience.
 */

export type RunFile = {
  format: "payfetti-run/1";
  exportedAt: string;
  chainId: number;
  contract: Hex;
  payer: Hex;
  runId: Hex;
  payeeRoot: Hex;
  label: string;
  labelHash: Hex;
  onChainNotes: boolean;
  txHash: Hex | null;
  total: string;
  count: number;
  receipts: {
    index: number;
    payee: Hex;
    amount: string;
    note: string;
    status: "paid" | "skipped" | "unknown";
    proof: Hex[];
    receiptUrl: string;
  }[];
};

export function buildRunFile(args: {
  payer: Hex;
  run: BuiltRun;
  label: string;
  txHash: Hex | null;
  paid: boolean[] | null;
  base: string;
}): RunFile {
  const { payer, run, label, txHash, paid, base } = args;
  return {
    format: "payfetti-run/1",
    exportedAt: new Date().toISOString(),
    chainId: chain.id,
    contract: PAYFETTI_ADDRESS,
    payer,
    runId: run.runId,
    payeeRoot: run.root,
    label,
    labelHash: run.noteHash,
    onChainNotes: run.onChainNotes,
    txHash,
    total: formatUsdc(run.total),
    count: run.count,
    receipts: run.receipts.map((r, i) => ({
      index: r.index,
      payee: r.payee,
      amount: formatUsdc(r.amount),
      note: r.note,
      status: paid ? (paid[i] ? "paid" : "skipped") : "unknown",
      proof: r.proof,
      receiptUrl: receiptUrl(base, payer, run, r, label),
    })),
  };
}

/** `payfetti-run-2026-10-11-7061a1b2.json` — sorts by date, unique per run. */
export function runFileName(run: BuiltRun): string {
  const day = new Date().toISOString().slice(0, 10);
  return `payfetti-run-${day}-${run.runId.slice(2, 10)}.json`;
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
