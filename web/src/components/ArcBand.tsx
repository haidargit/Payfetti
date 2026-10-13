import { Band } from "./Band";
import { Icon } from "./Icon";
import { ProvenRuns } from "./ProvenRuns";

/**
 * The argument for the product, stated once, in the one place on the page that
 * is not a form. Every figure here is measured on Arc and reproducible from the
 * repo, so none of it is rounded up for effect.
 */

const POINTS = [
  {
    stat: "1",
    unit: "signature",
    title: "One approval, everyone paid.",
    body: (
      <>
        You approve once and the whole list goes out together. Nothing to pre-authorise, and the
        money never passes through us on its way to them.
      </>
    ),
  },
  {
    stat: "$0.00093",
    unit: "per payee",
    title: "A tenth of a cent a person.",
    body: (
      <>
        Paying 200 people costs about <strong>19 cents</strong> in total. Cards start at 25 cents
        for each person, which is the point where paying someone $1 stops being worth the trouble.
      </>
    ),
  },
  {
    stat: "<1s",
    unit: "to final",
    title: "Paid means paid.",
    body: (
      <>
        It settles in under a second, so when the screen says paid, it is done. Your payee can
        confirm it themselves before they even close the tab.
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
            Why it costs so little
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
            On{" "}
            <a href="https://www.arc.io" target="_blank" rel="noreferrer">
              Arc
            </a>
            , the fee is paid in dollars. That is why sending someone $1 finally makes sense.
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

          <ProvenRuns />

          <p className="small faint" style={{ display: "flex", gap: 8, paddingBottom: 72, marginTop: 34 }}>
            <Icon name="info" size={14} />
            <span>
              These are real figures, not projections. Arc prices its fees in dollars and keeps
              them steady on purpose, which is why the price you are shown before approving is the
              price you actually pay.{" "}
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
