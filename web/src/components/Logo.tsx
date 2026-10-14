
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
