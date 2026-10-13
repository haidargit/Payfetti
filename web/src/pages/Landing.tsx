import { Band } from "../components/Band";
import { Icon } from "../components/Icon";
import { NavLink } from "../components/NavLink";
import { Calculator } from "../components/Calculator";

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
    title: "Bring your list",
    body: (
      <>
        Who gets paid, and how much, straight out of your spreadsheet. We check every line before
        anything leaves your wallet.
      </>
    ),
  },
  {
    n: "2",
    title: "Approve once",
    body: (
      <>
        One approval pays all of them. A bad entry cannot hold up the rest, and clicking send twice
        cannot pay anyone twice.
      </>
    ),
  },
  {
    n: "3",
    title: "Everyone gets proof",
    body: (
      <>
        Each person receives a link that proves they were paid. Nothing for them to sign up for,
        and nothing they have to take on trust.
      </>
    ),
  },
];

export function Landing() {
  return (
    <Band>
      <div className="landing">
        <p className="kicker">
          Powered by{" "}
          <a href="https://www.arc.io" target="_blank" rel="noreferrer">
            Arc
          </a>
          , Circle&rsquo;s stablecoin network
        </p>
        <h1>Pay everyone at once.</h1>
        <p className="hero-lede">
          Bring a list of who gets paid and how much. Everyone is paid in one go, and each person
          gets proof they can check for themselves. It costs about a tenth of a cent per person.
        </p>

        <div className="landing-cta">
          <NavLink className="btn btn-primary" href="#/pay">
            Pay my list
            <Icon name="arrow-right" size={15} />
          </NavLink>
          <NavLink className="btn" href="#/receipt">
            Check a receipt
          </NavLink>
          <NavLink className="btn btn-quiet" href="#/docs">
            How it works
          </NavLink>
        </div>

        <ul className="landing-trust">
          <li>
            <Icon name="check" size={13} />
            Nothing to sign up for
          </li>
          <li>
            <Icon name="check" size={13} />
            Your money never sits with us
          </li>
          <li>
            <Icon name="check" size={13} />
            Nothing to take our word for
          </li>
        </ul>

        <Calculator />

        <a
          className="by-line"
          href="https://github.com/haidargit"
          target="_blank"
          rel="noreferrer"
        >
          <span className="mark" style={{ width: 26, height: 26, borderRadius: 9 }}>
            <Icon name="github" size={15} />
          </span>
          Built by haidar ali
          <Icon name="external" size={12} />
        </a>

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
