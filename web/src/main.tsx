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
 * `CallFrom` accepts only an EOA, which makes connector choice a correctness
 * question. EIP-6963 discovery supplies the wallet list; Coinbase is pinned to
 * `eoaOnly` because its Smart Wallet would connect and then revert at send.
 */

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

const config = createConfig({
  chains: [chain],
  // Both chains need a transport at the type level. Never viem's bundled URLs,
  // which 403 with no CORS headers.
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
    // Fallback for a wallet that does not announce over EIP-6963.
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
