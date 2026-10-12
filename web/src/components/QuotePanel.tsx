import { gwei, usd, usdc } from "../lib/format";
import { BlockMeter } from "./BlockMeter";
import { RailCompare } from "./RailCompare";
import { Icon } from "./Icon";

/**
 * The quote is the whole pitch, so it is sticky and it is exact: the fee shown
 * here is gas at the quoted price, not a band or an estimate of an estimate.
 */
export function QuotePanel({
  payees,
  total,
  feeUsdc,
  gas,
  gasPrice,
  balance6,
  shortfall6,
  isConnected,
  canSend,
  sending,
  onSend,
}: {
  payees: number;
  total: bigint;
  feeUsdc: number;
  gas: bigint;
  gasPrice: bigint;
  balance6: bigint | null;
  shortfall6: bigint;
  isConnected: boolean;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const perPayee = payees > 0 ? feeUsdc / payees : 0;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2 style={{ fontSize: 15 }}>This run</h2>
          <span className="caps">1 transaction</span>
        </div>

        <div className="card-body">
          <div className="caps">Total payout</div>
          <div className="quote-total" style={{ marginTop: 2 }}>
            {usdc(total)}
            <span className="unit">USDC</span>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="kv">
              <span className="kv-k">Payees</span>
              <span className="kv-v">{payees}</span>
            </div>
            <div className="kv">
              <span className="kv-k">Network fee</span>
              <span className="kv-v">{usd(feeUsdc)}</span>
            </div>
            <div className="kv">
              <span className="kv-k">Fee per payee</span>
              <span className="kv-v">{payees > 0 ? usd(perPayee) : "—"}</span>
            </div>
            <div className="kv kv-strong">
              <span className="kv-k">You pay</span>
              <span className="kv-v">{usd(Number(total) / 1e6 + feeUsdc)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <BlockMeter gas={gas} />
            <p className="tiny faint" style={{ marginTop: 7 }}>
              Quoted at {gwei(gasPrice)} Gwei, Arc's floor being 20. USDC is the gas token here, so
              the fee is denominated in the same dollars as the payout.
            </p>
          </div>
        </div>

        <div className="card-foot">
          <button
            className="btn btn-primary btn-block"
            onClick={onSend}
            disabled={!canSend}
            data-tour="pay"
            style={{ padding: "13px 16px", fontSize: 15 }}
          >
            {sending ? (
              <>
                <Icon name="spinner" size={15} />
                Confirm in your wallet
              </>
            ) : (
              <>
                Pay {payees > 0 ? payees : ""} {payees === 1 ? "person" : "people"}
                <Icon name="arrow-right" size={15} />
              </>
            )}
          </button>

          <p className="tiny faint" style={{ marginTop: 9, textAlign: "center" }}>
            {!isConnected
              ? "Connect a wallet to send."
              : balance6 !== null && shortfall6 > 0n
                ? `Short by ${usdc(shortfall6)} USDC.`
                : balance6 !== null
                  ? `Balance ${usdc(balance6)} USDC. No approval step, no custody.`
                  : "No approval step, no custody."}
          </p>
        </div>
      </section>

      {payees > 0 && (
        <section className="card">
          <div className="card-head">
            <h2 style={{ fontSize: 15 }}>The same list elsewhere</h2>
          </div>
          <div className="card-body">
            <RailCompare payees={payees} feeUsdc={feeUsdc} />
          </div>
        </section>
      )}
    </>
  );
}
