import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import App from "./App";
import { chain, RPC_URL } from "./lib/chain";
import "./styles.css";

const config = createConfig(
  getDefaultConfig({
    chains: [chain],
    transports: { [chain.id]: http(RPC_URL) },
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "",
    appName: "Payfetti",
    appDescription: "Pay hundreds of people tiny amounts in one transaction on Arc.",
  }),
);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
