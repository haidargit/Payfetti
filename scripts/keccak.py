"""
Pure-Python Keccak-256, Ethereum's hash, dependency-free.

Why this file exists: no keccak library is installed, and `hashlib.sha3_256` is
*not* a substitute: SHA3-256 uses a different padding byte (0x06) than Keccak-256
(0x01), so it produces entirely different digests. Shelling out to `cast keccak`
works but costs ~50ms per call, and building a 50-leaf Merkle tree needs ~150 of
them.

Correctness is non-negotiable here: a subtly wrong hash would produce Merkle roots
that disagree with the Solidity verifier, and every receipt would silently fail.
Run this file directly to self-test against known vectors:

    python3 scripts/keccak.py
"""

_MASK = (1 << 64) - 1
_RATE = 136  # bytes; Keccak-256 has capacity 512, so rate = (1600 - 512) / 8

_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

# rho rotation offsets, indexed [x][y]
_ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]


def _rol(v, n):
    n %= 64
    return ((v << n) | (v >> (64 - n))) & _MASK


def _keccak_f(a):
    for rnd in range(24):
        # theta
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                a[x][y] ^= d[x]
        # rho + pi
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _ROT[x][y])
        # chi
        for x in range(5):
            for y in range(5):
                a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y] & _MASK) & b[(x + 2) % 5][y])
        # iota
        a[0][0] ^= _RC[rnd]
    return a


def keccak256(data: bytes) -> bytes:
    """Ethereum's keccak256. Returns 32 raw bytes."""
    if isinstance(data, str):
        raise TypeError("pass bytes, not str; encoding ambiguity is how hashes go wrong")

    # pad10*1 with Keccak's 0x01 domain byte (NOT SHA3's 0x06)
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % _RATE != 0:
        padded.append(0x00)
    padded[-1] |= 0x80

    state = [[0] * 5 for _ in range(5)]
    for off in range(0, len(padded), _RATE):
        block = padded[off:off + _RATE]
        for i in range(_RATE // 8):
            lane = int.from_bytes(block[i * 8:i * 8 + 8], "little")
            state[i % 5][i // 5] ^= lane
        state = _keccak_f(state)

    out = bytearray()
    for i in range(4):  # 32 bytes = 4 lanes
        out += state[i % 5][i // 5].to_bytes(8, "little")
    return bytes(out)


def keccak_hex(data: bytes) -> str:
    return "0x" + keccak256(data).hex()


# ───────────────────────── Ethereum ABI / Merkle helpers ─────────────────────────

def enc_address(a: str) -> bytes:
    return bytes(12) + bytes.fromhex(a.lower().replace("0x", "").rjust(40, "0"))


def enc_uint(n: int) -> bytes:
    return n.to_bytes(32, "big")


def enc_bytes32(h: str) -> bytes:
    return bytes.fromhex(h.replace("0x", "").rjust(64, "0"))


def leaf_of(payee: str, amount: int, note_hash: str) -> bytes:
    """Mirrors Payfetti.leafOf: keccak(keccak(abi.encode(payee, amount, noteHash))).

    Double-hashed, which is the standard second-preimage guard and matches
    OpenZeppelin / merkletreejs conventions.
    """
    inner = keccak256(enc_address(payee) + enc_uint(amount) + enc_bytes32(note_hash))
    return keccak256(inner)


def hash_pair(a: bytes, b: bytes) -> bytes:
    """Sorted-pair (commutative) hashing, mirroring Payfetti._processProof.

    For two bytes32 values abi.encode(a, b) is plain concatenation.
    """
    return keccak256(a + b) if a <= b else keccak256(b + a)


def build_tree(leaves):
    """Returns (root, levels). Odd nodes are promoted unchanged to the next level."""
    if not leaves:
        raise ValueError("no leaves")
    levels = [list(leaves)]
    while len(levels[-1]) > 1:
        cur = levels[-1]
        nxt = []
        for i in range(0, len(cur) - 1, 2):
            nxt.append(hash_pair(cur[i], cur[i + 1]))
        if len(cur) % 2:
            nxt.append(cur[-1])  # promote the odd one
        levels.append(nxt)
    return levels[-1][0], levels


def proof_for(levels, index):
    """Sibling path for the leaf at `index`. Empty when a node was promoted."""
    proof = []
    idx = index
    for level in levels[:-1]:
        sibling = idx ^ 1
        if sibling < len(level):
            proof.append(level[sibling])
            idx //= 2
        else:
            # promoted unchanged; its position in the next level is len//2
            idx = len(level) // 2
    return proof


def verify_proof(leaf, proof, root):
    """Independent re-implementation of the contract's check, for self-testing."""
    computed = leaf
    for p in proof:
        computed = hash_pair(computed, p)
    return computed == root


if __name__ == "__main__":
    import sys

    ok = True

    def check(label, got, want):
        global ok
        good = got == want
        ok = ok and good
        print(f"{'✅' if good else '❌'} {label}")
        if not good:
            print(f"    got  {got}\n    want {want}")

    # Canonical Keccak-256 vectors
    check("keccak256('')", keccak_hex(b""),
          "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    check("keccak256('abc')", keccak_hex(b"abc"),
          "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")
    check("keccak256('Transfer(address,address,uint256)')[:4] = 0xddf252ad",
          keccak_hex(b"Transfer(address,address,uint256)")[:10], "0xddf252ad")

    # Values `cast` produced for the live on-chain probe, the strongest check,
    # because these exact hashes were accepted by the deployed contract.
    check("runId  keccak256('payfetti-callfrom-test-1')",
          keccak_hex(b"payfetti-callfrom-test-1"),
          "0x6ee8fabf2f581b53cae72eccf0c435eabebd8bb3d7b050870044bbcc1827ce36")
    check("noteHash keccak256('callfrom probe')",
          keccak_hex(b"callfrom probe"),
          "0x1f99bd845311ac79f63ed3e74c72090f4a9cbe65f9af3b961940e102d6e3dfb4")

    NOTE = "0x1f99bd845311ac79f63ed3e74c72090f4a9cbe65f9af3b961940e102d6e3dfb4"
    check("leafOf(fresh payee) matches the live run",
          "0x" + leaf_of("0x7061796665747469000000000000000000000001", 1000, NOTE).hex(),
          "0x12974bf41d5a1d8d3dfe07e283ca19a1d2377f9309093c3f34e3c43c85beee6c")
    check("leafOf(payer) matches the live run",
          "0x" + leaf_of("0x8d026a62f466f7c457be8e3e139c701b791e668e", 1000, NOTE).hex(),
          "0x923a01cba2127e87eb1782bc4b55d2e20d581516e013b40fe2ec2a66301586b9")

    lf = leaf_of("0x7061796665747469000000000000000000000001", 1000, NOTE)
    ls = leaf_of("0x8d026a62f466f7c457be8e3e139c701b791e668e", 1000, NOTE)
    check("root matches the root stored on-chain",
          "0x" + hash_pair(lf, ls).hex(),
          "0x7e15ccc666b170d4b8d892f954dc24a245e07ecc6fd9c14412d31bdcd66a6718")

    # Tree/proof round-trip at odd and even sizes
    for n in (1, 2, 3, 5, 8, 49, 50, 101):
        leaves = [leaf_of("0x" + f"{i:040x}", 1000 + i, NOTE) for i in range(1, n + 1)]
        root, levels = build_tree(leaves)
        bad = [i for i in range(n) if not verify_proof(leaves[i], proof_for(levels, i), root)]
        check(f"all {n} proofs verify", bad, [])

    print("\n" + ("ALL CHECKS PASSED" if ok else "FAILURES PRESENT"))
    sys.exit(0 if ok else 1)
