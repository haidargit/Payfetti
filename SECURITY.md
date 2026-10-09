# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report them privately through [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability).

Please include: what the issue is, how to reproduce it, and the impact you believe
it has. If it concerns a deployed contract, include the chain and address.

## Scope

| In scope                                            | Out of scope                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `contracts/src/Payfetti.sol` and deployed instances | Arc itself (report to Circle's [Bug Bounty](https://hackerone.com/circle-bbp)) |
| The Merkle/receipt logic in `scripts/`              | USDC, `Multicall3From`, CCTP (also Circle's)                                   |
| The web frontend                                    | Third-party wallets (Rabby, MetaMask)                                          |

## What this contract can and cannot do

Worth stating plainly, because it bounds the impact of any bug here:

**`Payfetti.sol` never touches USDC.** It has no token transfers, no `approve`,
no `transferFrom`, no `payable` function, no `receive`/`fallback`, and no way to
move value. It holds no balance and no allowance over anyone's balance. Funds move
wallet-to-wallet inside Arc's `Multicall3From`; this contract only writes a record
alongside them.

**So a bug here cannot drain funds.** The worst realistic outcome is a wrong or
missing *record*: bad for auditability, not for anyone's balance. There is also no
owner, no admin function, no pause and no upgrade path, so there is no privileged
key whose compromise would matter.

The known limitations are documented honestly in
[`docs/security.md`](docs/security.md), in particular §3, which explains why a
Merkle proof alone does **not** prove payment, and what a complete receipt requires.

## Known limitations (not vulnerabilities)

These are documented design trade-offs, not bugs. Please read
[`docs/security.md`](docs/security.md) before reporting:

- `total` and `count` in `recordRun` are self-reported display metadata and are not
  verified against the Merkle leaves.
- A payer can record a run without sending the transfers. This is why a complete
  receipt requires **both** the inclusion proof and a matching USDC `Transfer` log
  in the same transaction.
- `markSkipped` flags are write-only by design; retries create a new run.
- v1 performs no compliance screening of payees.

## Disclosure

This is a hackathon-stage project with no bug bounty. Reports are handled on a
best-effort basis, and credit is given in the release notes unless you prefer
otherwise.
