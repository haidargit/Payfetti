import type { Hex } from "viem";
import { receiptUrl, type BuiltRun } from "../lib/batch";
import { txUrl } from "../lib/chain";
import { plural, usd, usdc } from "../lib/format";
import { buildRunFile, downloadJson, runFileName } from "../lib/runfile";
import { Callout } from "./Callout";
import { Copyable, CopyButton } from "./Copyable";
import { Icon } from "./Icon";
import { PayeeTable, type PayeeRow } from "./PayeeTable";
import { Stat, Stats } from "./Stat";
import { Steps } from "./Steps";

/**
 * The settled run. Two things here are not cosmetic:
 *
 *   The paid total is summed from the rows that actually emitted a `Transfer`,
 *   not from the declared total, because `allowFailure: true` means those two
 *   numbers legitimately differ when a payee is screened or invalid.
 *
 *   Exporting is offered as the primary action, since the proofs exist only in
 *   these links. Arc's RPC cannot enumerate a payer's past runs, so a lost run
 *   file is a payee who can no longer prove a payment that did happen.
 */
export function RunReceipts({
  payer,
  run,
  label,
  txHash,
  paid,
  feeUsdc,
  skipsRecorded,
  recordingSkips,
  onRecordSkips,
  onRetrySkipped,
  onNewRun,
}: {
  payer: Hex;
  run: BuiltRun;
  label: string;
  txHash: Hex | null;
  paid: boolean[] | null;
  feeUsdc: number;
  skipsRecorded: boolean;
  recordingSkips: boolean;
  onRecordSkips: (payees: Hex[]) => void;
  onRetrySkipped: (rows: BuiltRun["receipts"]) => void;
  onNewRun: () => void;
}) {
  const base = window.location.origin + window.location.pathname;
  const okCount = paid ? paid.filter(Boolean).length : run.receipts.length;
  const skippedRows = run.receipts.filter((_, i) => (paid ? !paid[i] : false));
  const movedTotal = run.receipts.reduce(
    (acc, r, i) => (paid && !paid[i] ? acc : acc + r.amount),
    0n,
  );

  const rows: PayeeRow[] = run.receipts.map((r, i) => ({
    payee: r.payee,
    amount: r.amount,
    note: r.note,
    status: paid ? (paid[i] ? "paid" : "skipped") : "paid",
    receiptHref: receiptUrl(base, payer, run, r, label),
  }));

  const allLinks = rows
    .map((r) => r.receiptHref)
    .filter((u): u is string => Boolean(u))
    .join("\n");

  return (
    <>
      <div className="hero">
        <Steps at={2} />
        <h1 style={{ marginTop: 16 }}>
          {okCount} {okCount === 1 ? "person" : "people"} paid
          {skippedRows.length > 0 && `, ${skippedRows.length} skipped`}.
        </h1>
        <p className="hero-lede">
          {usdc(movedTotal)} USDC moved in one transaction for {usd(feeUsdc)}. Every link below
          proves one payee's own payment against Arc, with no account and no trust in us.
        </p>
      </div>

      <div className="layout">
        <div className="stack-lg" style={{ minWidth: 0 }}>
          <Stats>
            <Stat label="Paid" value={okCount} hint={`of ${run.receipts.length}`} />
            <Stat
              label="Skipped"
              value={skippedRows.length}
              hint={skippedRows.length > 0 ? "transfer reverted" : "none"}
            />
            <Stat label="Moved" value={usdc(movedTotal)} unit="USDC" />
            <Stat label="Network fee" value={usd(feeUsdc)} hint="one transaction" />
          </Stats>

          <section className="card">
            <div className="card-head">
              <h2 style={{ fontSize: 15 }}>Receipts</h2>
              <span className="row" style={{ gap: 8 }}>
                <CopyButton value={allLinks} label="all receipt links" />
                <span className="tiny faint">copy all links</span>
              </span>
            </div>
            <PayeeTable rows={rows} />
          </section>

          {skippedRows.length > 0 && (
            <Callout
              tone="warn"
              title={`${skippedRows.length} ${plural(skippedRows.length, "payee")} could not be paid`}
            >
              <p style={{ marginTop: 4 }}>
                Their payment bounced back, and the rest of the list went through regardless. A
                blocked or invalid address does this. That money never left your wallet.
              </p>
              <div className="row-wrap" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-soft btn-sm"
                  disabled={skipsRecorded || recordingSkips}
                  onClick={() => onRecordSkips(skippedRows.map((r) => r.payee))}
                >
                  {recordingSkips ? (
                    <>
                      <Icon name="spinner" size={13} /> Recording
                    </>
                  ) : skipsRecorded ? (
                    <>
                      <Icon name="check" size={13} /> Recorded on-chain
                    </>
                  ) : (
                    <>
                      <Icon name="stack" size={13} /> Record the skips on-chain
                    </>
                  )}
                </button>
                <button className="btn btn-sm" onClick={() => onRetrySkipped(skippedRows)}>
                  {skippedRows.length === 1 ? "Retry that one" : `Retry just those ${skippedRows.length}`}
                </button>
              </div>
              <p className="tiny" style={{ marginTop: 8, opacity: 0.85 }}>
                Recording it means anyone opening their receipt is told they were skipped, instead
                of seeing a check that simply fails.
              </p>
            </Callout>
          )}
        </div>

        <aside className="layout-side">
          <section className="card">
            <div className="card-head">
              <h2 style={{ fontSize: 15 }}>Keep this</h2>
            </div>
            <div className="card-body">
              <p className="small muted">
                The proofs exist only in these links. Arc's RPC cannot list your past runs, so this
                file is the durable copy.
              </p>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 12 }}
                onClick={() =>
                  downloadJson(
                    runFileName(run),
                    buildRunFile({ payer, run, label, txHash, paid, base }),
                  )
                }
              >
                <Icon name="download" size={15} />
                Export the run file
              </button>
            </div>
            <div className="card-body">
              <div className="kv">
                <span className="kv-k">Run label</span>
                <span style={{ fontWeight: 600 }}>{label || "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Run id</span>
                <Copyable value={run.runId} short label="run id" />
              </div>
              <div className="kv">
                <span className="kv-k">Payee root</span>
                <Copyable value={run.root} short label="payee root" />
              </div>
              <div className="kv">
                <span className="kv-k">Notes on-chain</span>
                <span style={{ fontWeight: 600 }}>{run.onChainNotes ? "yes" : "no"}</span>
              </div>
              {txHash && (
                <div className="kv">
                  <span className="kv-k">Transaction</span>
                  <a className="inline-link" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                    explorer
                    <Icon name="external" size={12} />
                  </a>
                </div>
              )}
            </div>
            <div className="card-foot">
              <button className="btn btn-block" onClick={onNewRun}>
                Start another run
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
