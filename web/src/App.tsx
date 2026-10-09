import { useEffect, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { Create } from "./pages/Create";
import { Receipt } from "./pages/Receipt";
import { chain, isMainnet } from "./lib/chain";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  const route = hash.split("?")[0];

  return (
    <div className="wrap">
      <header>
        <div>
          <a href="#/" className="brand">
            Payfetti
          </a>
          <span className={isMainnet ? "net net-main" : "net net-test"}>{chain.name}</span>
        </div>
        <ConnectKitButton />
      </header>

      {!isMainnet && (
        <p className="banner">
          Testnet: these are play funds. Get some from{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
            faucet.circle.com
          </a>
          .
        </p>
      )}

      {route === "#/receipt" ? <Receipt /> : <Create />}

      <footer>
        <p>
          Pay hundreds of people tiny amounts in one transaction. The contract never touches your
          USDC. Funds move wallet-to-wallet inside Arc's <code>Multicall3From</code>.
        </p>
      </footer>
    </div>
  );
}
