import { Band } from "./Band";
import { Icon } from "./Icon";

/**
 * The argument for the product, stated once, in the one place on the page that
 * is not a form. Every figure here is measured on Arc and reproducible from the
 * repo, so none of it is rounded up for effect.
 */

const POINTS = [
  {
    stat: "1",
    unit: "signature",
    title: "One transaction, every payee.",
    body: (
      <>
        <code>Multicall3From</code> batches the transfers, and Arc's <code>CallFrom</code> precompile
        keeps you as <code>msg.sender</code>. No approval step, and the contract never holds a cent
        of yours.
      </>
    ),
  },
  {
    stat: "$0.00093",
    unit: "per payee",
    title: "A tenth of a cent a person.",
    body: (
      <>
        200 payees cost 9,425,620 gas, about <strong>$0.189</strong> all in. Card rails start at 25
        cents per payment, which is where a $1 payout stops being worth making.
      </>
    ),
  },
  {
    stat: "<1s",
    unit: "to final",
    title: "Paid means paid.",
    body: (
      <>
        Deterministic finality in under a second, so the screen can say paid without hedging, and a
        payee can check it themselves before they close the tab.
      </>
    ),
  },
];

export function ArcBand() {
  return (
    <>
      <Band dark id="why-arc">
        <div style={{ paddingTop: 76 }}>
          <p className="caps" style={{ color: "var(--d-acc)" }}>
            Built on Arc, Circle's stablecoin L1
          </p>
          <h2
            style={{
              fontSize: "clamp(26px, 3.2vw, 38px)",
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              marginTop: 12,
              maxWidth: "20ch",
            }}
          >
            USDC is the gas token here. That changes what a payment is allowed to cost.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
              margin: "40px 0 20px",
            }}
          >
            {POINTS.map((p) => (
              <div className="card" key={p.title} style={{ padding: "22px 22px 24px" }}>
                <div className="row" style={{ alignItems: "baseline", gap: 7 }}>
                  <span
                    className="num"
                    style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.03em" }}
                  >
                    {p.stat}
                  </span>
                  <span className="tiny faint">{p.unit}</span>
                </div>
                <h3 style={{ marginTop: 12, fontSize: 15.5 }}>{p.title}</h3>
                <p className="small" style={{ marginTop: 7, color: "var(--ink-2)" }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>

          <p className="small faint" style={{ display: "flex", gap: 8, paddingBottom: 72 }}>
            <Icon name="info" size={14} />
            <span>
              Measured on Arc, not estimated. Base fees here are denominated in USDC and smoothed
              by design, targeting roughly $0.001 for an ERC-20 transfer, which is why a quote
              shown before you sign still holds when it lands.{" "}
              <a
                href="https://docs.arc.io/arc/concepts/stable-fee-design"
                target="_blank"
                rel="noreferrer"
              >
                Arc on stable fee design
              </a>
              .
            </span>
          </p>
        </div>
      </Band>
    </>
  );
}
