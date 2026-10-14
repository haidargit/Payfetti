import { isMainnet, txUrlOn } from "../lib/chain";
import { shortHex } from "../lib/format";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";

/**
 * Runs that executed, with figures from `fixtures/`. Every entry carries its own
 * network: built from the current one, a mainnet build would render dead links
 * for testnet hashes on the one section that exists to be checked.
 */

type Net = "mainnet" | "testnet";

const RUNS: { what: string; net: Net; tx: string; result: string; gas: string; cost: string }[] = [
  {
    what: "50 people, each with a note",
    net: "mainnet",
    tx: "0x3ba827ef46bfe64725af0bb1ed956f67989861b654d1cb507ce738d3bbde985f",
    result: "50 paid, 1 address not accepted",
    gas: "2,900,002 gas",
    cost: "$0.0580",
  },
  {
    what: "50 people, one payment",
    net: "testnet",
    tx: "0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79",
    result: "49 paid, 1 address not accepted",
    gas: "2,382,688 gas",
    cost: "$0.0477",
  },
  {
    what: "9 people, each with a note",
    net: "testnet",
    tx: "0x152d39bebed27babe795bdf1132a90292029e0c3e3e78e0d10ec7e469c214bfe",
    result: "8 paid, 1 address not accepted",
    gas: "579,845 gas",
    cost: "$0.0116",
  },
];

/** The network the sample receipt's run was recorded on. */
const SAMPLE_NET: Net = "mainnet";

/** One payee from the 9-payee run, with the proof their receipt link carries. */
const SAMPLE_RECEIPT =
  "#/receipt?payer=0x8d026a62f466f7c457be8e3e139c701b791e668e" +
  "&runId=0xd6fda1a55134f504d38927f0669b4e00ba48c45cc0d69a0d551e040e3d35fb12" +
  "&payee=0x481eaf4ff352ee5ea9815a78b91b86485030d92a" +
  "&amount=1" +
  "&memo=Payfetti+mainnet+demo" +
  "&proof=0x23c0715a710f9f161c454be7be56f91cdb8a3c1093dd0f47c4b966162e7b7c95" +
  ",0x5c1a8923c88f4dbabcafd950a21ea17fccc54fb3e1e8ce624ac9b28af31fcb97" +
  ",0x68e01160483ff3ef49fbb6d6596778166ef008ac3cd8d5b49a3930fd19665666" +
  ",0xdfb60e01b88cb2e3aee0c5a14e50a27f6ced925f9becbbab416170bdf10a20b5" +
  ",0x5f5a68e9eba157d54d692ac3ecc07b44c62edfedc55e43cd2b35b7616809328d" +
  ",0xca73cd1cfe9829eeacd9740dd86a473b450442d8c8358544af1138e79ba4ef83";

export function ProvenRuns() {
  // On mainnet, mainnet runs only: a practice run listed beside a real one
  // invites counting it as evidence.
  const runs = isMainnet ? RUNS.filter((r) => r.net === "mainnet") : RUNS;

  return (
    <div className="proven">
      <p className="caps" style={{ marginBottom: 12 }}>
        We have already done this.
      </p>

      <div className="proven-rows">
        {runs.map((r) => (
          <a
            className="proven-row"
            key={r.tx}
            href={txUrlOn(r.net, r.tx)}
            target="_blank"
            rel="noreferrer"
          >
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
        Every run above carries one address we knew would be refused, put there on purpose to show
        that a single bad entry cannot take the rest of the list down with it.{" "}
        {(SAMPLE_NET === "mainnet") === isMainnet ? (
          <>
            <NavLink href={SAMPLE_RECEIPT}>Open one of these receipts</NavLink> and watch it check
            itself while you look at it.
          </>
        ) : (
          <>
            These ran on Arc {SAMPLE_NET}, so their receipts verify against that chain rather than
            this one. The transactions above are public either way.
          </>
        )}
      </p>
    </div>
  );
}
