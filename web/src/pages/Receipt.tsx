import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { keccak256, toHex, type Hex } from "viem";
import { PAYFETTI_ADDRESS, USDC, payfettiAbi, txUrl } from "../lib/chain";
import { formatUsdc } from "../lib/parse";

/**
 * Verifies both halves of a payee's receipt, as docs/security.md §3 requires.
 *
 *   half 1  on-chain `verifyInclusion`: the payer committed to paying this
 *           payee exactly this amount in this run.
 *   half 2  a USDC `Transfer(payer → payee, amount)` log in the SAME transaction
 *           as this run's `RunRecorded` event: the money actually moved.
 *
 * Half 1 alone is NOT proof of payment: a payer could declare a run and send
 * nothing. The two are bound together by sharing one transaction hash, which is
 * what makes the pair unforgeable.
 */

type Check = "pending" | "pass" | "fail";

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const RUN_RECORDED_TOPIC = keccak256(
  toHex("RunRecorded(address,bytes32,bytes32,uint256,uint32,string)"),
);

export function Receipt() {
  const publicClient = usePublicClient();
  const [inclusion, setInclusion] = useState<Check>("pending");
  const [transfer, setTransfer] = useState<Check>("pending");
  const [hash, setHash] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string>("");

  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const payer = q.get("payer") as Hex | null;
  const runId = q.get("runId") as Hex | null;
  const payee = q.get("payee") as Hex | null;
  const amount = q.get("amount");
  const memo = q.get("memo") ?? "";
  const proof = (q.get("proof") || "").split(",").filter(Boolean) as Hex[];

  useEffect(() => {
    (async () => {
      if (!publicClient || !payer || !runId || !payee || !amount) {
        setProblem("This receipt link is missing required fields.");
        setInclusion("fail");
        setTransfer("fail");
        return;
      }
      try {
        const noteHash = keccak256(toHex(memo));

        // ── half 1: inclusion proof, free via eth_call ──────────────────
        const ok = (await publicClient.readContract({
          address: PAYFETTI_ADDRESS,
          abi: payfettiAbi,
          functionName: "verifyInclusion",
          args: [payer, runId, payee, BigInt(amount), noteHash, proof],
        })) as boolean;
        setInclusion(ok ? "pass" : "fail");

        // ── half 2: find the run's transaction, then its Transfer log ───
        // The run record stores its own block number, so this is an O(1)
        // lookup, with no log scanning across millions of blocks and no indexer.
        const run = (await publicClient.readContract({
          address: PAYFETTI_ADDRESS,
          abi: payfettiAbi,
          functionName: "getRun",
          args: [payer, runId],
        })) as { blockNumber: bigint; recordedAt: bigint };

        if (!run || run.blockNumber === 0n) {
          setTransfer("fail");
          setProblem("No such run is recorded on-chain.");
          return;
        }
        setWhen(new Date(Number(run.recordedAt) * 1000).toUTCString());

        const recordLogs = await publicClient.getLogs({
          address: PAYFETTI_ADDRESS,
          fromBlock: run.blockNumber,
          toBlock: run.blockNumber,
        });
        const mine = recordLogs.find(
          (l) =>
            l.topics[0]?.toLowerCase() === RUN_RECORDED_TOPIC &&
            l.topics[2]?.toLowerCase() === runId.toLowerCase(),
        );
        if (!mine?.transactionHash) {
          setTransfer("fail");
          setProblem("Could not locate the run's transaction.");
          return;
        }
        setHash(mine.transactionHash);

        const receipt = await publicClient.getTransactionReceipt({
          hash: mine.transactionHash,
        });

        // Only the ERC-20 emitter (6 decimals). Arc's system emitter logs the
        // same transfer at 18 decimals and would double-count.
        const padded = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
        const found = receipt.logs.some(
          (l) =>
            l.address.toLowerCase() === USDC.toLowerCase() &&
            l.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
            l.topics[1]?.toLowerCase() === padded(payer) &&
            l.topics[2]?.toLowerCase() === padded(payee) &&
            BigInt(l.data) >= BigInt(amount),
        );
        setTransfer(found ? "pass" : "fail");
        if (!found) {
          setProblem(
            "The run was declared, but no matching USDC transfer appears in that transaction.",
          );
        }
      } catch (e: any) {
        setProblem(e?.shortMessage || e?.message || String(e));
        setInclusion("fail");
        setTransfer("fail");
      }
    })();
  }, [publicClient, payer, runId, payee, amount, memo]);

  const verdict =
    inclusion === "pass" && transfer === "pass"
      ? "paid"
      : inclusion === "pending" || transfer === "pending"
        ? "checking"
        : "unverified";

  return (
    <main>
      <h1>Payment receipt</h1>

      {verdict === "paid" && (
        <div className="ok big">Verified: this payment was made on Arc.</div>
      )}
      {verdict === "checking" && <p className="muted">Checking against the chain…</p>}
      {verdict === "unverified" && (
        <div className="err big">
          ❌ Not verified. {problem || "This receipt does not check out."}
        </div>
      )}

      <table>
        <tbody>
          <tr>
            <th>Payee</th>
            <td className="mono">{payee}</td>
          </tr>
          <tr>
            <th>Amount</th>
            <td>{amount ? `${formatUsdc(BigInt(amount))} USDC` : "—"}</td>
          </tr>
          <tr>
            <th>Paid by</th>
            <td className="mono">{payer}</td>
          </tr>
          <tr>
            <th>Run</th>
            <td>{memo || "—"}</td>
          </tr>
          <tr>
            <th>When</th>
            <td>{when ?? "—"}</td>
          </tr>
          <tr>
            <th>Transaction</th>
            <td>
              {hash ? (
                <a href={txUrl(hash)} target="_blank" rel="noreferrer">
                  {hash.slice(0, 18)}… ↗
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>How this was checked</h2>
      <ul className="checks">
        <li>
          {inclusion === "pass" ? "✅" : inclusion === "fail" ? "❌" : "⏳"} The payer committed
          on-chain to paying this exact amount to this address (Merkle inclusion proof).
        </li>
        <li>
          {transfer === "pass" ? "✅" : transfer === "fail" ? "❌" : "⏳"} A matching USDC transfer
          appears in that same transaction.
        </li>
      </ul>
      <p className="muted small">
        Both are required. A proof alone would only show the payer <em>declared</em> a payment,
        the transfer log is what shows the money moved. They share one transaction hash, so neither
        can be forged without the other. Verified directly against Arc; this page stores nothing and
        asks you to trust no one.
      </p>
    </main>
  );
}
