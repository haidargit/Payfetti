import type { Hex } from "viem";
import { usdc } from "../lib/format";
import { Copyable, CopyButton } from "./Copyable";
import { StatusPill, type RowStatus } from "./Pill";
import { Icon } from "./Icon";

export type PayeeRow = {
  payee: Hex;
  amount: bigint;
  note: string;
  status?: RowStatus;
  receiptHref?: string;
};

/**
 * One table for both halves of the flow: the pre-flight list and the settled
 * one. They have to be the same component, because the only honest way to show
 * a result is beside the row the payer typed.
 */
export function PayeeTable({ rows }: { rows: PayeeRow[] }) {
  const withStatus = rows.some((r) => r.status);
  const withReceipt = rows.some((r) => r.receiptHref);

  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th className="col-n">#</th>
            <th>Payee</th>
            <th>Note</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            {withStatus && <th>Status</th>}
            {withReceipt && <th>Receipt</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.payee}-${i}`} className={r.status === "invalid" ? "is-bad" : undefined}>
              <td className="col-n">{i + 1}</td>
              <td>
                <Copyable value={r.payee} short label="address" />
              </td>
              <td className="col-note" title={r.note}>
                {r.note || <span className="faint">—</span>}
              </td>
              <td className="col-amt">{usdc(r.amount)}</td>
              {withStatus && <td>{r.status ? <StatusPill status={r.status} /> : null}</td>}
              {withReceipt && (
                <td>
                  {r.receiptHref ? (
                    <span className="row" style={{ gap: 4 }}>
                      <a className="inline-link" href={r.receiptHref} target="_blank" rel="noreferrer">
                        open
                        <Icon name="external" size={12} />
                      </a>
                      <CopyButton value={r.receiptHref} label="receipt link" />
                    </span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The parse failures, which are rows that never become payments. */
export function RejectTable({ rows }: { rows: { line: number; raw: string; reason: string }[] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 240 }}>
      <table className="ledger">
        <thead>
          <tr>
            <th className="col-n">Line</th>
            <th>What you typed</th>
            <th>Why it cannot be paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className="is-bad">
              <td className="col-n">{r.line}</td>
              <td className="mono" style={{ maxWidth: "28ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.raw}>
                {r.raw}
              </td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
