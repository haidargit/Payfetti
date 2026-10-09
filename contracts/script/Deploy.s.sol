// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Payfetti} from "../src/Payfetti.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/// @notice Deploys Payfetti.
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
