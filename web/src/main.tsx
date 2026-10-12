import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { arc, arcTestnet } from "viem/chains";
import { ARC_RPC, ARC_TESTNET_RPC, RPC_URL, chain, isMainnet } from "./lib/chain";
import "./styles.css";

/**
 * Payfetti can only be paid from by an externally owned account: Arc's
 * `CallFrom` precompile accepts nothing else. That turns connector choice into
 * a correctness question rather than a presentation one, so the list is ours
 * rather than a library's defaults.
 *
 *   - `multiInjectedProviderDiscovery` (on by default) finds every installed
 *     extension over EIP-6963 and hands us its real name and icon. That is
 *     where the long wallet list comes from, without us keeping a registry.
 *   - Coinbase is pinned to `eoaOnly`. Its Smart Wallet is a contract account
 *     and would connect here only to revert at send time.
 *   - WalletConnect appears only when a project id is configured, and brings
 *     its own QR sheet for mobile wallets.
 */

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

const config = createConfig({
  chains: [chain],
  // `chain` is one of two at the type level, so both need a transport even
  // though only the selected one is ever reachable. Never viem's bundled URLs,
  // which 403 with no CORS headers (.agents/rules/arc-constraints.md).
  transports: {
    [arc.id]: http(isMainnet ? RPC_URL : ARC_RPC),
    [arcTestnet.id]: http(isMainnet ? ARC_TESTNET_RPC : RPC_URL),
  },
  multiInjectedProviderDiscovery: true,
  connectors: [
    coinbaseWallet({
      appName: "Payfetti",
      preference: "eoaOnly",
    }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: "Payfetti",
              description: "Pay hundreds of people tiny amounts in one transaction on Arc.",
              url: window.location.origin,
              icons: [],
            },
          }),
        ]
      : []),
    // Last resort for a browser wallet that does not announce itself over
    // EIP-6963. Hidden by the picker whenever discovery found anything.
    injected({ shimDisconnect: true }),
  ],
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
