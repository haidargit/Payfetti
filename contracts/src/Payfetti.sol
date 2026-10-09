// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  Payfetti — batch payout run registry
/// @notice Records one-to-many USDC payout runs on Arc.
/// @dev    Never touches USDC: no transfers, no approvals, no balance, no
///         payable. Transfers happen wallet-to-wallet inside Arc's
///         Multicall3From; this only writes the record beside them.
contract Payfetti {
    /// @param payeeRoot   Merkle root over the run's payee leaves
    /// @param total       sum of intended payouts, in 6-decimal USDC units
    /// @param count       number of payees
    /// @param blockNumber block the record landed in, so receipts skip log scans
    struct Run {
        bytes32 payeeRoot;
        uint256 total;
        uint32 count;
        uint64 recordedAt;
        uint64 blockNumber;
    }

    /// @dev payer => runId => run. Namespacing by payer lets two payers reuse a
    ///      runId, and stops anyone squatting another payer's.
    mapping(address => mapping(bytes32 => Run)) private _runs;

    event RunRecorded(
        address indexed payer,
        bytes32 indexed runId,
        bytes32 payeeRoot,
        uint256 total,
        uint32 count,
        string memo
    );

    error EmptyRun();
    error MissingRoot();

    /// @notice Record a payout run under the caller.
    /// @param total Self-reported display metadata, not verified against the
    ///              leaves. The amount inside a Merkle leaf is the only one a
    ///              payee should rely on. Same applies to `count`.
    function recordRun(
        bytes32 runId,
        bytes32 payeeRoot,
        uint256 total,
        uint32 count,
        string calldata memo
    ) external {
        if (payeeRoot == bytes32(0)) revert MissingRoot();
        if (count == 0) revert EmptyRun();

        // uint64 is ample for both, and packing them with `count` puts the tail
        // of the struct in one slot: 3 SSTOREs per run rather than 5.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 ts = uint64(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 bn = uint64(block.number);

        _runs[msg.sender][runId] =
            Run({payeeRoot: payeeRoot, total: total, count: count, recordedAt: ts, blockNumber: bn});

        emit RunRecorded(msg.sender, runId, payeeRoot, total, count, memo);
    }

    function getRun(
        address payer,
        bytes32 runId
    ) external view returns (Run memory) {
        return _runs[payer][runId];
    }

    function runExists(
        address payer,
        bytes32 runId
    ) external view returns (bool) {
        return _runs[payer][runId].payeeRoot != bytes32(0);
    }
}
