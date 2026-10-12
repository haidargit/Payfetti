/**
 * Published per-payment floors on the rails Payfetti replaces, as tabled in the
 * README. These are the incumbents' own posted fees, not measurements of ours,
 * so the UI must label them as published and never as benchmarked.
 */

export type Rail = {
  name: string;
  /** Fee per payment, in dollars. */
  lo: number;
  hi: number;
  hint?: string;
};

export const RAILS: Rail[] = [
  { name: "Card / PayPal", lo: 0.3, hi: 0.5 },
  { name: "ACH", lo: 0.25, hi: 0.25, hint: "plus one manual entry each" },
  { name: "International wire", lo: 10, hi: 15 },
];

export function railCost(rail: Rail, payees: number): [number, number] {
  return [rail.lo * payees, rail.hi * payees];
}
