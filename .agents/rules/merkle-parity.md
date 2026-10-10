# Merkle parity

The same tree is implemented three times:

| Where | Functions |
|---|---|
| `contracts/src/Payfetti.sol` | `leafOf`, `_processProof` |
| `web/src/lib/merkle.ts` | `leafOf`, `hashPair`, `buildTree` |
| `scripts/keccak.py` | `leaf_of`, `hash_pair`, `build_tree` |

They must produce identical roots. If they drift, every receipt returns `false` with
no error to debug, which is the worst failure mode in the project.

The rules that have to match:

- Leaves are **double-hashed**: `keccak(keccak(abi.encode(payee, amount, noteHash)))`.
- Pairs are hashed **sorted**, so proofs carry no left/right flags.
- Addresses are **lowercased before encoding**.
- An **odd node is promoted unchanged** to the next level. Duplicating the last leaf
  instead would produce a different root.

Change one implementation and you change all three. Then run both checks:

```bash
python3 scripts/keccak.py          # self-test plus live on-chain values
cd web && npm test                 # parity against values the contract accepted
```

`web/tests/merkle.test.ts` is not a unit test of convenience. Its fixtures are
values the deployed contract has already accepted on Arc testnet, so it is the thing
standing between a refactor and silently broken receipts.
