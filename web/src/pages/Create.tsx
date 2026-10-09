import { useMemo, useState } from "react";
import { useAccount, useBalance, useGasPrice, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, type Hex } from "viem";
import {
  BLOCK_GAS_LIMIT,
  MAX_PAYEES,
  MIN_GAS_PRICE,
  MULTICALL3FROM,
  PAYFETTI_ADDRESS,
  chain,
  estimateRunGas,
  gasCostUsdc,
  multicall3FromAbi,
  txUrl,
} from "../lib/chain";
import { EXAMPLE, formatUsdc, parseRows } from "../lib/parse";
import { buildRun, newRunId, receiptUrl, type BuiltRun } from "../lib/batch";

type Phase = "edit" | "sending" | "done" | "error";

export function Create() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: gasPrice } = useGasPrice();
  const { data: balance } = useBalance({ address });

  const [text, setText] = useState(EXAMPLE);
  const [memo, setMemo] = useState("Payfetti run");
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [built, setBuilt] = useState<BuiltRun | null>(null);
  const [results, setResults] = useState<boolean[] | null>(null);

  const parsed = useMemo(() => parseRows(text), [text]);

  const gas = estimateRunGas(parsed.rows.length);
  // Quote at the live price but never below Arc's 20 Gwei floor, since a transaction
  // under the floor is silently dropped with no error and no receipt.
  const price = gasPrice && gasPrice > MIN_GAS_PRICE ? gasPrice : MIN_GAS_PRICE;
  const feeUsdc = gasCostUsdc(gas, price);

  // The native balance is 18-decimal; the list totals are 6-decimal. Compare in
  // 6-decimal space, never by mixing the two views.
  const balance6 = balance ? balance.value / 10n ** 12n : 0n;
  const needed6 = parsed.total + BigInt(Math.ceil(feeUsdc * 1e6));
  const shortfall = balance ? needed6 - balance6 : 0n;

  const tooBig = gas > BLOCK_GAS_LIMIT || parsed.rows.length > MAX_PAYEES;
  const canSend =
    isConnected &&
    parsed.rows.length > 0 &&
    parsed.errors.length === 0 &&
    !tooBig &&
    shortfall <= 0n &&
    phase === "edit";

  async function send() {
    if (!walletClient || !publicClient || !address) return;
    setError("");
    setPhase("sending");
    try {
      const run = buildRun(parsed.rows, memo, newRunId());
      setBuilt(run);

      const hash = await walletClient.writeContract({
        address: MULTICALL3FROM,
        abi: multicall3FromAbi,
        functionName: "aggregate3",
        args: [run.calls],
        chain,
        account: address,
      });
      setTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction reverted");

      // Which payees actually received a transfer? Read it from the logs rather
      // than assuming. This is half two of the receipt.
      const paid = new Set<string>();
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({
            abi: [
              {
                type: "event",
                name: "Transfer",
                inputs: [
                  { name: "from", type: "address", indexed: true },
                  { name: "to", type: "address", indexed: true },
                  { name: "value", type: "uint256", indexed: false },
                ],
              },
            ] as const,
            data: log.data,
            topics: log.topics,
          });
          // Only the ERC-20 emitter (6 decimals). Arc's system emitter logs the
          // same transfer at 18 decimals and would double-count.
          if (
            log.address.toLowerCase() === "0x3600000000000000000000000000000000000000" &&
            (ev.args as any).from?.toLowerCase() === address.toLowerCase()
          ) {
            paid.add((ev.args as any).to.toLowerCase());
          }
        } catch {
          /* not a Transfer log */
        }
      }
      setResults(run.receipts.map((r) => paid.has(r.payee.toLowerCase())));
      setPhase("done");
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || String(e));
      setPhase("error");
    }
  }

  if (phase === "done" && built) {
    const okCount = results?.filter(Boolean).length ?? 0;
    const skipped = built.receipts.length - okCount;
    return (
      <main>
        <h1>Run complete</h1>
        <p className="big">
          <strong>{okCount}</strong> paid
          {skipped > 0 && (
            <>
              {" · "}
              <strong>{skipped}</strong> skipped
            </>
          )}{" "}
          · {formatUsdc(built.total)} USDC
        </p>
        {txHash && (
          <p>
            <a href={txUrl(txHash)} target="_blank" rel="noreferrer">
              View transaction on the explorer ↗
            </a>
          </p>
        )}
        <h2>Receipts</h2>
        <p className="muted">
          Each link proves that payee was paid this amount in this transaction. Anyone can verify it
          against the chain, with no account and no trust in us.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Payee</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {built.receipts.map((r, i) => (
              <tr key={r.payee + i}>
                <td>{i + 1}</td>
                <td className="mono">{r.payee}</td>
                <td>{formatUsdc(r.amount)}</td>
                <td>{results?.[i] ? "✅ paid" : "⏭️ skipped"}</td>
                <td>
                  <a
                    href={receiptUrl(window.location.origin + window.location.pathname, address!, built, r, memo)}
                  >
                    open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button onClick={() => { setPhase("edit"); setBuilt(null); setResults(null); setTxHash(null); }}>
            New run
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Pay many people at once</h1>

      <label htmlFor="memo">Run label</label>
      <input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} />

      <label htmlFor="rows">
        Payees, one per line: <code>address, amount, note</code>
      </label>
      <textarea id="rows" rows={12} value={text} onChange={(e) => setText(e.target.value)} />

      <div className="grid">
        <div className="stat">
          <span>Payees</span>
          <strong>{parsed.rows.length}</strong>
        </div>
        <div className="stat">
          <span>Total payout</span>
          <strong>{formatUsdc(parsed.total)} USDC</strong>
        </div>
        <div className="stat">
          <span>Network fee</span>
          <strong>${feeUsdc.toFixed(4)}</strong>
        </div>
        <div className="stat">
          <span>Transactions</span>
          <strong>1</strong>
        </div>
      </div>

      <p className="muted">
        Estimated {gas.toLocaleString()} gas at {(Number(price) / 1e9).toFixed(2)} Gwei,{" "}
        {((Number(gas) / Number(BLOCK_GAS_LIMIT)) * 100).toFixed(1)}% of a block. Paying the same
        people by card would cost roughly ${(parsed.rows.length * 0.3).toFixed(2)}.
      </p>

      {parsed.errors.length > 0 && (
        <div className="err">
          <strong>{parsed.errors.length} line(s) need fixing, and nothing sends until they do:</strong>
          <ul>
            {parsed.errors.slice(0, 8).map((e) => (
              <li key={e.line}>
                line {e.line}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.warnings.map((w) => (
        <div className="warn" key={w}>
          ⚠️ {w}
        </div>
      ))}

      {tooBig && (
        <div className="err">
          This run is too large for one transaction (limit ~{MAX_PAYEES} payees). Split it.
        </div>
      )}

      {isConnected && shortfall > 0n && (
        <div className="err">
          Short by {formatUsdc(shortfall)} USDC. You need {formatUsdc(needed6)} for payouts plus
          fees, and hold {formatUsdc(balance6)}.
        </div>
      )}

      {phase === "error" && <div className="err">Failed: {error}</div>}

      <p>
        <button onClick={send} disabled={!canSend}>
          {phase === "sending" ? "Confirm in your wallet…" : `Pay ${parsed.rows.length} people`}
        </button>
        {!isConnected && <span className="muted">, connect a wallet first</span>}
      </p>

      <p className="muted small">
        One transaction, no <code>approve</code>, no custody. Contract:{" "}
        <code>{PAYFETTI_ADDRESS}</code>
      </p>
    </main>
  );
}
