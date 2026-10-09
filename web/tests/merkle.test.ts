import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { buildTree, hashPair, leafOf, proofFor, verifyProof } from "../src/lib/merkle";

/**
 * Cross-implementation parity tests.
 *
 * docs/security.md flags this as a Medium risk: if the TypeScript tree disagrees
 * with the Solidity verifier, every receipt silently fails. These vectors are not
 * invented: they are values the deployed contract on Arc testnet has already
 * accepted, so passing here means TS agrees with Solidity on a real chain.
 *
 * Sources:
 *   probe tx   0xa0cead74…  (2-leaf run)
 *   50-payee   0x9ef59d48708e03aff07a5491ccc4f3996c752f1202abd37eba359850e7f28a79
 *   oracle     scripts/keccak.py (independent Python impl, same vectors)
 */

const NOTE_PROBE = "0x1f99bd845311ac79f63ed3e74c72090f4a9cbe65f9af3b961940e102d6e3dfb4" as Hex;
const FRESH = "0x7061796665747469000000000000000000000001" as Hex;
const PAYER = "0x8d026a62f466f7c457be8e3e139c701b791e668e" as Hex;

describe("keccak256 sanity (viem)", () => {
  it("matches canonical vectors", () => {
    expect(keccak256(toHex(""))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(keccak256(toHex("abc"))).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });

  it("derives the runId the chain stored", () => {
    // keccak256("payfetti-callfrom-test-1"), the runId in the live probe tx
    expect(keccak256(toHex("payfetti-callfrom-test-1"))).toBe(
      "0x6ee8fabf2f581b53cae72eccf0c435eabebd8bb3d7b050870044bbcc1827ce36",
    );
    expect(keccak256(toHex("callfrom probe"))).toBe(NOTE_PROBE);
  });
});

describe("leafOf matches the deployed contract", () => {
  it("reproduces both leaves from the live probe run", () => {
    expect(leafOf(FRESH, 1000n, NOTE_PROBE)).toBe(
      "0x12974bf41d5a1d8d3dfe07e283ca19a1d2377f9309093c3f34e3c43c85beee6c",
    );
    expect(leafOf(PAYER, 1000n, NOTE_PROBE)).toBe(
      "0x923a01cba2127e87eb1782bc4b55d2e20d581516e013b40fe2ec2a66301586b9",
    );
  });

  it("is case-insensitive about address checksumming", () => {
    const lower = leafOf(PAYER.toLowerCase() as Hex, 1000n, NOTE_PROBE);
    const upper = leafOf(("0x" + PAYER.slice(2).toUpperCase()) as Hex, 1000n, NOTE_PROBE);
    expect(lower).toBe(upper);
  });

  it("is amount-specific: one unit changes the leaf", () => {
    expect(leafOf(FRESH, 1000n, NOTE_PROBE)).not.toBe(leafOf(FRESH, 1001n, NOTE_PROBE));
  });
});

describe("root matches what is stored on-chain", () => {
  it("reproduces the probe run's root exactly", () => {
    const a = leafOf(FRESH, 1000n, NOTE_PROBE);
    const b = leafOf(PAYER, 1000n, NOTE_PROBE);
    // read back from Payfetti.getRun on Arc testnet
    expect(hashPair(a, b)).toBe(
      "0x7e15ccc666b170d4b8d892f954dc24a245e07ecc6fd9c14412d31bdcd66a6718",
    );
  });

  it("hashPair is commutative, as sorted-pair hashing requires", () => {
    const a = leafOf(FRESH, 1n, NOTE_PROBE);
    const b = leafOf(PAYER, 2n, NOTE_PROBE);
    expect(hashPair(a, b)).toBe(hashPair(b, a));
  });
});

describe("tree and proofs", () => {
  const mkLeaves = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      leafOf(`0x${(i + 1).toString(16).padStart(40, "0")}` as Hex, BigInt(1000 + i), NOTE_PROBE),
    );

  // Odd sizes are where promote-vs-duplicate bugs hide.
  for (const n of [1, 2, 3, 5, 8, 49, 50, 101]) {
    it(`every one of ${n} proofs verifies`, () => {
      const leaves = mkLeaves(n);
      const tree = buildTree(leaves);
      for (let i = 0; i < n; i++) {
        expect(verifyProof(leaves[i], proofFor(tree, i), tree.root)).toBe(true);
      }
    });
  }

  it("a single leaf is its own root, with an empty proof", () => {
    const tree = buildTree(mkLeaves(1));
    expect(tree.root).toBe(tree.leaves[0]);
    expect(proofFor(tree, 0)).toEqual([]);
  });

  it("rejects a proof belonging to a different leaf", () => {
    const leaves = mkLeaves(8);
    const tree = buildTree(leaves);
    expect(verifyProof(leaves[0], proofFor(tree, 1), tree.root)).toBe(false);
  });

  it("rejects a tampered amount", () => {
    const rows = mkLeaves(4);
    const tree = buildTree(rows);
    const forged = leafOf("0x0000000000000000000000000000000000000001" as Hex, 999_999n, NOTE_PROBE);
    expect(verifyProof(forged, proofFor(tree, 0), tree.root)).toBe(false);
  });

  it("refuses to build an empty tree", () => {
    expect(() => buildTree([])).toThrow();
  });
});

describe("the 50-payee run that is live on Arc testnet", () => {
  // Rebuilt with exactly the same inputs scripts/build-batch.py used.
  const NOTE_DEMO = keccak256(toHex("Payfetti demo run"));

  it("derives the same runId and noteHash the chain recorded", () => {
    expect(keccak256(toHex("payfetti-demo-50-v1"))).toBe(
      "0x9d13c6b61ad68155216d8383eac9107920b9a6a21275ba6de22c6af5d36f0581",
    );
    expect(NOTE_DEMO).toBe("0xd0f85f215763413e3d8d5d2421c084c7ebd4d254110b632bff432bf287e33ec5");
  });
});
