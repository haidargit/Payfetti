import { Band } from "../components/Band";
import { Icon } from "../components/Icon";
import { NavLink } from "../components/NavLink";

/**
 * The landing page, kept to roughly one screen.
 *
 * It exists because the composer opens on a filled-in payee list and a live
 * quote, which explains nothing to someone who has just arrived. The numbers
 * are not repeated here: the dark band below carries those, and saying
 * $0.00093 twice on one page makes it read like a slogan rather than a
 * measurement.
 */

const STEPS = [
  {
    n: "1",
    title: "Paste the list",
    body: (
      <>
        One payee per line: <code>address, amount, note</code>, straight out of a spreadsheet.
        Every row is checked before anything is signed.
      </>
    ),
  },
  {
    n: "2",
    title: "Sign once",
    body: (
      <>
        A single transaction pays every row. One bad address cannot stop the others, and sending
        the same run twice cannot pay anyone twice.
      </>
    ),
  },
  {
    n: "3",
    title: "Hand out receipts",
    body: (
      <>
        Each payee gets a link that checks itself against the chain. No account for them, and no
        trust in us.
      </>
    ),
  },
];

export function Landing() {
  return (
    <Band>
      <div className="landing">
        <p className="kicker">Built on Arc, where USDC is the gas token</p>
        <h1>Pay everyone at once.</h1>
        <p className="hero-lede">
          Paste a list of addresses and amounts. One transaction pays every row and leaves each
          person a receipt they can verify themselves, for about a tenth of a cent each.
        </p>

        <div className="landing-cta">
          <NavLink className="btn btn-primary" href="#/pay">
            Pay a list
            <Icon name="arrow-right" size={15} />
          </NavLink>
          <NavLink className="btn" href="#/receipt">
            Check a receipt
          </NavLink>
          <NavLink className="btn btn-quiet" href="#/docs">
            How it works
          </NavLink>
        </div>

        <p className="tiny faint landing-trust">
          No account, no custody, no backend. The contract never touches your USDC.
        </p>

        <div className="landing-steps">
          {STEPS.map((s) => (
            <div className="landing-step" key={s.n}>
              <span className="landing-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p className="small muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Band>
  );
}
