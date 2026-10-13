import { isMainnet } from "../lib/chain";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";

/**
 * Test mode, said once and only where money would move.
 *
 * On mainnet none of this renders, which is the point: the normal state of a
 * payments app is real money, and labelling every page with the network it runs
 * on is chrome nobody reads. Testnet is the exception, so it gets one
 * unmissable panel on the page that spends, and nothing anywhere else.
 */

export function TestModeBanner() {
  if (isMainnet) return null;
  return (
    <aside className="testmode">
      <span className="testmode-glyph" aria-hidden="true">
        <Icon name="alert" size={16} />
      </span>
      <div className="testmode-body">
        <h2 className="testmode-title">Test mode: none of this is real money</h2>
        <p className="small">
          You are on Arc&rsquo;s test network, so the balances and the payments are practice. Send a
          run exactly as you would for real, and nothing can cost you anything.
        </p>
        <div className="row-wrap" style={{ marginTop: 11 }}>
          <a
            className="btn btn-sm"
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
          >
            Get free test dollars
            <Icon name="external" size={13} />
          </a>
          <NavLink className="btn btn-sm btn-quiet" href="#/docs/testnet">
            How to practise first
          </NavLink>
        </div>
      </div>
    </aside>
  );
}

/** The one-line reminder that sits under the pay button. */
export function MoneyMode() {
  return isMainnet ? (
    <>Real dollars. Once this is sent it cannot be called back.</>
  ) : (
    <>Practice dollars. Nothing here can cost you anything.</>
  );
}
