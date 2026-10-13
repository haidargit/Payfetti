import { useState } from "react";
import { MAX_PAYEES, MIN_GAS_PRICE, estimateRunGas, gasCostUsdc } from "../lib/chain";
import { RAILS, RAILS_CHECKED, railCost } from "../lib/rails";
import { count, pct, usd, usdRange } from "../lib/format";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";

/**
 * The argument, made arithmetic, before anyone connects anything.
 *
 * This is not a mock. It runs the same `estimateRunGas` the composer quotes
 * from, against the same measured per-payee figure, so the number here is the
 * number you get. The one thing it cannot know without a wallet is the live
 * base fee, so it quotes at Arc's floor and says so.
 */

const PRESETS = [
  { payees: 50, each: 1, label: "A survey" },
  { payees: 200, each: 1.5, label: "A study" },
  { payees: 500, each: 0.5, label: "A bounty round" },
];

export function Calculator() {
  const [payees, setPayees] = useState(200);
  const [each, setEach] = useState(1.5);

  const gas = estimateRunGas(payees, true);
  const fee = gasCostUsdc(gas, MIN_GAS_PRICE);
  const payout = payees * each;

  // What the fee costs you as a share of the money you meant to hand over.
  const ourShare = payout > 0 ? (fee / payout) * 100 : 0;
  const card = RAILS.find((r) => r.name.startsWith("Card"));
  const cardLow = card ? railCost(card, payees)[0] : 0;
  const cardShare = payout > 0 ? (cardLow / payout) * 100 : 0;

  return (
    <section className="calc">
      <div className="calc-head">
        <div>
          <h2 className="calc-title">See what it would cost you</h2>
          <p className="small muted" style={{ marginTop: 5 }}>
            Your numbers, real prices. Nothing to connect.
          </p>
        </div>
        <div className="calc-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`calc-preset${payees === p.payees && each === p.each ? " is-on" : ""}`}
              onClick={() => {
                setPayees(p.payees);
                setEach(p.each);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="calc-body">
        <div className="calc-controls">
          <label className="calc-field" htmlFor="calc-payees">
            <span className="calc-label">
              People to pay
              <strong className="num">{count(payees)}</strong>
            </span>
            <input
              id="calc-payees"
              type="range"
              min={1}
              max={MAX_PAYEES}
              step={1}
              value={payees}
              onChange={(e) => setPayees(Number(e.target.value))}
            />
          </label>

          <label className="calc-field" htmlFor="calc-each">
            <span className="calc-label">
              Each one gets
              <strong className="num">{usd(each)}</strong>
            </span>
            <input
              id="calc-each"
              type="range"
              min={0.25}
              max={25}
              step={0.25}
              value={each}
              onChange={(e) => setEach(Number(e.target.value))}
            />
          </label>

          <p className="tiny faint">
            All of it fits in a single payment, with a note attached to each one. Priced at
            Arc&rsquo;s floor rate, so this is the most it would cost.
          </p>
        </div>

        <div className="calc-out">
          <div className="calc-headline">
            <span className="caps">They get</span>
            <span className="calc-big num">{usd(payout)}</span>
          </div>

          <div className="calc-rows">
            <div className="calc-row is-ours">
              <span>
                <strong>You pay in fees</strong>
                <span className="tiny" style={{ display: "block", opacity: 0.75 }}>
                  {pct(ourShare, ourShare < 0.1 ? 3 : 2)} of what you are sending
                </span>
              </span>
              <span className="num">{usd(fee)}</span>
            </div>
            {RAILS.map((r) => {
              const [lo, hi] = railCost(r, payees);
              return (
                <div className="calc-row" key={r.name}>
                  <span className="muted">{r.name}</span>
                  <span className="num muted">{usdRange(lo, hi)}</span>
                </div>
              );
            })}
          </div>

          <p className="tiny faint calc-source">
            Ours is worked out from what a run actually costs. Theirs are their own published
            prices as of {RAILS_CHECKED}, taking the cheapest end of each.{" "}
            <NavLink href="#/docs/costs">Where these come from</NavLink>.
          </p>

          {ourShare < cardShare ? (
            <div className="calc-win">
              <Icon name="seal" size={17} />
              <div>
                <strong>You keep {usd(cardLow - fee)} that cards would have taken.</strong>
                <span>
                  Card fees: {usd(cardLow)}. Here: {usd(fee)}.
                </span>
              </div>
            </div>
          ) : (
            <p className="small calc-verdict">
              At this size the gap is small, because each payment is big enough to absorb a flat
              fee. It opens up fast as the amounts get smaller.
            </p>
          )}

          <NavLink className="btn btn-primary btn-block" href="#/pay">
            Send this for real
            <Icon name="arrow-right" size={15} />
          </NavLink>
        </div>
      </div>
    </section>
  );
}
