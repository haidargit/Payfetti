import type { ComponentType } from "react";

/**
 * The docs index builds itself from the files beside it. A page is one `.mdx`
 * file exporting its own `meta`, so adding, reordering or renaming a page never
 * means editing a component, which is the whole point of keeping prose out of
 * TypeScript.
 */

export type DocMeta = {
  title: string;
  /** Sidebar section. Sections appear in `GROUP_ORDER`. */
  group: string;
  /** Sort order within the group. */
  order: number;
  summary: string;
};

export type Doc = DocMeta & {
  slug: string;
  Content: ComponentType<{ components?: Record<string, unknown> }>;
};

export const GROUP_ORDER = ["Start here", "How it works", "Reference"];

type Module = { meta: DocMeta; default: Doc["Content"] };

const modules = import.meta.glob<Module>("./*.mdx", { eager: true });

export const DOCS: Doc[] = Object.entries(modules)
  .map(([path, mod]) => ({
    slug: path.replace(/^\.\//, "").replace(/\.mdx$/, ""),
    Content: mod.default,
    ...mod.meta,
  }))
  .sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return g !== 0 ? g : a.order - b.order;
  });

export const DOC_GROUPS = GROUP_ORDER.map((group) => ({
  group,
  docs: DOCS.filter((d) => d.group === group),
})).filter((g) => g.docs.length > 0);

export function findDoc(slug: string | undefined): Doc | undefined {
  return slug ? DOCS.find((d) => d.slug === slug) : DOCS[0];
}
