import { describe, expect, it } from "vitest";

/**
 * A copied `.env.example` leaves every var present but blank, and `??` does not
 * treat `""` as missing. That silently emptied the registry address once, which
 * breaks receipt verification and points `recordRun` at nothing, so the shape of
 * the guard is pinned here.
 */

function env(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

const FALLBACK = "0x7dacb26f14af8e844dabbb2dba1d31427204f835";

describe("env fallbacks", () => {
  it("treats a blank var as unset, which `??` alone does not", () => {
    // Typed as the env object hands it over, so the compiler cannot fold it away.
    const blank: string | undefined = "";
    expect(blank ?? FALLBACK).toBe(""); // the bug
    expect(env(blank) ?? FALLBACK).toBe(FALLBACK); // the fix
  });

  it("treats whitespace as unset too", () => {
    expect(env("   ") ?? FALLBACK).toBe(FALLBACK);
  });

  it("keeps a real value, trimmed of a stray newline", () => {
    expect(env(" 0xabc \n") ?? FALLBACK).toBe("0xabc");
  });

  it("falls back when the var is absent", () => {
    expect(env(undefined) ?? FALLBACK).toBe(FALLBACK);
  });

  it("leaves a numeric var usable, where a blank would parse as 0", () => {
    const blank: string | undefined = "";
    expect(Number(blank ?? 5042002)).toBe(0); // the bug: silently selects the wrong chain
    expect(Number(env(blank) ?? 5042002)).toBe(5042002);
    expect(Number(env("5042") ?? 5042002)).toBe(5042);
  });
});
