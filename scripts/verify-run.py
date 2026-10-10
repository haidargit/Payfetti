#!/usr/bin/env python3
"""
Verify a completed Payfetti run end-to-end, the way a payee's receipt page must.

This is the reference implementation of the **two-half receipt** that
docs/security.md §3 requires. A Merkle proof alone only shows the payer
*declared* a payment; it does not show money moved. So for every payee this
checks BOTH halves:

  1. on-chain `verifyInclusion`: the payer committed to this exact amount, and
  2. a USDC `Transfer(payer -> payee, amount)` log **in the same transaction**
     as this run's `RunRecorded` event.

Only when both hold is a payee genuinely paid. A declared-but-not-transferred
row shows up as SKIPPED, which is exactly what should happen to a blocklisted
or malformed address.

    python3 scripts/verify-run.py --tx 0x9ef5... --proofs fixtures/batch-50-proofs.json

Read-only. Signs nothing, spends nothing.
"""

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keccak import enc_address, enc_bytes32, enc_uint, keccak_hex  # noqa: E402

USDC = "0x3600000000000000000000000000000000000000"
SYSTEM_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe"

TRANSFER_TOPIC = keccak_hex(b"Transfer(address,address,uint256)")
RUN_RECORDED_TOPIC = keccak_hex(
    b"RunRecorded(address,bytes32,bytes32,uint256,uint32,string)"
)
SEL_VERIFY = keccak_hex(
    b"verifyInclusion(address,bytes32,address,uint256,bytes32,bytes32[])"
)[:10]


def rpc(url, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    out = subprocess.run(
        ["curl", "-s", "--max-time", "60", "-X", "POST", url,
         "-H", "content-type: application/json", "--data", payload],
        capture_output=True, text=True,
    ).stdout
    if not out:
        sys.exit(f"no response from {url}")
    r = json.loads(out)
    if "error" in r:
        sys.exit(f"rpc {method} failed: {r['error']}")
    return r["result"]


def topic_addr(topic):
    return "0x" + topic[-40:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tx", required=True)
    ap.add_argument("--proofs", required=True)
    args = ap.parse_args()

    with open(args.proofs) as f:
        man = json.load(f)

    url = {"testnet": "https://rpc.testnet.arc.io",
           "mainnet": "https://rpc.mainnet.arc.io"}[man["network"]]
    payfetti, payer = man["payfetti"], man["payer"].lower()
    run_id, note_hash = man["runId"], man["noteHash"]

    print(f"network  : Arc {man['network']}")
    print(f"tx       : {args.tx}")
    print(f"payfetti : {payfetti}")
    print(f"payer    : {payer}")
    print(f"runId    : {run_id}")

    rcpt = rpc(url, "eth_getTransactionReceipt", [args.tx])
    gas_used = int(rcpt["gasUsed"], 16)
    price = int(rcpt["effectiveGasPrice"], 16)
    ok_status = int(rcpt["status"], 16) == 1
    print(f"status   : {'success' if ok_status else 'FAILED'}")
    print(f"gas used : {gas_used:,} @ {price / 1e9:.6f} Gwei = ${gas_used * price / 1e18:.6f}")
    print(f"logs     : {len(rcpt['logs'])}")
    if not ok_status:
        sys.exit("transaction failed; nothing to verify")

    # ── half 2: which payees actually received a Transfer in THIS tx ────────
    # Use the ERC-20 emitter (6 decimals); its amounts match our Merkle leaves
    # directly. The system emitter reports the same transfer at 18 decimals and
    # would double-count. See docs/security.md §3.
    paid = {}
    erc20_logs = system_logs = 0
    run_recorded = None
    for lg in rcpt["logs"]:
        addr = lg["address"].lower()
        topics = lg["topics"]
        if addr == USDC.lower() and topics and topics[0].lower() == TRANSFER_TOPIC:
            erc20_logs += 1
            frm, to = topic_addr(topics[1].lower()), topic_addr(topics[2].lower())
            if frm == payer:
                paid.setdefault(to, 0)
                paid[to] += int(lg["data"], 16)
        elif addr == SYSTEM_EMITTER and topics and topics[0].lower() == TRANSFER_TOPIC:
            system_logs += 1
        elif addr == payfetti.lower() and topics and topics[0].lower() == RUN_RECORDED_TOPIC:
            run_recorded = lg

    print(f"  ERC-20 Transfer logs (6 dec) : {erc20_logs}")
    print(f"  system  Transfer logs (18dec): {system_logs}  <- same transfers, do not double-count")

    if not run_recorded:
        sys.exit("❌ no RunRecorded event in this transaction, so receipts cannot bind to it")

    if topic_addr(run_recorded["topics"][1].lower()) != payer:
        sys.exit("❌ RunRecorded was attributed to a different address than the payer")
    if run_recorded["topics"][2].lower() != run_id.lower():
        sys.exit("❌ RunRecorded carries a different runId")

    onchain_root = "0x" + run_recorded["data"][2:66]
    print(f"\nRunRecorded root : {onchain_root}")
    print(f"locally computed : {man['root']}")
    if onchain_root.lower() != man["root"].lower():
        sys.exit("❌ ROOT MISMATCH: the Python tree disagrees with the chain")
    print("✅ root matches: Python Merkle tree agrees with Solidity")

    # ── half 1: on-chain inclusion proof for every row ──────────────────────
    print(f"\nverifying {len(man['rows'])} receipts (both halves)...\n")
    proven = skipped = failed = 0
    problems = []

    for r in man["rows"]:
        payee, amount = r["payee"], r["amount"]
        proof = r["proof"]
        data = (SEL_VERIFY[2:] + enc_address(payer).hex() + enc_bytes32(run_id).hex()
                + enc_address(payee).hex() + enc_uint(amount).hex()
                + enc_bytes32(note_hash).hex() + enc_uint(0xC0).hex()
                + enc_uint(len(proof)).hex() + "".join(enc_bytes32(p).hex() for p in proof))
        res = rpc(url, "eth_call", [{"to": payfetti, "data": "0x" + data}, "latest"])
        included = int(res, 16) == 1
        transferred = paid.get(payee.lower(), 0) >= amount

        if included and transferred:
            proven += 1
        elif included and not transferred:
            skipped += 1
            print(f"  SKIPPED  #{r['index']:>3} {payee}  {amount} units, declared but not transferred")
        else:
            failed += 1
            problems.append((r["index"], payee, included, transferred))

    print(f"\n{'=' * 62}")
    print(f"✅ PAID & PROVEN : {proven:>3}  (inclusion proof + Transfer in the same tx)")
    print(f"⏭️  SKIPPED       : {skipped:>3}  (declared but transfer reverted, allowFailure worked)")
    print(f"❌ PROBLEMS      : {failed:>3}")
    print("=" * 62)

    for idx, payee, inc, tr in problems:
        print(f"  #{idx} {payee}: inclusion={inc} transferred={tr}")

    # ── forgery checks, to prove the receipt actually discriminates ─────────
    print("\nforgery checks (all must be FALSE):")
    victim = man["rows"][0]
    for label, payee, amount in [
        ("inflated amount", victim["payee"], victim["amount"] * 1000),
        ("stranger claiming the proof", "0x000000000000000000000000000000000000dEaD", victim["amount"]),
    ]:
        data = (SEL_VERIFY[2:] + enc_address(payer).hex() + enc_bytes32(run_id).hex()
                + enc_address(payee).hex() + enc_uint(amount).hex()
                + enc_bytes32(note_hash).hex() + enc_uint(0xC0).hex()
                + enc_uint(len(victim["proof"])).hex()
                + "".join(enc_bytes32(p).hex() for p in victim["proof"]))
        res = rpc(url, "eth_call", [{"to": payfetti, "data": "0x" + data}, "latest"])
        got = int(res, 16) == 1
        print(f"  {'❌ ACCEPTED (BAD!)' if got else '✅ rejected'}  {label}")
        if got:
            failed += 1

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
