import { concat, encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * Must stay byte-identical to `leafOf` and `_processProof` in
 * `contracts/src/Payfetti.sol`. If the two disagree, every receipt silently
 * fails to verify: the proof returns false with nothing to debug.
 * `tests/merkle.test.ts` pins it against values the deployed contract accepted.
 */

export type Row = {
  payee: `0x${string}`;
  /** 6-decimal USDC base units. 1_000_000n === 1 USDC. */
  amount: bigint;
  note: string;
};

/** Mirrors `Payfetti.leafOf`. Double-hashed against second-preimage attacks. */
export function leafOf(payee: Hex, amount: bigint, noteHash: Hex): Hex {
  // viem's encodeAbiParameters validates EIP-55 checksums and throws on a
  // mixed-case address that fails them, while Solidity treats an address as 20
  // plain bytes. Users paste every casing, so normalise first.
  const normalised = payee.toLowerCase() as Hex;
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [normalised, amount, noteHash],
    ),
  );
  return keccak256(inner);
}

/** Sorted-pair, so proofs carry no flags. For two bytes32, `abi.encode` is concat. */
export function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(concat([a, b]))
    : keccak256(concat([b, a]));
}

export type Tree = {
  root: Hex;
  leaves: Hex[];
  levels: Hex[][];
};

/** Odd nodes promote unchanged. Duplicating the last leaf gives a different root. */
export function buildTree(leaves: Hex[]): Tree {
  if (leaves.length === 0) throw new Error("cannot build a tree with no leaves");

  const levels: Hex[][] = [[...leaves]];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) next.push(hashPair(cur[i], cur[i + 1]));
    if (cur.length % 2 === 1) next.push(cur[cur.length - 1]);
    levels.push(next);
  }
  return { root: levels[levels.length - 1][0], leaves, levels };
}

/** Sibling path for the leaf at `index`. Empty entries where a node was promoted. */
export function proofFor(tree: Tree, index: number): Hex[] {
  if (index < 0 || index >= tree.leaves.length) throw new Error(`leaf ${index} out of range`);

  const proof: Hex[] = [];
  let idx = index;
  for (let l = 0; l < tree.levels.length - 1; l++) {
    const level = tree.levels[l];
    const sibling = idx ^ 1;
    if (sibling < level.length) {
      proof.push(level[sibling]);
      idx = Math.floor(idx / 2);
    } else {
      // promoted unchanged; its position in the next level is floor(len / 2)
      idx = Math.floor(level.length / 2);
    }
  }
  return proof;
}

/** Self-test only. Never a substitute for the on-chain `verifyInclusion`. */
export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  let computed = leaf;
  for (const p of proof) computed = hashPair(computed, p);
  return computed.toLowerCase() === root.toLowerCase();
}

export function treeFromRows(rows: Row[], noteHash: Hex): Tree {
  return buildTree(rows.map((r) => leafOf(r.payee, r.amount, noteHash)));
}
