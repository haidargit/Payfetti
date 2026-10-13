import { RAILS, RAILS_CHECKED, railCost } from "../lib/rails";
import { usd, usdRange } from "../lib/format";

/**
 * The same payee list, priced on the rails it would otherwise run on. Our own
 * number is the live quote for this exact run; theirs are published per-payment
 * floors multiplied out, which the caption has to say so the comparison is not
 * read as a benchmark we ran.
 */
export function RailCompare({ payees, feeUsdc }: { payees: number; feeUsdc: number }) {
  if (payees === 0) return null;
  return (
    <div>
      <div className="rails-row is-ours">
        <span>
          <strong>Payfetti on Arc</strong>
        </span>
        <span className="amt">{usd(feeUsdc)}</span>
      </div>
      {RAILS.map((r) => {
        const [lo, hi] = railCost(r, payees);
        return (
          <div className="rails-row" key={r.name}>
            <span className="muted">{r.name}</span>
            <span className="amt">{usdRange(lo, hi)}</span>
          </div>
        );
      })}
      <p className="tiny faint" style={{ marginTop: 10 }}>
        Fees only, for {payees} {payees === 1 ? "payment" : "payments"}. Ours is this run&rsquo;s
        live quote; theirs are published prices as of {RAILS_CHECKED}.
      </p>
    </div>
  );
}
