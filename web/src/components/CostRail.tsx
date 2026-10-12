import { RAILS } from "../lib/rails";
import { usd, usdRange } from "../lib/format";

/**
 * A ticker, but of the only numbers that matter here: what one payment costs on
 * each rail. Every Arc figure is measured (docs/gas.md) and every incumbent
 * figure is that rail's published floor, which is why they are visually
 * separated rather than presented as one benchmark.
 *
 * The track is duplicated because a CSS marquee has to translate by exactly
 * -50% to loop without a seam. The copy is aria-hidden so the row is announced
 * once.
 */

type Item = { sym: string; val: string; note?: string; arc?: boolean };

const ITEMS: Item[] = [
  { sym: "Arc · per payee", val: "$0.00093", arc: true },
  { sym: "200 payees", val: "$0.189", note: "9,425,620 gas", arc: true },
  { sym: "On-chain note", val: "$0.000186", note: "each", arc: true },
  { sym: "Finality", val: "sub-second", arc: true },
  ...RAILS.map((r) => ({ sym: r.name, val: usdRange(r.lo, r.hi), note: "each" })),
  { sym: "50-payee run", val: usd(0.0477), note: "executed on testnet", arc: true },
  { sym: "Block", val: "30M gas", note: "≈642 payees" },
];

function Set({ hidden }: { hidden?: boolean }) {
  return (
    <div className="rail-set" aria-hidden={hidden || undefined}>
      {ITEMS.map((it, i) => (
        <span className={`rail-item${it.arc ? " is-arc" : ""}`} key={`${it.sym}-${i}`}>
          <span className="rail-sym">{it.sym}</span>
          <span className="rail-val">{it.val}</span>
          {it.note && <span className="rail-note">{it.note}</span>}
        </span>
      ))}
    </div>
  );
}

export function CostRail() {
  return (
    <div className="rail">
      <div className="band-in rail-in">
        <div className="rail-mask">
          <div className="rail-track">
            <Set />
            <Set hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
