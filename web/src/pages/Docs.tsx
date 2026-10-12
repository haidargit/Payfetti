import { useEffect, useMemo, useRef, useState } from "react";
import { MDXProvider } from "@mdx-js/react";
import { DOCS, DOC_GROUPS, findDoc } from "../content/docs";
import { Band } from "../components/Band";
import { Icon } from "../components/Icon";
import { mdxComponents } from "../components/mdx";

/**
 * A docs page whose content it does not own. Pages are `.mdx` files under
 * `src/content/docs`, each exporting its own `meta`, and the sidebar is built
 * from whatever is in that directory.
 *
 * The "on this page" list is read from the rendered headings rather than
 * re-parsing the source, so it cannot drift from what is actually on screen.
 * `rehypeSlug` has already given every heading its id.
 */

type Head = { id: string; text: string; level: number };

export function Docs({ slug }: { slug?: string }) {
  const doc = findDoc(slug);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [heads, setHeads] = useState<Head[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const found = Array.from(root.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]")).map(
      (h) => ({ id: h.id, text: h.textContent ?? "", level: h.tagName === "H2" ? 2 : 3 }),
    );
    setHeads(found);
    setActive(found[0]?.id ?? "");

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // A band across the upper third, so the highlighted heading is the one
      // being read rather than the one at the very top of the viewport.
      { rootMargin: "-80px 0px -66% 0px" },
    );
    root.querySelectorAll("h2[id], h3[id]").forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [doc]);

  const { prev, next } = useMemo(() => {
    const i = DOCS.findIndex((d) => d.slug === doc?.slug);
    return { prev: i > 0 ? DOCS[i - 1] : undefined, next: i >= 0 ? DOCS[i + 1] : undefined };
  }, [doc]);

  if (!doc) {
    return (
      <Band>
        <div style={{ padding: "80px 0 120px" }}>
          <h1>No such page</h1>
          <p className="hero-lede">
            That documentation page does not exist. <a href="#/docs">Start from the beginning</a>.
          </p>
        </div>
      </Band>
    );
  }

  const Content = doc.Content;

  return (
    <Band>
      <div className="docs">
        <aside className="docs-nav" aria-label="Documentation">
          <div className="docs-nav-in">
            {DOC_GROUPS.map((g) => (
              <div key={g.group} className="docs-group">
                <h4>{g.group}</h4>
                {g.docs.map((d) => (
                  <a
                    key={d.slug}
                    href={`#/docs/${d.slug}`}
                    className={d.slug === doc.slug ? "is-current" : undefined}
                  >
                    {d.title}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <article className="docs-main">
          <p className="caps">{doc.group}</p>
          <div className="doc-prose" ref={bodyRef}>
            <MDXProvider components={mdxComponents}>
              <Content />
            </MDXProvider>
          </div>

          <nav className="docs-pager">
            {prev ? (
              <a href={`#/docs/${prev.slug}`}>
                <span className="tiny faint">Previous</span>
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                    <Icon name="arrow-right" size={14} />
                  </span>
                  {prev.title}
                </span>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a href={`#/docs/${next.slug}`} className="is-next">
                <span className="tiny faint">Next</span>
                <span className="row" style={{ gap: 6 }}>
                  {next.title}
                  <Icon name="arrow-right" size={14} />
                </span>
              </a>
            )}
          </nav>
        </article>

        <aside className="docs-toc" aria-label="On this page">
          {heads.length > 1 && (
            <div className="docs-toc-in">
              <h4>On this page</h4>
              {heads.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={`${h.level === 3 ? "is-sub" : ""}${h.id === active ? " is-current" : ""}`}
                  onClick={(e) => {
                    // The app routes on the hash, so a bare fragment would be
                    // read as a route change. Scroll it ourselves instead.
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                    setActive(h.id);
                  }}
                >
                  {h.text}
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Band>
  );
}
