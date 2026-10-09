// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Payfetti} from "../src/Payfetti.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/// @notice Deploys Payfetti. No constructor arguments, no owner, no funds held,
///         so there is nothing to configure here.
///
/// Testnet first, since it is free and doubles as the rehearsal:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url arc_testnet --broadcast --verify -vvv
///
/// Mainnet once that run is proven: same command with `--rpc-url arc`.
///
/// Arc enforces a 20 Gwei minimum base fee and silently drops transactions
/// below it, with no error and no receipt. Check that first if a broadcast
/// seems to vanish, and pass `--with-gas-price` if needed.
///
/// Sign with `--account <name>` for an encrypted keystore (preferred) or
/// `--private-key $PRIVATE_KEY`. Never commit a key; see ../.env.example.
contract Deploy is Script {
    function run() external returns (Payfetti payfetti) {
        vm.startBroadcast();
        payfetti = new Payfetti();
        vm.stopBroadcast();

        console2.log("Payfetti deployed to:", address(payfetti));
        console2.log("chain id:            ", block.chainid);
        console2.log("block:               ", block.number);

        if (block.chainid == 5042) {
            console2.log("network:              Arc MAINNET");
            console2.log("explorer:             https://explorer.arc.io/address/%s", address(payfetti));
        } else if (block.chainid == 5_042_002) {
            console2.log("network:              Arc Testnet");
            console2.log("explorer:             https://testnet.arcscan.app/address/%s", address(payfetti));
        } else {
            console2.log("network:              local / unknown");
        }
    }
}
