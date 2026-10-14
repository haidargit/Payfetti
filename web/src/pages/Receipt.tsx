import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { decodeEventLog, encodeFunctionData, fromHex, keccak256, toHex, type Hex } from "viem";
import {
  MEMO,
  PAYFETTI_ADDRESS,
  USDC,
  addressUrl,
  chain,
  erc20Abi,
  memoAbi,
  payfettiAbi,
  txUrl,
} from "../lib/chain";
import { shortHex, usdc } from "../lib/format";
import { Check, CheckList } from "../components/CheckList";
import { Copyable } from "../components/Copyable";
import { Icon } from "../components/Icon";
import { Seal, type Verdict } from "../components/Seal";
import { Band } from "../components/Band";
import { NavLink } from "../components/NavLink";

/**
 * Both halves of a receipt, as `docs/security.md` requires: the inclusion proof
 * and a `Transfer` log in the same transaction. Half one alone proves only that
 * the payer declared a run. A `Memo` log adds a third reading, binding a note to
 * this payee. `wasSkipped` is read only when half two fails, and never turns a
 * failure into a pass.
 */

type Check2 = "pending" | "pass" | "fail";
type NoteCheck = "pending" | "pass" | "absent" | "fail";

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const RUN_RECORDED_TOPIC = keccak256(
  toHex("RunRecorded(address,bytes32,bytes32,uint256,uint32,string)"),
);
const MEMO_TOPIC = keccak256(toHex("Memo(address,address,bytes32,bytes32,bytes,uint256)"));

/**
 * Every field comes from a URL a stranger may have mangled. Anything off-shape
 * is a broken link, not something passed to viem or `BigInt`, which throw
 * during render and blank the page.
 */
const asAddress = (v: string | null): Hex | null =>
  v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Hex) : null;

const asHash = (v: string | null): Hex | null =>
  v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as Hex) : null;

const asAmount = (v: string | null): bigint | null => {
  if (!v || !/^\d{1,30}$/.test(v)) return null;
  const n = BigInt(v);
  return n > 0n ? n : null;
};

/** Every element must be a hash, or the proof is not a proof. */
const asProof = (v: string | null): Hex[] => {
  const parts = (v || "").split(",").filter(Boolean);
  return parts.every((p) => asHash(p)) ? (parts as Hex[]) : [];
};

export function Receipt() {
  const publicClient = usePublicClient();
  const [inclusion, setInclusion] = useState<Check2>("pending");
  const [transfer, setTransfer] = useState<Check2>("pending");
  const [noteCheck, setNoteCheck] = useState<NoteCheck>("pending");
  const [onChainNote, setOnChainNote] = useState<string | null>(null);
  const [wasSkipped, setWasSkipped] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string>("");

  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const payer = asAddress(q.get("payer"));
  const runId = asHash(q.get("runId"));
  const payee = asAddress(q.get("payee"));
  const amount = asAmount(q.get("amount"));
  const memo = q.get("memo") ?? "";
  const proof = asProof(q.get("proof"));
  const amountKey = amount?.toString() ?? "";

  useEffect(() => {
    (async () => {
      // wagmi hands the client over a tick after mount, so wait rather than
      // telling a payee their payment failed.
      if (!publicClient) return;

      if (!payer || !runId || !payee || !amount) {
        setProblem("This receipt link is missing required fields.");
        setInclusion("fail");
        setTransfer("fail");
        setNoteCheck("fail");
        return;
      }

      // A verdict from a previous link must not survive into this one.
      setProblem("");
      setInclusion("pending");
      setTransfer("pending");
      setNoteCheck("pending");
      setWasSkipped(false);

      try {
        const noteHash = keccak256(toHex(memo));

        // half 1: inclusion proof, free via eth_call
        const ok = (await publicClient.readContract({
          address: PAYFETTI_ADDRESS,
          abi: payfettiAbi,
          functionName: "verifyInclusion",
          args: [payer, runId, payee, amount, noteHash, proof],
        })) as boolean;
        setInclusion(ok ? "pass" : "fail");

        // half 2: the run record stores its own block number, so finding its
        // transaction is O(1) rather than a log scan.
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
            BigInt(l.data) >= amount,
        );
        setTransfer(found ? "pass" : "fail");
        if (!found) {
          setProblem(
            "The run was declared, but no matching USDC transfer appears in that transaction.",
          );
          const skipped = (await publicClient.readContract({
            address: PAYFETTI_ADDRESS,
            abi: payfettiAbi,
            functionName: "wasSkipped",
            args: [payer, runId, payee],
          })) as boolean;
          setWasSkipped(skipped);
        }

        // third reading: `callDataHash` is keccak256 of the inner calldata, so
        // rebuilding `transfer(payee, amount)` ties the note to this payee.
        const wantHash = keccak256(
          encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [payee, amount],
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
            // Notes exist for this run but none binds to this transfer.
            setNoteCheck("fail");
          } else {
            setOnChainNote(matched);
            setNoteCheck("pass");
          }
        }
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string };
        setProblem(err?.shortMessage || err?.message || String(e));
        setInclusion("fail");
        setTransfer("fail");
        setNoteCheck("fail");
      }
    })();
  }, [publicClient, payer, runId, payee, amountKey, memo]);

  if (!payer || !runId || !payee || !amount) return <ReceiptLookup />;

  const verdict: Verdict =
    inclusion === "pass" && transfer === "pass"
      ? "paid"
      : inclusion === "pending" || transfer === "pending"
        ? "checking"
        : "unverified";

  const title =
    verdict === "paid"
      ? "Paid, and proven on Arc."
      : verdict === "checking"
        ? "Checking against Arc…"
        : wasSkipped
          ? "This payment was skipped."
          : "This receipt does not check out.";

  const sub =
    verdict === "paid"
      ? "Both halves verified in your browser, directly against the chain."
      : verdict === "checking"
        ? "Reading the registry and the transaction's logs."
        : wasSkipped
          ? "The payer recorded this payee as skipped, so the transfer reverted and the money never left their wallet."
          : problem;

  return (
    <Band>
      <div className="doc-page">
        <div className="wrap-narrow" style={{ maxWidth: 680 }}>
        <article className="doc">
          <div
            className={`doc-head${verdict === "paid" ? " is-ok" : verdict === "unverified" ? " is-bad" : ""}`}
          >
            <div className="spread" style={{ marginBottom: 18 }}>
              <span className="caps">Payment receipt</span>
              <span className="caps">{chain.name}</span>
            </div>

            <div className="doc-verdict">
              <Seal verdict={verdict} />
              <div>
                <div className="doc-verdict-title">{title}</div>
                <p className="small muted" style={{ marginTop: 3, maxWidth: "46ch" }}>
                  {sub}
                </p>
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="caps">Amount</div>
              <div className="doc-amount" style={{ marginTop: 2 }}>
                {usdc(amount)}
                <span className="unit">USDC</span>
              </div>
            </div>
          </div>

          <div className="card-body" style={{ paddingTop: 4 }}>
            <table className="doc-rows">
              <tbody>
                <tr>
                  <th>Paid to</th>
                  <td>
                    <Copyable value={payee} label="payee address" />
                  </td>
                </tr>
                <tr>
                  <th>Paid by</th>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <Copyable value={payer} short label="payer address" />
                      <a
                        className="inline-link tiny"
                        href={addressUrl(payer)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        explorer
                        <Icon name="external" size={11} />
                      </a>
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>Run</th>
                  <td>{memo || <span className="faint">—</span>}</td>
                </tr>
                {noteCheck === "pass" && (
                  <tr>
                    <th>Reason</th>
                    <td>
                      {onChainNote || <span className="faint">(blank)</span>}{" "}
                      <span className="faint tiny">read from the chain</span>
                    </td>
                  </tr>
                )}
                <tr>
                  <th>When</th>
                  <td>{when ?? <span className="faint">—</span>}</td>
                </tr>
                <tr>
                  <th>Transaction</th>
                  <td>
                    {hash ? (
                      <a className="inline-link" href={txUrl(hash)} target="_blank" rel="noreferrer">
                        <span className="mono">{shortHex(hash, 10, 6)}</span>
                        <Icon name="external" size={12} />
                      </a>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card-body">
            <h2 style={{ fontSize: 15 }}>How this was checked</h2>
            <p className="small muted" style={{ margin: "6px 0 2px" }}>
              The first two are what make this a payment rather than a claim. They happened
              together, so neither one can be faked on its own.
            </p>

            <CheckList>
              <Check
                state={inclusion}
                title="The payer committed to this exact amount, to this address"
              >
                A Merkle inclusion proof against the root stored in the run registry. On its own
                this only shows a payment was <em>declared</em>.
              </Check>

              <Check
                state={transfer}
                title="A matching USDC transfer sits in that same transaction"
              >
                {transfer === "fail" && wasSkipped
                  ? "The payer has recorded this payee as skipped. The declaration is real, the transfer reverted, and no money moved."
                  : "Read from the transaction's own logs, filtered to the 6-decimal ERC-20 emitter so Arc's system emitter cannot double-count it."}
              </Check>

              <Check
                state={noteCheck}
                title={
                  noteCheck === "absent"
                    ? "No on-chain note for this run"
                    : noteCheck === "fail"
                      ? "The published note is not bound to this transfer"
                      : "The published reason belongs to this transfer"
                }
              >
                {noteCheck === "absent" ? (
                  <>
                    The payer kept the reason off-chain, which is allowed and changes nothing about
                    the two checks above.
                  </>
                ) : noteCheck === "fail" ? (
                  <>
                    This run published notes, but none of them matches this payee and amount. Treat
                    the reason shown in the link as unverified.
                  </>
                ) : (
                  <>
                    Bound by <code>callDataHash</code> in Arc's <code>Memo</code> event, so it cannot
                    have been lifted from another payee's row.
                  </>
                )}
              </Check>
            </CheckList>
          </div>

          <div className="card-foot">
            <p className="tiny faint">
              Checked in your own browser, straight against the network. Nothing here is stored,
              and you do not have to take anyone's word for it, ours included. Reload to check again
              whenever you like.
            </p>
          </div>
        </article>

          <p className="small muted" style={{ marginTop: 18, textAlign: "center" }}>
            <NavLink href="#/pay">Send your own payout run</NavLink>
          </p>
        </div>
      </div>
    </Band>
  );
}

/** A receipt URL with no fields is somebody looking for the verifier itself. */
function ReceiptLookup() {
  const [url, setUrl] = useState("");
  return (
    <Band>
      <div className="doc-page">
        <div className="wrap-narrow" style={{ maxWidth: 560 }}>
        <article className="card">
          <div className="card-body">
            <h1 style={{ fontSize: 24 }}>Check a receipt</h1>
            <p className="muted small" style={{ marginTop: 8 }}>
              Drop in a Payfetti receipt link. Everything needed to check it travels inside the
              link, and the checking happens right here in your browser.
            </p>
            <div style={{ marginTop: 16 }}>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/#/receipt?payer=0x…"
                aria-label="Receipt link"
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              disabled={!url.includes("#/receipt?")}
              onClick={() => {
                window.location.hash = `#${url.split("#")[1] ?? ""}`;
                window.location.reload();
              }}
            >
              Verify
              <Icon name="arrow-right" size={15} />
            </button>
          </div>
          <div className="card-foot">
            <p className="tiny faint">
              A real receipt has to show two things: that you were promised the amount, and that
              the money actually moved. Both are checked here, and if either is missing the page
              says so plainly.
            </p>
          </div>
        </article>
        </div>
      </div>
    </Band>
  );
}
