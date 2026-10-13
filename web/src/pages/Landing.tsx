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
        Who gets paid, and how much, straight out of your spreadsheet. Every line is checked
        before anything leaves your wallet.
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
    title: "Hand out the proof",
    body: (
      <>
        Every payment comes with a link that proves itself against the network. Send one to each
        person, and there is nothing for them to join and nothing to take on faith.
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
          </a>{", "}
          Circle&rsquo;s stablecoin network
        </p>
        <h1>Pay everyone at once.</h1>
        <p className="pf-lede">
          Bring a list of who gets paid and how much. Everyone is paid in one go, and each of them
          receives proof of their own payment. About a tenth of a cent per person.
        </p>

        <div className="landing-cta">
          <NavLink className="btn btn-primary" href="#/pay">
            Pay my list
            <Icon name="arrow-right" size={15} />
          </NavLink>
          <NavLink className="btn" href="#/receipt">
            Check a receipt
          </NavLink>
          <NavLink className="btn btn-quiet" href="#/docs/how-a-run-works">
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
            Every payment is publicly checkable
          </li>
        </ul>

        <Calculator />

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
