import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { addressUrl, chain } from "../lib/chain";
import { shortHex } from "../lib/format";
import { SUGGESTED_WALLETS } from "../lib/wallets";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { Copyable } from "./Copyable";
import { BrowserWalletMark, CoinbaseMark, WalletConnectMark } from "./WalletMarks";

/**
 * The wallet picker.
 *
 * The list is not a registry we maintain: wagmi discovers installed wallets
 * over EIP-6963 and hands back each one's real name and icon, so whatever a
 * reader has installed is what they see. Coinbase and WalletConnect are added
 * for people with no extension, and the suggestions below are for people with
 * no wallet at all.
 *
 * `injected` is the unnamed fallback for a browser wallet too old to announce
 * itself. Showing it beside wallets that did announce themselves would just be
 * a second, worse button for the same extension, so it appears only when
 * discovery found nothing.
 */

/**
 * A connector's own icon where it has one, and a drawn mark for the built-ins
 * that do not. Falling through to an initial would make a wallet picker look
 * like a wireframe, which is most of what the built-ins otherwise give us.
 */
function ConnectorArt({ c }: { c: Connector }) {
  if (c.icon) return <img className="wtile-art" src={c.icon} alt="" width={44} height={44} />;
  if (c.id === "coinbaseWalletSDK") return <CoinbaseMark />;
  if (c.id === "walletConnect") return <WalletConnectMark />;
  if (c.id === "injected") return <BrowserWalletMark />;
  return (
    <span className="wtile-art is-letter" aria-hidden="true">
      {c.name.slice(0, 1)}
    </span>
  );
}

function Tile({
  name,
  art,
  state,
  onClick,
  href,
}: {
  name: string;
  art: ReactNode;
  state?: "idle" | "pending";
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="wtile-frame">
        {art}
        {state === "pending" && (
          <span className="wtile-badge" aria-hidden="true">
            <Icon name="spinner" size={11} />
          </span>
        )}
        {href && (
          <span className="wtile-badge is-link" aria-hidden="true">
            <Icon name="external" size={10} />
          </span>
        )}
      </span>
      <span className="wtile-name">{name}</span>
    </>
  );

  if (href) {
    return (
      <a className="wtile" href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`wtile${state === "pending" ? " is-pending" : ""}`}
      onClick={onClick}
      disabled={state === "pending"}
    >
      {inner}
    </button>
  );
}

/**
 * Whether a legacy injected provider is actually present. The fallback
 * connector throws "Provider not found" when it is not, and offering a button
 * whose only outcome is that error is worse than saying so up front. The
 * common cause is a private window, where extensions are off unless allowed.
 */
function useHasInjected(when: boolean) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!when) return;
    setHas(typeof window !== "undefined" && "ethereum" in window);
  }, [when]);
  return has;
}

export function WalletMenu() {
  const { address, isConnected, chainId, connector } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { discovered, extras, fallback } = useMemo(() => {
    const seen = new Set<string>();
    const discovered: Connector[] = [];
    const extras: Connector[] = [];
    let fallback: Connector | undefined;

    for (const c of connectors) {
      if (c.id === "injected") {
        fallback = c;
      } else if (c.id === "coinbaseWalletSDK" || c.id === "walletConnect") {
        extras.push(c);
      } else if (!seen.has(c.name.toLowerCase())) {
        // Everything else came from EIP-6963 discovery, so it is installed.
        seen.add(c.name.toLowerCase());
        discovered.push(c);
      }
    }
    return { discovered, extras, fallback };
  }, [connectors]);

  const hasInjected = useHasInjected(open);
  const onDevice = discovered.length > 0 ? discovered : hasInjected && fallback ? [fallback] : [];
  const nothingFound = onDevice.length === 0;
  const wrongChain = isConnected && chainId !== undefined && chainId !== chain.id;

  function pick(c: Connector) {
    reset();
    connect({ connector: c, chainId: chain.id }, { onSuccess: () => setOpen(false) });
  }

  const stateOf = (c: Connector) =>
    isPending && variables?.connector === c ? ("pending" as const) : ("idle" as const);

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm${wrongChain ? " btn-warn" : ""}`}
        onClick={() => setOpen(true)}
        data-tour="wallet"
      >
        <Icon name="wallet" size={14} />
        {isConnected && address ? (
          wrongChain ? (
            "Wrong network"
          ) : (
            <span className="mono" style={{ fontSize: 12 }}>
              {shortHex(address)}
            </span>
          )
        ) : (
          "Connect wallet"
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isConnected ? "Your wallet" : "Connect a wallet"}
        subtitle={
          isConnected
            ? undefined
            : "Payfetti never takes custody. USDC moves straight from your wallet to your payees."
        }
      >
        {isConnected && address ? (
          <div className="stack">
            {wrongChain && (
              <div className="note note-warn">
                <span className="note-glyph">
                  <Icon name="alert" size={15} />
                </span>
                <div className="note-body">
                  <div className="note-title">This wallet is on another network</div>
                  <p style={{ marginTop: 4 }}>Payfetti runs on {chain.name}.</p>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: 10 }}
                    onClick={() => switchChain({ chainId: chain.id })}
                  >
                    Switch to {chain.name}
                  </button>
                </div>
              </div>
            )}

            <div className="panel">
              <div className="kv">
                <span className="kv-k">Account</span>
                <Copyable value={address} short label="your address" />
              </div>
              <div className="kv">
                <span className="kv-k">Wallet</span>
                <span className="kv-v">{connector?.name ?? "Connected"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Network</span>
                <span className="kv-v">{wrongChain ? "Unsupported" : chain.name}</span>
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <a className="btn btn-sm" href={addressUrl(address)} target="_blank" rel="noreferrer">
                View on explorer
                <Icon name="external" size={13} />
              </a>
              <button
                className="btn btn-sm"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="note note-err" style={{ marginBottom: 14 }}>
                <span className="note-glyph">
                  <Icon name="alert" size={15} />
                </span>
                <div className="note-body">
                  {/provider not found/i.test(error.message)
                    ? "No wallet responded. In a private window, extensions are off unless you allow each one, so this is usually that."
                    : /reject|denied|cancel/i.test(error.message) && error.message.length < 160
                      ? "That request was dismissed in the wallet. Nothing happened."
                      : error.message}
                </div>
              </div>
            )}

            {nothingFound && !showAll && (
              <div className="note note-info" style={{ marginBottom: 14 }}>
                <span className="note-glyph">
                  <Icon name="info" size={15} />
                </span>
                <div className="note-body">
                  <div className="note-title">No wallet extension found in this browser</div>
                  <p style={{ marginTop: 4 }}>
                    If you have one installed, this is usually a private window: extensions stay
                    off there unless you allow each one explicitly. You can still connect a phone
                    below, or install a wallet.
                  </p>
                </div>
              </div>
            )}

            <div className="wallet-scroll">
              {onDevice.length > 0 && (
                <>
                  <p className="wallet-group">On this device</p>
                  <div className="wallet-grid">
                    {onDevice.map((c) => (
                      <Tile
                        key={c.uid}
                        name={c === fallback ? "Browser wallet" : c.name}
                        art={<ConnectorArt c={c} />}
                        state={stateOf(c)}
                        onClick={() => pick(c)}
                      />
                    ))}
                  </div>
                </>
              )}

              {extras.length > 0 && (
                <>
                  <p className="wallet-group">Other ways in</p>
                  <div className="wallet-grid">
                    {extras.map((c) => (
                      <Tile
                        key={c.uid}
                        name={c.name}
                        art={<ConnectorArt c={c} />}
                        state={stateOf(c)}
                        onClick={() => pick(c)}
                      />
                    ))}
                  </div>
                </>
              )}

              {showAll && (
                <>
                  <p className="wallet-group">Install one of these</p>
                  <div className="wallet-grid">
                    {SUGGESTED_WALLETS.map((w) => (
                      <Tile
                        key={w.name}
                        name={w.name}
                        href={w.url}
                        art={
                          <span
                            className="wtile-art is-brand"
                            aria-hidden="true"
                            style={{
                              background: `linear-gradient(150deg, ${w.tint[0]}, ${w.tint[1]})`,
                            }}
                          >
                            {w.name.slice(0, 1)}
                          </span>
                        }
                      />
                    ))}
                  </div>
                  <p className="tiny faint" style={{ padding: "10px 2px 2px" }}>
                    Install one, then come back and connect. Payfetti needs a regular wallet
                    account, so a smart account such as a Safe cannot pay here.
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              className="wallet-none-toggle"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
            >
              <span>{showAll ? "Back to my wallets" : "I do not have a wallet yet"}</span>
              <span className={`wallet-chev${showAll ? " is-open" : ""}`}>
                <Icon name="arrow-right" size={14} />
              </span>
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
