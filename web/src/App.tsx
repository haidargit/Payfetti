import { useEffect, useRef, useState } from "react";
import { Landing } from "./pages/Landing";
import { Create } from "./pages/Create";
import { Receipt } from "./pages/Receipt";
import { Docs } from "./pages/Docs";
import { isMainnet } from "./lib/chain";
import { TopBar } from "./components/TopBar";
import { CostRail } from "./components/CostRail";
import { ArcBand } from "./components/ArcBand";
import { Footer } from "./components/Footer";
import { Band } from "./components/Band";
import { Callout } from "./components/Callout";
import { useTour } from "./components/Tour";
import { scrollToTop } from "./lib/nav";

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
  const route = useHashRoute().split("?")[0];
  const [, section, slug] = route.split("/");

  const onReceipt = section === "receipt";
  const onDocs = section === "docs";
  const onCreate = section === "pay";
  const onLanding = !onReceipt && !onDocs && !onCreate;

  // The tour points at the composer, so it is only offered there.
  const startTour = useTour({ enabled: onCreate });

  // Changing route swaps the whole view, so arriving halfway down the new one
  // is disorienting. One place to do it, rather than per link.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scrollToTop();
  }, [route]);

  return (
    <>
      <TopBar onStartTour={onCreate ? startTour : undefined} showPayCta={!onCreate} />

      {/* The cost argument belongs where someone is deciding, not where they
          are working. A payee reading a receipt is not being sold a
          comparison either, and the docs are not a pitch. */}
      {(onLanding || onCreate) && (
        <div className="band is-dark">
          <CostRail />
        </div>
      )}

      {onDocs ? (
        <Docs slug={slug} />
      ) : onReceipt ? (
        <Receipt />
      ) : onLanding ? (
        <>
          <Landing />
          <ArcBand />
        </>
      ) : (
        <>
          <Band>
            {!isMainnet && (
              <div style={{ paddingTop: 18 }}>
                <Callout tone="warn" title="Arc testnet: these are play funds">
                  Everything here is real except the money. Top up at{" "}
                  <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                    faucet.circle.com
                  </a>
                  .
                </Callout>
              </div>
            )}
            <Create />
          </Band>
          <ArcBand />
        </>
      )}

      <Footer onStartTour={onCreate ? startTour : undefined} />
    </>
  );
}
