import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

/**
 * Documentation is MDX, so prose lives in `src/content/docs/*.mdx` and never
 * inside a component. `rehypeSlug` gives every heading an id, which is what the
 * docs page reads back to build its "on this page" list.
 *
 * The MDX plugin must run before React's, since it hands JSX downstream.
 */
export default defineConfig({
  // `.env.example` lives at the repo root, so read `.env` from there too.
  // Vite would otherwise look only in `web/`, and an id pasted next to the
  // example file would be silently ignored.
  envDir: "..",
  plugins: [{ enforce: "pre", ...mdx({
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug],
      }) }, react()],
  test: { globals: true, environment: "node", include: ["tests/**/*.test.ts"] },
});
