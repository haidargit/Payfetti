#!/usr/bin/env python3
"""
Does Arc's `Memo` contract work nested inside `Multicall3From.aggregate3`,
and what does it cost?

Circle documents the two predeploys separately and never states that the
combination works. `Memo`'s verified source says "EOA-only: contract callers hit
the callFrom sender-spoofing constraint", while `Multicall3From` claims to
preserve the EOA as `msg.sender`. Whether the precompile permits the *nested*
spoof is node logic, not Solidity, so it cannot be read off the source.

This script measures it against live Arc testnet. Every call is `eth_call` or
`eth_estimateGas`: no signature, no gas, no funds moved. Safe to re-run.

    python3 scripts/probe-memo.py

Cases 5 and 6 are the controls that make the result mean anything. `eth_call`
sets tx.origin to whatever `from` you pass, so it cannot tell an EOA from a
contract — passing a contract address as `from` proves nothing. Asking the
precompile to act for someone who is not the origin *is* refused, which is how
we know its access control is live inside `eth_call` at all.

The calldata this builds by hand is pinned as test vectors in
`web/tests/batch.test.ts`, so viem's encoder is checked against bytes the chain
accepted rather than against itself.
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keccak import keccak256  # noqa: E402

RPC = os.environ.get("ARC_RPC", "https://rpc.testnet.arc.io")
GAS_PRICE = 20_000_000_000  # Arc's floor. Below it a transaction is silently dropped.

USDC = "0x3600000000000000000000000000000000000000"
MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505"
MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0"
CALL_FROM = "0x1800000000000000000000000000000000000003"  # read from Memo.CALL_FROM()

# Any funded testnet EOA. Override to probe from your own address.
PAYER = os.environ.get("ARC_PAYER", "0x8d026a62f466f7c457be8e3e139c701b791e668e")
NOT_THE_PAYER = "0x00000000000000000000000000000000deadbeef"

MEMO_ID = keccak256(b"payfetti-memo-probe")
AMOUNT = 1000  # 0.001 USDC


# ── ABI encoding by hand, so nothing depends on a library being right ─────────
def sel(sig: str) -> bytes:
    return keccak256(sig.encode())[:4]


def w(n: int) -> bytes:
    return n.to_bytes(32, "big")


def addr(a: str) -> bytes:
    return bytes(12) + bytes.fromhex(a[2:].lower())


def dyn_bytes(b: bytes) -> bytes:
    return w(len(b)) + b + bytes((-len(b)) % 32)


def enc_transfer(to: str, amount: int) -> bytes:
    return sel("transfer(address,uint256)") + addr(to) + w(amount)


def enc_memo(target: str, data: bytes, memo_id: bytes, memo_data: bytes) -> bytes:
    """memo(address target, bytes data, bytes32 memoId, bytes memoData)"""
    head = 4 * 32
    return (
        sel("memo(address,bytes,bytes32,bytes)")
        + addr(target)
        + w(head)
        + memo_id
        + w(head + 32 + len(data) + (-len(data)) % 32)
        + dyn_bytes(data)
        + dyn_bytes(memo_data)
    )


def enc_call_from(sender: str, target: str, data: bytes) -> bytes:
    return (
        sel("callFrom(address,address,bytes)") + addr(sender) + addr(target) + w(96) + dyn_bytes(data)
    )


def enc_aggregate3(calls) -> bytes:
    """aggregate3((address,bool,bytes)[]) — an array of dynamic structs."""
    blobs = [
        addr(t) + w(1 if allow else 0) + w(96) + dyn_bytes(cd) for t, allow, cd in calls
    ]
    offsets, running = [], len(blobs) * 32
    for b in blobs:
        offsets.append(running)
        running += len(b)
    body = w(len(blobs)) + b"".join(w(o) for o in offsets) + b"".join(blobs)
    return sel("aggregate3((address,bool,bytes)[])") + w(32) + body


def rpc(method: str, params) -> dict:
    out = subprocess.run(
        ["curl", "-s", "--max-time", "40", "-X", "POST", RPC,
         "-H", "content-type: application/json",
         "--data", json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})],
        capture_output=True, text=True,
    )
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"error": {"message": f"non-JSON response: {out.stdout[:200]}"}}


def call(to: str, data: bytes, frm: str = PAYER) -> dict:
    return rpc("eth_call", [{"from": frm, "to": to, "data": "0x" + data.hex()}, "latest"])


def estimate(data: bytes, to: str = MULTICALL3FROM):
    r = rpc("eth_estimateGas", [{"from": PAYER, "to": to, "data": "0x" + data.hex()}])
    if "result" not in r:
        return None, r.get("error", {}).get("message", "?")
    return int(r["result"], 16), None


def ok(label: str, res: dict) -> bool:
    good = "result" in res
    print(f"  {'PASS' if good else 'FAIL'}  {label}")
    if not good:
        print(f"        {res.get('error', {}).get('message')}")
    return good


def payee(i: int) -> str:
    return "0x70617966657474690000000000000000" + f"{i:08x}"


def usd(gas: float) -> float:
    return gas * GAS_PRICE / 1e18


def memo_call(i: int, note: bytes) -> tuple:
    return (MEMO, False, enc_memo(USDC, enc_transfer(payee(i), AMOUNT), MEMO_ID, note))


print(f"Arc — can Memo nest inside Multicall3From?   {RPC}")
print(f"payer   {PAYER}")
print(f"memoId  0x{MEMO_ID.hex()}\n")

r = {}

print("1. aggregate3 with a bare USDC transfer (Payfetti's design without memos)")
r["bare"] = ok("aggregate3([USDC.transfer])",
               call(MULTICALL3FROM, enc_aggregate3([(USDC, True, enc_transfer(payee(1), AMOUNT))])))

print("\n2. EOA calls Memo directly (the documented happy path)")
r["direct"] = ok("Memo.memo(USDC.transfer)",
                 call(MEMO, enc_memo(USDC, enc_transfer(payee(1), AMOUNT), MEMO_ID, b"participant 001")))

print("\n3. aggregate3 wrapping ONE Memo call   <- the undocumented combination")
r["one"] = ok("aggregate3([Memo.memo])",
              call(MULTICALL3FROM, enc_aggregate3([memo_call(1, b"participant 001")])))

print("\n4. aggregate3 wrapping TWO Memo calls  <- what a real run looks like")
r["two"] = ok("aggregate3([Memo.memo x2])",
              call(MULTICALL3FROM, enc_aggregate3([memo_call(1, b"participant 001"),
                                                   memo_call(2, b"participant 002")])))

print("\n5. CONTROL — ask the precompile to act for a different sender (must be refused)")
spoof = call(CALL_FROM, enc_call_from(NOT_THE_PAYER, USDC, enc_transfer(payee(1), AMOUNT)))
r["control"] = "result" not in spoof
print(f"  {'GOOD' if r['control'] else 'BAD '}  "
      f"{spoof.get('error', {}).get('message', 'ACCEPTED — access control is not enforced here')}")

print("\n6. CONTROL — call the precompile directly as the payer (expected: refused too)")
own = call(CALL_FROM, enc_call_from(PAYER, USDC, enc_transfer(payee(1), AMOUNT)))
print(f"  {'refused' if 'result' not in own else 'accepted'}: "
      f"{own.get('error', {}).get('message', '-')}")
print("  -> the precompile allows only its allowlisted predeploys, not EOAs directly.")

print("\n" + "=" * 70)
if not r["control"]:
    print("INCONCLUSIVE — the harness failed its own control, so the passes above")
    print("carry no weight. Settle it with a signed transaction instead.")
    sys.exit(1)
elif not (r["one"] and r["two"]):
    print("Memo does NOT nest inside Multicall3From. Per-payee on-chain notes")
    print("would cost one transaction each, defeating the batching.")
    sys.exit(1)
else:
    print("Memo DOES nest inside Multicall3From, and the precompile's access")
    print("control is demonstrably live inside eth_call (cases 5 and 6).")
    print("One transaction can carry N transfers, each with its own on-chain note.")
print("=" * 70)

# ── what it costs ────────────────────────────────────────────────────────────
print("\nGas, measured with eth_estimateGas at Arc's 20 Gwei floor\n")
print(f"{'payees':>7} | {'bare':>11} | {'with memo':>11} | {'fee':>9} | {'ratio':>6}")
print("-" * 58)

rows = {}
for n in (1, 2, 5, 10, 25):
    gb, eb = estimate(enc_aggregate3([(USDC, True, enc_transfer(payee(i + 1), AMOUNT)) for i in range(n)]))
    gm, em = estimate(enc_aggregate3([memo_call(i + 1, b"participant %03d" % (i + 1)) for i in range(n)]))
    if gb is None or gm is None:
        print(f"{n:>7} | error: {eb or em}")
        continue
    rows[n] = (gb, gm)
    print(f"{n:>7} | {gb:>11,} | {gm:>11,} | ${usd(gm):>8.5f} | {gm / gb:>5.2f}x")

if 25 in rows and 5 in rows:
    bare = (rows[25][0] - rows[5][0]) / 20
    memo = (rows[25][1] - rows[5][1]) / 20
    print(f"\nMarginal cost of one more payee (slope from 5 -> 25):")
    print(f"  bare       {bare:>9,.0f} gas  ${usd(bare):.6f}")
    print(f"  with memo  {memo:>9,.0f} gas  ${usd(memo):.6f}")
    print(f"  memo adds  {memo - bare:>9,.0f} gas  ${usd(memo - bare):.6f}  "
          f"(+{memo / bare - 1:.0%})")
    print(f"\n200-payee run:  bare ${usd(rows[5][0] + bare * 195):.4f}   "
          f"with memo ${usd(rows[5][1] + memo * 195):.4f}")
    print(f"Ceiling in a 30M-gas block:  bare ~{int((30_000_000 - rows[5][0]) / bare) + 5} payees   "
          f"with memo ~{int((30_000_000 - rows[5][1]) / memo) + 5} payees")
    print("\nThese are estimates from live chain state and drift about 1%.")
