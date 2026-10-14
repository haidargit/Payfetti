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
import { buildRun, deriveRunId, type BuiltRun } from "../lib/batch";
import { usd, usdc } from "../lib/format";
import { Callout } from "../components/Callout";
import { Field, Switch } from "../components/Field";
import { Icon } from "../components/Icon";
import { PayeeTable, RejectTable, type PayeeRow } from "../components/PayeeTable";
import { QuotePanel } from "../components/QuotePanel";
import { RunReceipts } from "../components/RunReceipts";
import { Steps } from "../components/Steps";

type Phase = "edit" | "sending" | "done" | "error";

/**
 * `CallFrom` accepts only EOAs, so a smart account connects fine and reverts at
 * send time. Bytecode at the address is the test.
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

/**
 * A low-level call to an address with no code returns success, so
 * `allowFailure: false` does not catch a missing registry. The transfers would
 * spend real money with nothing recorded and no double-pay guard. One wrong
 * `VITE_CHAIN_ID` is all it takes.
 */
function useRegistryDeployed() {
  const publicClient = usePublicClient();
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");

  useEffect(() => {
    let live = true;
    if (!publicClient) return;
    publicClient
      .getCode({ address: PAYFETTI_ADDRESS })
      .then((code) => {
        if (live) setState(code && code !== "0x" ? "yes" : "no");
      })
      // A transport failure is not proof of absence, so do not block on it.
      .catch(() => live && setState("yes"));
    return () => {
      live = false;
    };
  }, [publicClient]);

  return state;
}

export function Create() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: gasPrice } = useGasPrice();
  const { data: balance } = useBalance({ address });

  const [text, setText] = useState(EXAMPLE);
  const [label, setLabel] = useState("Payfetti run");
  // On by default: the note makes a receipt survive without the link. Costs
  // 9,299 gas per payee and publishes the text, so it can be turned off.
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
  const registry = useRegistryDeployed();

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
    registry === "yes" &&
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
      // Derived from the list, so a repeat under the same label collides and
      // the chain refuses it. See `deriveRunId`.
      const runId = deriveRunId({ payer: address, rows: parsed.rows, label });

      // Ask before signing: a payer whose tab reloaded mid-send needs "already
      // went through", not a revert.
      const already = (await publicClient.readContract({
        address: PAYFETTI_ADDRESS,
        abi: payfettiAbi,
        functionName: "runExists",
        args: [address, runId],
      })) as boolean;

      if (already) {
        setPhase("error");
        setError(
          "This exact run has already been paid from this wallet. Nobody was charged again. " +
            "If you meant to pay the same list a second time, change the run label first.",
        );
        return;
      }

      const run = buildRun(parsed.rows, label, runId, { onChainNotes });
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

      // Read who was actually paid from the logs. Half two of the receipt.
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

  /** Separate transaction: which transfers reverted is known only once mined. */
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
      <div className="pf-intro is-tight">
        <Steps at={phase === "sending" ? 1 : 0} />
        <h1 style={{ fontSize: "clamp(27px, 3.2vw, 36px)", marginTop: 18 }}>New payout run</h1>
        <p className="small muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
          Every line is checked first. Once it has gone out, it cannot be called back.
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
                hint="Appears on every receipt you hand out. Name it so you still recognise it in a year."
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
                    Each note is published permanently and anyone can read it, so a payee can find
                    their own payment without a link from you. Adds{" "}
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
              A single payment can only carry so many people. Split this into batches of{" "}
              {MAX_PAYEES} or fewer and send them one after another.
            </Callout>
          )}

          {registry === "no" && (
            <Callout tone="err" title="Payfetti is not available on this network">
              There is no payout registry at <code>{PAYFETTI_ADDRESS}</code> on {chain.name}, so
              sending here would move the money without recording the run, leaving every payee with
              a receipt that cannot be checked. Sending is blocked until that is fixed.
            </Callout>
          )}

          {isContractAccount && (
            <Callout tone="err" title="This wallet is a smart contract account">
              Shared and smart-contract wallets, like a Safe, cannot send payments here. That is a
              limit of the network itself, not something we can work around. Connect a standard
              personal wallet instead. <a href="#/docs/limits">More on what this cannot do</a>.
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
              Before anything leaves your wallet, every address is checked, anyone listed twice is
              flagged, amounts that cannot be sent exactly are caught, and your balance is weighed
              against the total.
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
