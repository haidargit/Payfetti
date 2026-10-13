import { txUrl } from "../lib/chain";
import { shortHex } from "../lib/format";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";

/**
 * Two runs that actually executed on Arc testnet, with the transactions to
 * check them against. The figures come from `fixtures/` and the README, and the
 * receipt link below is a real payee from the second run: opening it runs the
 * same two-part verification any payee would get, live, against the chain.
 *
 * This is the one claim on the page that is not a model.
 */

const RUNS = [
  {
    what: "50 people, one payment",
    tx: "0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79",
    result: "49 paid, 1 bad address skipped",
    gas: "2,382,688 gas",
    cost: "$0.0477",
  },
  {
    what: "9 people, each with a note",
    tx: "0x152d39bebed27babe795bdf1132a90292029e0c3e3e78e0d10ec7e469c214bfe",
    result: "8 paid, 1 bad address skipped",
    gas: "579,845 gas",
    cost: "$0.0116",
  },
];

/** One payee from the 9-payee run, with the proof their receipt link carries. */
const SAMPLE_RECEIPT =
  "#/receipt?payer=0x8d026a62f466f7c457be8e3e139c701b791e668e" +
  "&runId=0xcc88edf54ee8b779a6fa70756f6b89eca3f152339cb50601079a2b0f0a09c29b" +
  "&payee=0x84332565237c0d1210642492712abdc1f4d198ba" +
  "&amount=1000" +
  "&memo=Payfetti+on-chain+notes+demo" +
  "&proof=0xae9621c6800eef219973357867c6e2164bac226cf1c4c5d8354f3add48b0a46b" +
  ",0x7ec5816fc138190b6c7fee6f6e093385ff535a92a800732bb746d5c3f91214a1" +
  ",0x9acc8de847db65e2019e58a63db11b85eb10589c0070f045e429f1a869e8d693" +
  ",0xe9f4bf04e101c79383618a0a7de5075afeadb3228910a6e2261640113ceaea13";

export function ProvenRuns() {
  return (
    <div className="proven">
      <p className="caps" style={{ marginBottom: 12 }}>
        We have already done this. Here are the receipts.
      </p>

      <div className="proven-rows">
        {RUNS.map((r) => (
          <a className="proven-row" key={r.tx} href={txUrl(r.tx)} target="_blank" rel="noreferrer">
            <span className="proven-what">
              <strong>{r.what}</strong>
              <span className="tiny faint">{r.result}</span>
            </span>
            <span className="proven-figs">
              <span className="tiny faint">{r.gas}</span>
              <span className="num proven-cost">{r.cost}</span>
            </span>
            <span className="proven-tx mono tiny">{shortHex(r.tx, 8, 6)}</span>
            <Icon name="external" size={13} />
          </a>
        ))}
      </div>

      <p className="small" style={{ marginTop: 14 }}>
        The skipped one in each run was a bad address we added on purpose, to show that one bad
        entry cannot take everyone else down with it.{" "}
        <NavLink href={SAMPLE_RECEIPT}>Open one of these receipts</NavLink> and watch it check
        itself while you look at it.
      </p>
    </div>
  );
}
