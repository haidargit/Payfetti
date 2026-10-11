import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { decodeEventLog, encodeFunctionData, fromHex, keccak256, toHex, type Hex } from "viem";
import { MEMO, PAYFETTI_ADDRESS, USDC, erc20Abi, memoAbi, payfettiAbi, txUrl } from "../lib/chain";
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
 *
 * A run sent with on-chain notes adds a third, independent reading: Arc's `Memo`
 * event carries `keccak256(callData)`, so recomputing the transfer calldata and
 * matching that hash proves the published note belongs to THIS transfer and not
 * some other payee's. Its absence is not a failure — it only means the payer
 * chose to keep notes off-chain.
 */

type Check = "pending" | "pass" | "fail";
type NoteCheck = "pending" | "pass" | "absent" | "fail";

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const RUN_RECORDED_TOPIC = keccak256(
  toHex("RunRecorded(address,bytes32,bytes32,uint256,uint32,string)"),
);
const MEMO_TOPIC = keccak256(toHex("Memo(address,address,bytes32,bytes32,bytes,uint256)"));

export function Receipt() {
  const publicClient = usePublicClient();
  const [inclusion, setInclusion] = useState<Check>("pending");
  const [transfer, setTransfer] = useState<Check>("pending");
  const [noteCheck, setNoteCheck] = useState<NoteCheck>("pending");
  const [onChainNote, setOnChainNote] = useState<string | null>(null);
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
        setNoteCheck("fail");
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
          setNoteCheck("fail");
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
          setNoteCheck("fail");
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

        // ── third reading: the on-chain note, if the payer published one ──
        // `callDataHash` is keccak256 of the exact inner calldata, so rebuilding
        // `transfer(payee, amount)` and matching it ties the note to THIS payee.
        const wantHash = keccak256(
          encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [payee, BigInt(amount)],
          }),
        ).toLowerCase();

        const memoLogs = receipt.logs.filter(
          (l) =>
            l.address.toLowerCase() === MEMO.toLowerCase() &&
            l.topics[0]?.toLowerCase() === MEMO_TOPIC &&
            l.topics[3]?.toLowerCase() === runId.toLowerCase(),
        );

        if (memoLogs.length === 0) {
          setNoteCheck("absent");
        } else {
          let matched: string | null = null;
          for (const l of memoLogs) {
            try {
              const ev = decodeEventLog({ abi: memoAbi, data: l.data, topics: l.topics });
              const a = ev.args as { callDataHash: Hex; memo: Hex };
              if (a.callDataHash.toLowerCase() !== wantHash) continue;
              matched = a.memo && a.memo !== "0x" ? fromHex(a.memo, "string") : "";
              break;
            } catch {
              /* not a Memo log we can read */
            }
          }
          if (matched === null) {
            // Notes were published for this run, but none is bound to this
            // transfer. Worth surfacing rather than quietly showing nothing.
            setNoteCheck("fail");
          } else {
            setOnChainNote(matched);
            setNoteCheck("pass");
          }
        }
      } catch (e: any) {
        setProblem(e?.shortMessage || e?.message || String(e));
        setInclusion("fail");
        setTransfer("fail");
        setNoteCheck("fail");
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
          {noteCheck === "pass" && (
            <tr>
              <th>Reason</th>
              <td>
                {onChainNote ? onChainNote : <span className="muted">(blank)</span>}{" "}
                <span className="muted small">— read from the chain</span>
              </td>
            </tr>
          )}
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
        <li>
          {noteCheck === "pass"
            ? "✅"
            : noteCheck === "fail"
              ? "❌"
              : noteCheck === "absent"
                ? "➖"
                : "⏳"}{" "}
          {noteCheck === "absent" ? (
            <>
              No on-chain note for this run. The payer kept the reason off-chain, which is allowed
              and changes nothing about the two checks above.
            </>
          ) : noteCheck === "fail" ? (
            <>
              This run published notes, but none of them is bound to this transfer. Treat the reason
              shown in the link as unverified.
            </>
          ) : (
            <>
              The published reason is cryptographically bound to this exact transfer, by{" "}
              <code>callDataHash</code> in Arc's <code>Memo</code> event.
            </>
          )}
        </li>
      </ul>
      <p className="muted small">
        The first two are what make this a payment. A proof alone would only show the payer{" "}
        <em>declared</em> one, the transfer log is what shows the money moved. They share one
        transaction hash, so neither can be forged without the other. The third is the payer's
        stated reason, and a run without it is no less valid. Verified directly against Arc; this
        page stores nothing and asks you to trust no one.
      </p>
    </main>
  );
}
