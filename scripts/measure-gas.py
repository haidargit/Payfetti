#!/usr/bin/env python3
"""
Measure real Arc gas costs for a Payfetti batch. Read-only: no wallet, no money.

Every cost figure in the README and docs/gas.md comes from this script. It uses
`eth_estimateGas` against Arc mainnet with a `from` address that already holds
USDC (found by walking recent blocks), so nothing is signed and nothing is spent.

    python3 scripts/measure-gas.py              # mainnet
    python3 scripts/measure-gas.py --testnet

Why estimate a real `aggregate3` rather than a single transfer: a standalone
transfer estimate includes the 21,000-gas base transaction fee, which a batch pays
ONCE rather than per payee. Estimating the batch directly gives the true marginal
per-payee cost (~46.5k) instead of an inflated one (~75k).

Payees are freshly-random addresses on purpose: a never-seen payee needs a new
balance slot, which is the realistic and more expensive case for payouts.
"""

import argparse
import json
import secrets
import subprocess
import sys

MAINNET = "https://rpc.mainnet.arc.io"
TESTNET = "https://rpc.testnet.arc.io"
USDC = "0x3600000000000000000000000000000000000000"
MULTICALL3FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0"

# Measured separately via `forge test --gas-report`; see docs/gas.md.
RECORD_RUN_GAS = 94_719
BLOCK_GAS_LIMIT = 30_000_000
MIN_BASE_FEE_WEI = 20 * 10**9  # Arc's floor; see docs/security.md §5


def rpc(url, method, params):
    """curl rather than urllib: some environments only route curl through a proxy."""
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    out = subprocess.run(
        ["curl", "-s", "--max-time", "40", "-X", "POST", url,
         "-H", "content-type: application/json", "--data", payload],
        capture_output=True, text=True,
    ).stdout
    if not out:
        sys.exit(f"no response from {url} for {method}")
    return json.loads(out)


def enc_addr(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def enc_uint(n):
    return hex(n)[2:].rjust(64, "0")


def usd(gas, fee_wei=MIN_BASE_FEE_WEI):
    """Arc: cost in USDC = gas x baseFeePerGas / 1e18 (fees are 18-dec native)."""
    return gas * fee_wei / 1e18


def transfer_calldata(to, amount_6dp):
    """USDC.transfer(address,uint256); amounts are 6-decimal via the ERC-20 iface."""
    return "a9059cbb" + enc_addr(to) + enc_uint(amount_6dp)


def encode_aggregate3(calls):
    """aggregate3(Call3[]) where Call3 = (address target, bool allowFailure, bytes callData)."""
    selector = "82ad56cb"
    tuples = []
    for target, allow_failure, data in calls:
        data_len = len(data) // 2
        padding = "0" * (((32 - data_len % 32) % 32) * 2)
        tuples.append(
            enc_addr(target)
            + enc_uint(1 if allow_failure else 0)
            + enc_uint(0x60)          # offset to bytes, relative to tuple start
            + enc_uint(data_len)
            + data + padding
        )
    offsets, cursor = [], len(calls) * 32
    for t in tuples:
        offsets.append(enc_uint(cursor))
        cursor += len(t) // 2
    return "0x" + selector + enc_uint(0x20) + enc_uint(len(calls)) + "".join(offsets) + "".join(tuples)


def find_funded_address(url):
    """Any account that has paid gas on Arc holds USDC, since USDC IS the gas token."""
    latest = int(rpc(url, "eth_blockNumber", [])["result"], 16)
    for i in range(60):
        block = rpc(url, "eth_getBlockByNumber", [hex(latest - i), True]).get("result")
        if block and block["transactions"]:
            return block["transactions"][0]["from"]
    sys.exit("could not find a funded address in the last 60 blocks")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--testnet", action="store_true")
    ap.add_argument("--from-address", help="override the auto-discovered funded address")
    args = ap.parse_args()

    url = TESTNET if args.testnet else MAINNET
    chain_id = int(rpc(url, "eth_chainId", [])["result"], 16)
    fee = int(rpc(url, "eth_gasPrice", [])["result"], 16)
    print(f"network   : {'Arc Testnet' if args.testnet else 'Arc Mainnet'} (chain {chain_id})")
    print(f"gas price : {fee / 1e9:.9f} Gwei  (floor is 20)")

    sender = args.from_address or find_funded_address(url)
    bal6 = int(rpc(url, "eth_call", [{"to": USDC, "data": "0x70a08231" + enc_addr(sender)}, "latest"])["result"], 16)
    bal18 = int(rpc(url, "eth_getBalance", [sender, "latest"])["result"], 16)
    print(f"sender    : {sender}")
    print(f"balance   : {bal6 / 1e6} USDC (6-dec ERC-20) vs {bal18 / 1e18} (18-dec native)")
    if bal6 / 1e6 != bal18 / 1e18:
        print("            ^ the 6-dec view TRUNCATES. Never use balanceOf for accounting.")
    print()

    def estimate_batch(n):
        calls = [(USDC, True, transfer_calldata("0x" + secrets.token_hex(20), 1_000)) for _ in range(n)]
        res = rpc(url, "eth_estimateGas", [{"from": sender, "to": MULTICALL3FROM, "data": encode_aggregate3(calls)}])
        if "error" in res:
            return None, res["error"].get("message")
        return int(res["result"], 16), None

    print("aggregate3 batch estimates (fresh/cold payees):")
    measured = {}
    for n in (1, 2, 5, 10, 25, 50):
        gas, err = estimate_batch(n)
        if err:
            print(f"  n={n:<3} ERROR: {err}")
            continue
        measured[n] = gas
        print(f"  n={n:<3} {gas:>10,} gas  ${usd(gas, fee):>9.5f}  per-payee {gas // n:>7,}")

    if 50 not in measured or 10 not in measured:
        sys.exit("\nnot enough data points to derive a marginal cost")

    marginal = (measured[50] - measured[10]) / 40
    overhead = measured[10] - marginal * 10
    print(f"\n  marginal per extra payee : {marginal:>10,.0f} gas  (${usd(marginal, fee):.6f})")
    print(f"  fixed overhead per batch : {overhead:>10,.0f} gas")

    print("\nprojected run cost (marginal model + recordRun):")
    for n in (10, 50, 200, 500, 642):
        total = overhead + marginal * n + RECORD_RUN_GAS
        flag = "OK" if total < BLOCK_GAS_LIMIT else "EXCEEDS 30M BLOCK LIMIT"
        print(f"  {n:>4} payees: {total:>12,.0f} gas  ${usd(total, fee):>8.4f}  {flag}")

    max_payees = int((BLOCK_GAS_LIMIT - RECORD_RUN_GAS - overhead) // marginal)
    print(f"\n  max payees in one run: ~{max_payees}  (chunk above ~{int(max_payees * 0.8)} for headroom)")


if __name__ == "__main__":
    main()
