/**
 * Tour copy, kept out of the components it points at so a step can be reworded
 * without touching the UI. Targets are `data-tour` attributes rather than class
 * names, so restyling never silently breaks a step.
 *
 * `description` is rendered as HTML by driver.js, so it stays plain text with
 * at most inline tags.
 */

export type TourStep = {
  target?: string;
  title: string;
  body: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

export const TOUR_KEY = "payfetti.tour.v1";

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Pay a lot of people at once",
    body: "A run is one transaction that pays every row on your list and leaves each payee a receipt they can verify themselves. Sixty seconds and you will know where everything is. Or skip this and poke around on your own.",
  },
  {
    target: '[data-tour="wallet"]',
    title: "Start here: your wallet",
    body: "Connect the wallet holding the USDC. Payfetti never takes custody, so the money moves straight from here to your payees. On testnet this is play money from the Circle faucet.",
    side: "bottom",
    align: "end",
  },
  {
    target: '[data-tour="label"]',
    title: "This field names the run",
    body: "The label is written on-chain with the run and shown on every receipt. Name it something you will still recognise in a year, like <strong>March survey, batch 2</strong>.",
    side: "bottom",
    align: "start",
  },
  {
    target: '[data-tour="rows"]',
    title: "This box is the payee list",
    body: "One payee per line: <code>address, amount, note</code>. Paste straight from a spreadsheet. Every line is checked before anything is signed. Bad addresses, zero amounts, duplicates and sub-cent rounding are all caught here, because a transfer cannot be undone.",
    side: "right",
    align: "start",
  },
  {
    target: '[data-tour="notes"]',
    title: "That switch publishes the reasons",
    body: "On, each payee's note is written to Arc permanently, so a recipient can look their own payment up without a link from you. Off, the notes live only in the receipt links. It costs about $0.000186 a payee, and an on-chain note is public forever.",
    side: "top",
    align: "start",
  },
  {
    target: '[data-tour="quote"]',
    title: "That panel is the exact cost",
    body: "Not a band or an estimate: this is the fee at the quoted gas price, with what the same list would cost on card, ACH and wire underneath it. It updates as you type.",
    side: "left",
    align: "start",
  },
  {
    target: '[data-tour="pay"]',
    title: "One signature does all of it",
    body: "Every transfer plus the run record go into a single transaction. If one payee's transfer reverts, the rest still land, and resubmitting the same run cannot pay anyone twice.",
    side: "left",
    align: "end",
  },
  {
    target: '[data-tour="docs"]',
    title: "And the rest is written down",
    body: "What a receipt actually proves, every measured cost, and the limits we are honest about. It is all in the docs.",
    side: "bottom",
    align: "end",
  },
];
