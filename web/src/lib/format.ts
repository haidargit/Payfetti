import { formatUsdc } from "./parse";

/** Display helpers. Nothing here rounds a value that money depends on. */

/**
 * USDC for a column: grouped, and never fewer than two decimal places, so
 * amounts line up as money rather than as "1.5". Sub-cent amounts keep every
 * place they have, since a payout of 0.0005 is a real row here.
 *
 * `formatUsdc` stays the canonical form and is what the run file exports.
 */
export function usdc(units: bigint): string {
  const exact = formatUsdc(units);
  const [whole, frac = ""] = exact.split(".");
  const neg = whole.startsWith("-");
  const digits = neg ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${frac.padEnd(2, "0")}`;
}

/** `0x7061666665…0001`: long enough that two payees cannot be confused. */
export function shortHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, 2 + head)}…${value.slice(-tail)}`;
}

/**
 * Fees on Arc land four to six decimal places down, so a fixed 2dp would print
 * every one of them as "$0.00" and lose the entire argument for the product.
 */
export function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1) {
    const dp = abs >= 1000 ? 0 : 2;
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  }
  // Below a dollar, keep every place that carries information and no more:
  // $0.30 should not print as $0.3000 just because $0.00093 needs six places.
  const trimmed = n.toFixed(6).replace(/0+$/, "");
  const [whole, frac = ""] = trimmed.split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

export function usdRange(lo: number, hi: number): string {
  return lo === hi ? usd(lo) : `${usd(lo)}–${usd(hi)}`;
}

export function pct(n: number, dp = 1): string {
  return `${n.toFixed(dp)}%`;
}

export function count(n: number | bigint): string {
  return Number(n).toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** Gwei, for a gas price that is always a round number of them on Arc. */
export function gwei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2);
}
