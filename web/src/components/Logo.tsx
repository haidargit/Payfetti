/**
 * The brand mark.
 *
 * Served from `public/` rather than imported, so the same file backs the
 * favicon, the manifest and this. One asset, one thing to re-export.
 *
 * It sits on a light tile everywhere, including the header where the page is
 * already light. The mark's navy is a few shades off the footer's background
 * and would disappear there, and a mark that changes shape between the top and
 * bottom of a page reads as two different logos.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      <img
        src="/favicon-96x96.png"
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
    </span>
  );
}
