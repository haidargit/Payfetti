/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_PAYFETTI_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
