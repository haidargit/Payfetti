import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useGasPrice, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, type Hex } from "viem";
import {
  BLOCK_GAS_LIMIT,
  MAX_PAYEES,
  MIN_GAS_PRICE,
  MULTICALL3FROM,
  PAYFETTI_ADDRESS,
  USDC,
  chain,
  estimateRunGas,
  gasCostUsdc,
  multicall3FromAbi,
  payfettiAbi,
} from "../lib/chain";
import { EXAMPLE, formatUsdc, parseRows } from "../lib/parse";
import { buildRun, newRunId, type BuiltRun } from "../lib/batch";
import { count, usd, usdc } from "../lib/format";
import { Callout } from "../components/Callout";
import { Field, Switch } from "../components/Field";
import { Icon } from "../components/Icon";
import { PayeeTable, RejectTable, type PayeeRow } from "../components/PayeeTable";
import { QuotePanel } from "../components/QuotePanel";
import { RunReceipts } from "../components/RunReceipts";
import { Steps } from "../components/Steps";

type Phase = "edit" | "sending" | "done" | "error";

/**
 * Arc's `CallFrom` precompile accepts only EOAs, so a smart contract account
 * cannot pay through Payfetti at all. A wallet like that connects perfectly
 * well and then reverts at send time, which is a terrible place to find out.
 * Bytecode at the address is the test.
 */
function useIsContractAccount(address: Hex | undefined) {
  const publicClient = usePublicClient();
  const [isContract, setIsContract] = useState(false);

  useEffect(() => {
    let live = true;
    if (!publicClient || !address) {
      setIsContract(false);
      return;
    }
    publicClient
      .getCode({ address })
      .then((code) => {
        if (live) setIsContract(Boolean(code) && code !== "0x");
      })
      .catch(() => {
        // A failed lookup is not evidence of a smart account, so say nothing.
        if (live) setIsContract(false);
      });
    return () => {
      live = false;
    };
  }, [publicClient, address]);

  return isContract;
}

export function Create() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: gasPrice } = useGasPrice();
  const { data: balance } = useBalance({ address });

  const [text, setText] = useState(EXAMPLE);
  const [label, setLabel] = useState("Payfetti run");
  // On by default: an on-chain note is the difference between a receipt that
  // survives on its own and one that only exists in a link you have to send.
  // Costs 9,299 gas per payee and publishes the note text, so it can be turned off.
  const [onChainNotes, setOnChainNotes] = useState(true);
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [built, setBuilt] = useState<BuiltRun | null>(null);
  const [results, setResults] = useState<boolean[] | null>(null);
  const [sentFee, setSentFee] = useState(0);
  const [recordingSkips, setRecordingSkips] = useState(false);
  const [skipsRecorded, setSkipsRecorded] = useState(false);
  const rowsRef = useRef<HTMLTextAreaElement>(null);

  const isContractAccount = useIsContractAccount(address);

  const parsed = useMemo(() => parseRows(text), [text]);

  const gas = estimateRunGas(parsed.rows.length, onChainNotes);
  const gasBare = estimateRunGas(parsed.rows.length, false);
  // Quote at the live price but never below Arc's 20 Gwei floor, since a transaction
  // under the floor is silently dropped with no error and no receipt.
  const price = gasPrice && gasPrice > MIN_GAS_PRICE ? gasPrice : MIN_GAS_PRICE;
  const feeUsdc = gasCostUsdc(gas, price);
  const notesFee = gasCostUsdc(gas - gasBare, price);

  // The native balance is 18-decimal; the list totals are 6-decimal. Compare in
  // 6-decimal space, never by mixing the two views.
  const balance6 = balance ? balance.value / 10n ** 12n : null;
  const needed6 = parsed.total + BigInt(Math.ceil(feeUsdc * 1e6));
  const shortfall = balance6 !== null ? needed6 - balance6 : 0n;

  const tooBig = gas > BLOCK_GAS_LIMIT || parsed.rows.length > MAX_PAYEES;
  const canSend =
    isConnected &&
    !isContractAccount &&
    parsed.rows.length > 0 &&
    parsed.errors.length === 0 &&
    !tooBig &&
    shortfall <= 0n &&
    phase === "edit";

  /** Put the caret on a rejected line so a 200-row paste stays navigable. */
  function focusLine(line: number) {
    const ta = rowsRef.current;
    if (!ta) return;
    const lines = text.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }

  async function send() {
    if (!walletClient || !publicClient || !address) return;
    setError("");
    setPhase("sending");
    try {
      const run = buildRun(parsed.rows, label, newRunId(), { onChainNotes });
      setBuilt(run);
      setSentFee(feeUsdc);

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
            log.address.toLowerCase() === USDC.toLowerCase() &&
            (ev.args as { from?: string }).from?.toLowerCase() === address.toLowerCase()
          ) {
            paid.add((ev.args as { to: string }).to.toLowerCase());
          }
        } catch {
          /* not a Transfer log */
        }
      }
      // Gas actually burned, which is what the payer was charged.
      setSentFee(gasCostUsdc(receipt.gasUsed, receipt.effectiveGasPrice ?? price));
      setResults(run.receipts.map((r) => paid.has(r.payee.toLowerCase())));
      setPhase("done");
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || String(e));
      setPhase("error");
    }
  }

  /**
   * Writes the failed payees into the registry. Separate transaction by
   * necessity: which transfers reverted is only known once the batch is mined.
   */
  async function recordSkips(payees: Hex[]) {
    if (!walletClient || !publicClient || !address || !built) return;
    setRecordingSkips(true);
    try {
      const hash = await walletClient.writeContract({
        address: PAYFETTI_ADDRESS,
        abi: payfettiAbi,
        functionName: "markSkipped",
        args: [built.runId, payees],
        chain,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSkipsRecorded(true);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || String(e));
    } finally {
      setRecordingSkips(false);
    }
  }

  function resetRun() {
    setPhase("edit");
    setBuilt(null);
    setResults(null);
    setTxHash(null);
    setSkipsRecorded(false);
    setError("");
  }

  if (phase === "done" && built && address) {
    return (
      <RunReceipts
        payer={address}
        run={built}
        label={label}
        txHash={txHash}
        paid={results}
        feeUsdc={sentFee}
        skipsRecorded={skipsRecorded}
        recordingSkips={recordingSkips}
        onRecordSkips={recordSkips}
        onRetrySkipped={(rows) => {
          setText(
            rows.map((r) => `${r.payee}, ${formatUsdc(r.amount)}, ${r.note}`).join("\n"),
          );
          setLabel(`${label} (retry)`);
          resetRun();
        }}
        onNewRun={() => {
          setText(EXAMPLE);
          resetRun();
        }}
      />
    );
  }

  const previewRows: PayeeRow[] = parsed.rows.map((r) => ({
    payee: r.payee,
    amount: r.amount,
    note: r.note,
  }));

  return (
    <>
      <div className="hero is-tight">
        <Steps at={phase === "sending" ? 1 : 0} />
        <h1 style={{ fontSize: "clamp(27px, 3.2vw, 36px)", marginTop: 18 }}>New payout run</h1>
        <p className="small muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
          Everything is checked before you sign, because a transfer cannot be undone.
        </p>
      </div>

      <div className="layout">
        <div className="stack-lg" style={{ minWidth: 0 }}>
          <section className="card">
            <div className="card-body">
              <Field
                id="label"
                label="Run label"
                tour="label"
                hint="Stored on-chain with the run and shown on every receipt. Name it so you recognise it in a year."
              >
                <input
                  id="label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="March survey, batch 2"
                />
              </Field>

              <Field
                id="rows"
                label="Payees"
                tour="rows"
                aside={<code>address, amount, note</code>}
                hint={
                  <>
                    One per line. Commas, tabs or semicolons; <code>#</code> comments and blank lines
                    are ignored. Up to {MAX_PAYEES} rows in one run.
                  </>
                }
              >
                <textarea
                  id="rows"
                  ref={rowsRef}
                  rows={12}
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
            </div>

            <div className="card-body" data-tour="notes">
              <Switch
                id="onchain"
                checked={onChainNotes}
                onChange={setOnChainNotes}
                title="Write each note on-chain"
              >
                {onChainNotes ? (
                  <>
                    Each note is stored permanently on Arc and anyone can read it, so a payee can
                    look their own payment up without a link from you. Adds{" "}
                    <strong>{usd(notesFee)}</strong> to this run
                    {parsed.rows.length > 0 && <> across {parsed.rows.length} payees</>}. Turn it off
                    for anything identifying.
                  </>
                ) : (
                  <>
                    Notes stay off-chain, in the receipt links only. Cheaper, but if you lose the run
                    file the notes are gone and recipients cannot look themselves up.
                  </>
                )}
              </Switch>
            </div>
          </section>

          {parsed.errors.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 style={{ fontSize: 15, color: "var(--err)" }}>
                  {parsed.errors.length} {parsed.errors.length === 1 ? "line" : "lines"} cannot be
                  paid
                </h2>
                <span className="tiny faint">nothing sends until they are fixed or removed</span>
              </div>
              <RejectTable rows={parsed.errors} />
              <div className="card-foot">
                <div className="row-wrap tiny">
                  <span className="faint">Jump to line</span>
                  {parsed.errors.slice(0, 12).map((e) => (
                    <button key={e.line} className="btn btn-sm" onClick={() => focusLine(e.line)}>
                      {e.line}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {parsed.warnings.map((w) => (
            <Callout tone="warn" key={w}>
              {w}
            </Callout>
          ))}

          {tooBig && (
            <Callout tone="err" title="Too large for one transaction">
              This run needs {count(gas)} gas, past Arc's {count(BLOCK_GAS_LIMIT)} block limit. Split
              it into runs of {MAX_PAYEES} or fewer.
            </Callout>
          )}

          {isContractAccount && (
            <Callout tone="err" title="This wallet is a smart contract account">
              Arc's <code>CallFrom</code> precompile accepts only externally owned accounts, so a
              Safe, an ERC-4337 account or any other smart account cannot pay through Payfetti.
              That is a protocol constraint rather than something we can work around. Connect an
              EOA instead, and see <a href="#/docs/limits">Honest limits</a>.
            </Callout>
          )}

          {isConnected && shortfall > 0n && (
            <Callout tone="err" title={`Short by ${usdc(shortfall)} USDC`}>
              Payouts plus fees come to {usdc(needed6)} and you hold {usdc(balance6 ?? 0n)}.
            </Callout>
          )}

          {phase === "error" && (
            <Callout tone="err" title="The run did not go through">
              <p className="mono small" style={{ marginTop: 4 }}>
                {error}
              </p>
              <p style={{ marginTop: 8 }}>
                No money moved unless a transaction appears in your wallet history. A reused run id
                reverts the whole batch by design, so nothing is half-paid.
              </p>
            </Callout>
          )}

          {parsed.rows.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 style={{ fontSize: 15 }}>
                  {parsed.rows.length} {parsed.rows.length === 1 ? "payee" : "payees"} ready
                </h2>
                <span className="tiny faint">
                  {usdc(parsed.total)} USDC · checksums and duplicates checked
                </span>
              </div>
              <PayeeTable rows={previewRows} />
            </section>
          )}

          <p className="tiny faint" style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <Icon name="info" size={13} />
            <span>
              Validation runs before anything is signed: checksummed addresses, no zero address, no
              amount with more than six decimals, duplicates flagged, total checked against your
              balance. Transfers are irreversible, so these are the last line of defence.
            </span>
          </p>
        </div>

        <aside className="layout-side" data-tour="quote">
          <QuotePanel
            payees={parsed.rows.length}
            total={parsed.total}
            feeUsdc={feeUsdc}
            gas={gas}
            gasPrice={price}
            balance6={balance6}
            shortfall6={shortfall}
            isConnected={isConnected}
            canSend={canSend}
            sending={phase === "sending"}
            onSend={send}
          />
        </aside>
      </div>
    </>
  );
}
