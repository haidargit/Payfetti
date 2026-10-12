import { BLOCK_GAS_LIMIT } from "../lib/chain";
import { count, pct } from "../lib/format";

/**
 * A run has to fit in one 30M-gas block, so the headroom is a hard constraint
 * rather than a statistic. Showing it as a bar makes "split this run" an
 * obvious conclusion instead of an error message at send time.
 */
export function BlockMeter({ gas }: { gas: bigint }) {
  const share = Number(gas) / Number(BLOCK_GAS_LIMIT);
  const over = share > 1;
  return (
    <div>
      <div className="spread tiny" style={{ marginBottom: 6 }}>
        <span className="muted">
          <span className="num">{count(gas)}</span> gas
        </span>
        <span className={over ? "" : "faint"} style={over ? { color: "var(--err)" } : undefined}>
          {pct(Math.min(share, 9.99) * 100)} of a block
        </span>
      </div>
      <div
        className="meter-bar"
        role="meter"
        aria-valuenow={Math.round(share * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="share of one Arc block"
      >
        <div
          className={`meter-fill${over ? " is-over" : ""}`}
          style={{ width: `${Math.min(share, 1) * 100}%` }}
        />
      </div>
    </div>
  );
}
