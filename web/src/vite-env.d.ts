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

declare module "*.mdx" {
  import type { ComponentType } from "react";
  import type { DocMeta } from "./content/docs";

  export const meta: DocMeta;
  const MDXComponent: ComponentType<{ components?: Record<string, unknown> }>;
  export default MDXComponent;
}
