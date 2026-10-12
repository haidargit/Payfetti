/**
 * Marks for the connectors that ship no icon of their own.
 *
 * Wallets discovered over EIP-6963 hand us their real icon, so these cover only
 * the three built-ins: Coinbase, WalletConnect, and the unnamed browser
 * fallback. Drawn rather than fetched, to keep the page free of third-party
 * requests, and kept to each mark's basic geometry rather than attempting a
 * pixel-accurate copy of someone's logo.
 */

export function CoinbaseMark() {
  return (
    <svg className="wtile-art" viewBox="0 0 40 40" width={44} height={44} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#0052ff" />
      <rect x="14" y="14" width="12" height="12" rx="2.6" fill="#fff" />
    </svg>
  );
}

export function WalletConnectMark() {
  return (
    <svg className="wtile-art" viewBox="0 0 40 40" width={44} height={44} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#3b99fc" />
      <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
        <path d="M11.4 17.3a12 12 0 0 1 17.2 0" />
        <path d="M15.2 21.2a6.6 6.6 0 0 1 9.6 0" />
      </g>
      <circle cx="20" cy="25.6" r="1.9" fill="#fff" />
    </svg>
  );
}

export function BrowserWalletMark() {
  return (
    <svg className="wtile-art" viewBox="0 0 40 40" width={44} height={44} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#e2e3f0" />
      <g fill="none" stroke="#5a6170" strokeWidth="2.2" strokeLinecap="round">
        <rect x="10.5" y="13" width="19" height="14" rx="3.4" />
        <path d="M24 20h5.5" />
      </g>
    </svg>
  );
}
