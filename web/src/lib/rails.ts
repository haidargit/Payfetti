/**
 * Published list prices, never benchmarks of ours, so the interface must not
 * present them as measured. Card counts only the fixed component and wire sits
 * below what banks publish, both erring against us. Provenance: `docs/gas.md`.
 */

export type Rail = {
  name: string;
  /** Fee per payment, in dollars. */
  lo: number;
  hi: number;
  hint?: string;
  /** Where the figure comes from, for the costs doc. */
  source: string;
};

/** Month the figures above were last checked against their sources. */
export const RAILS_CHECKED = "October 2026";

export const RAILS: Rail[] = [
  {
    name: "Card / PayPal",
    lo: 0.3,
    hi: 0.5,
    source: "Stripe's published 30c and PayPal's 49c fixed components",
  },
  {
    name: "ACH",
    lo: 0.25,
    hi: 0.25,
    hint: "plus one manual entry each",
    source: "typical flat bank origination fee, which varies by provider",
  },
  {
    name: "International wire",
    lo: 10,
    hi: 15,
    source: "well below the $25-50 US banks commonly publish",
  },
];

export function railCost(rail: Rail, payees: number): [number, number] {
  return [rail.lo * payees, rail.hi * payees];
}
