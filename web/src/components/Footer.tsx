import { EXPLORER, MULTICALL3FROM, PAYFETTI_ADDRESS, addressUrl, chain } from "../lib/chain";
import { Copyable } from "./Copyable";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { NavLink } from "./NavLink";

const REPO = "https://github.com/haidargit/Payfetti";

export function Footer({ onStartTour }: { onStartTour?: () => void }) {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div className="foot-top">
          <div>
            <span className="brand">
              <Logo />
              <span className="brand-name" style={{ color: "var(--d-ink)" }}>
                Payfetti
              </span>
            </span>
            <p className="foot-say">Pay everyone you meant to pay.</p>
          </div>

          <div className="foot-cols">
            <h4>Product</h4>
            <div className="foot-links">
              <NavLink href="#/pay">Create a run</NavLink>
              <NavLink href="#/receipt">Check a receipt</NavLink>
              <NavLink href="#/docs">Documentation</NavLink>
              {onStartTour && (
                <button type="button" onClick={onStartTour}>
                  Take the tour
                </button>
              )}
            </div>
          </div>

          <div className="foot-cols">
            <h4>On chain</h4>
            <div className="foot-links">
              <a href={addressUrl(PAYFETTI_ADDRESS)} target="_blank" rel="noreferrer">
                Verified source
              </a>
              <a href={addressUrl(MULTICALL3FROM)} target="_blank" rel="noreferrer">
                The batching contract
              </a>
              <a href={EXPLORER} target="_blank" rel="noreferrer">
                Arc explorer
              </a>
              <a href="https://docs.arc.io" target="_blank" rel="noreferrer">
                Arc docs
              </a>
            </div>
          </div>

          <div className="foot-cols">
            <h4>How it works</h4>
            <div className="foot-links">
              <NavLink href="#/docs/costs">Every cost, measured</NavLink>
              <NavLink href="#/docs/receipts">What a receipt proves</NavLink>
              <NavLink href="#/docs/limits">Honest limits</NavLink>
              <a className="inline-link" href={REPO} target="_blank" rel="noreferrer">
                Source on GitHub
                <Icon name="external" size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="foot-bar">
          <span>
            Registry <Copyable value={PAYFETTI_ADDRESS} short label="contract address" /> on{" "}
            {chain.name}
          </span>
          <span>
            &copy; {new Date().getFullYear()} Payfetti. Open source under the MIT licence, built
            for Arc Microgrants.
          </span>
        </div>

        <div className="foot-mark" aria-hidden="true">
          <span>payfetti</span>
        </div>
      </div>
    </footer>
  );
}
