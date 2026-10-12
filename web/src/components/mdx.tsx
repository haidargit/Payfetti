import type { ComponentProps, ReactNode } from "react";

/**
 * How markdown renders inside the app. Keeping this map here is what lets the
 * docs stay plain `.mdx`: a writer never needs to know a class name, and a
 * restyle never means editing prose.
 */

function Table({ children }: { children?: ReactNode }) {
  // Wide tables are the norm in these docs, so each one scrolls in its own box
  // rather than pushing the page sideways.
  return (
    <div className="doc-table">
      <table>{children}</table>
    </div>
  );
}

function Anchor({ href, children, ...rest }: ComponentProps<"a">) {
  const external = href?.startsWith("http");
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest}>
      {children}
    </a>
  );
}

export const mdxComponents = {
  table: Table,
  a: Anchor,
};
