/**
 * EOA wallets only: a smart account cannot pay through Payfetti at all. Tiles
 * rather than fetched logos, so the page makes no third-party requests.
 */

export type SuggestedWallet = {
  name: string;
  url: string;
  blurb: string;
  /** Where it runs, so the reader can pick one they can actually install. */
  where: string;
  /** Tile colours, roughly the wallet's own. */
  tint: [string, string];
};

export const SUGGESTED_WALLETS: SuggestedWallet[] = [
  {
    name: "MetaMask",
    tint: ["#f6851b", "#e2761b"],
    url: "https://metamask.io/download/",
    blurb: "The most widely used. Fine if you have no other preference.",
    where: "Browser, iOS, Android",
  },
  {
    name: "Rabby",
    tint: ["#7084ff", "#5b6ef5"],
    url: "https://rabby.io/",
    blurb: "Built for people who use many chains, and clear about what it is signing.",
    where: "Browser, desktop",
  },
  {
    name: "Coinbase Wallet",
    tint: ["#3b6ef5", "#1b4ae0"],
    url: "https://www.coinbase.com/wallet/downloads",
    blurb: "Self-custody, separate from a Coinbase exchange account.",
    where: "Browser, iOS, Android",
  },
  {
    name: "Rainbow",
    tint: ["#ff7a59", "#c644fc"],
    url: "https://rainbow.me/",
    blurb: "The friendliest of these if it is your first wallet.",
    where: "Browser, iOS, Android",
  },
  {
    name: "Trust Wallet",
    tint: ["#3375bb", "#1f5a99"],
    url: "https://trustwallet.com/download",
    blurb: "Mobile first, widely used outside the US and Europe.",
    where: "iOS, Android, browser",
  },
  {
    name: "Zerion",
    tint: ["#2962ef", "#1b48c4"],
    url: "https://zerion.io/download",
    blurb: "Wallet and portfolio view in one.",
    where: "Browser, iOS, Android",
  },
];
