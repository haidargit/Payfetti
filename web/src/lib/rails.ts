/**
 * What the rails Payfetti replaces charge per payment.
 *
 * These are published list prices, not measurements of ours and not quotes
 * anybody gave us, so the interface must never present them as benchmarked.
 * Provenance for each line, with the caveats, lives in the costs doc; keep the
 * two in step when these change.
 *
 * Two of them are deliberately generous to the incumbent:
 *
 *   Card only counts the fixed component. Real card pricing is a percentage
 *   plus that fixed fee, so the true cost is higher than what we show.
 *
 *   Wire uses $10-15 when US banks commonly publish $25-50 for an outgoing
 *   international transfer.
 *
 * Erring against ourselves is the point. The argument is the per-payment floor,
 * and it does not need help.
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
