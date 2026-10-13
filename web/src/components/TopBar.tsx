import { useAccount, useBalance } from "wagmi";
import { chain, isMainnet } from "../lib/chain";
import { usdc } from "../lib/format";
import { NavLink } from "./NavLink";
import { Logo } from "./Logo";
import { WalletMenu } from "./WalletMenu";

function Wordmark() {
  return (
    <NavLink className="brand" href="#/">
      <Logo />
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
              <span className="top-wide">Test mode</span>
              <span className="top-narrow">Test</span>
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 6 }}>
          <NavLink className="btn btn-sm top-link" href="#/docs">
            <span data-tour="docs">Docs</span>
          </NavLink>
          {onStartTour && (
            <button type="button" className="btn btn-sm top-link top-wide" onClick={onStartTour}>
              Tour
            </button>
          )}
          <Balance />
          {showPayCta && (
            <NavLink className="btn btn-sm btn-primary top-wide" href="#/pay">
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
