import { useAccount, useBalance } from "wagmi";
import { chain, isMainnet } from "../lib/chain";
import { usdc } from "../lib/format";
import { NavLink } from "./NavLink";
import { WalletMenu } from "./WalletMenu";

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      {/* One in, many out: the shape of a run. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M2.5 8h3" />
        <path d="M5.5 8c2.2 0 2.6-4.2 5-4.2" />
        <path d="M5.5 8h5" />
        <path d="M5.5 8c2.2 0 2.6 4.2 5 4.2" />
        <circle cx="12.4" cy="3.8" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12.4" cy="8" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12.4" cy="12.2" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function Wordmark() {
  return (
    <NavLink className="brand" href="#/">
      <Mark />
      <span className="brand-name">Payfetti</span>
    </NavLink>
  );
}

/**
 * The balance is the 18-decimal native view divided down, never `balanceOf`,
 * which truncates (.agents/rules/arc-constraints.md).
 */
function Balance() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  if (!isConnected || !balance) return null;
  return (
    <span className="top-balance">
      <span className="num">{usdc(balance.value / 10n ** 12n)}</span>
      <span className="faint"> USDC</span>
    </span>
  );
}

export function TopBar({
  onStartTour,
  showPayCta,
  showNetwork,
}: {
  onStartTour?: () => void;
  showPayCta?: boolean;
  /** Only where it changes what a click means, and never on mainnet. */
  showNetwork?: boolean;
}) {
  return (
    <header className="topbar">
      <div className="band-in topbar-in">
        <div className="row" style={{ gap: 12 }}>
          <Wordmark />
          {showNetwork && !isMainnet && (
            <span className="net net-test">
              <span className="dot" />
              Test mode
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 6 }}>
          <NavLink className="btn btn-sm top-link" href="#/docs">
            <span data-tour="docs">Docs</span>
          </NavLink>
          {onStartTour && (
            <button type="button" className="btn btn-sm top-link" onClick={onStartTour}>
              Tour
            </button>
          )}
          <Balance />
          {showPayCta && (
            <NavLink className="btn btn-sm btn-primary" href="#/pay">
              Pay a list
            </NavLink>
          )}
          <WalletMenu />
        </div>
      </div>
      <span className="sr">Connected to {chain.name}</span>
    </header>
  );
}
