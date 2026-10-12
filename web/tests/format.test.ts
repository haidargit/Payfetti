import { describe, expect, it } from "vitest";
import { count, gwei, shortHex, usd, usdRange } from "../src/lib/format";

describe("usd", () => {
  it("keeps enough places that an Arc fee is not rounded to zero", () => {
    // The whole argument for the product lives four to six places down.
    expect(usd(0.00093)).toBe("$0.00093");
    expect(usd(0.0477)).toBe("$0.0477");
    expect(usd(0.189)).toBe("$0.189");
  });

  it("does not pad a round sub-dollar figure out to six places", () => {
    expect(usd(0.3)).toBe("$0.30");
    expect(usd(0.25)).toBe("$0.25");
  });

  it("drops to money precision once a figure is dollars", () => {
    expect(usd(2.5)).toBe("$2.50");
    expect(usd(2000)).toBe("$2,000");
  });

  it("prints a true zero plainly", () => {
    expect(usd(0)).toBe("$0");
  });
});

describe("usdRange", () => {
  it("collapses when both ends match", () => {
    expect(usdRange(50, 50)).toBe("$50.00");
    expect(usdRange(60, 100)).toBe("$60.00–$100.00");
  });
});

describe("shortHex", () => {
  it("keeps enough of an address that two payees cannot be confused", () => {
    const a = "0x7061796665747469000000000000000000000001";
    const b = "0x7061796665747469000000000000000000000002";
    expect(shortHex(a)).not.toBe(shortHex(b));
    expect(shortHex(a)).toBe("0x706179…0001");
  });

  it("leaves a value shorter than the window alone", () => {
    expect(shortHex("0xdeadbeef")).toBe("0xdeadbeef");
  });
});

describe("count and gwei", () => {
  it("groups gas figures and reads a price in Gwei", () => {
    expect(count(9_425_620n)).toBe("9,425,620");
    expect(gwei(20_000_000_000n)).toBe("20.00");
  });
});
