// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  Payfetti — batch payout run registry
/// @notice Records one-to-many USDC payout runs on Arc and lets any payee prove
///         they were paid a specific amount in a specific run.
/// @dev    Never touches USDC. Transfers happen wallet-to-wallet inside Arc's
///         Multicall3From; this only writes the record beside them.
///
///         Intended call pattern, one transaction:
///
///           Multicall3From.aggregate3([
///             USDC.transfer(payee_i, amount_i),   // × N, allowFailure: true
///             Payfetti.recordRun(...)             // last call
///           ])
///
///         Arc's CallFrom precompile preserves the original sender per subcall,
///         so `msg.sender` here is the payer rather than Multicall3From. A run is
///         always attributed to `msg.sender`, never to a payer address passed as
///         an argument, which would be spoofable.
contract Payfetti {
    /// @param total       6-decimal USDC units
    /// @param blockNumber lets receipts skip log scans
    struct Run {
        bytes32 payeeRoot;
        uint256 total;
        uint32 count;
        uint64 recordedAt;
        uint64 blockNumber;
    }

    /// @dev Namespaced by payer, so nobody can squat another payer's runId.
    mapping(address => mapping(bytes32 => Run)) private _runs;

    /// @dev Payees whose transfer reverted, e.g. an address on Arc's blocklist.
    mapping(address => mapping(bytes32 => mapping(address => bool))) private _skipped;

    event RunRecorded(
        address indexed payer,
        bytes32 indexed runId,
        bytes32 payeeRoot,
        uint256 total,
        uint32 count,
        string memo
    );

    event PayeesSkipped(address indexed payer, bytes32 indexed runId, address[] payees);

    error RunAlreadyRecorded(address payer, bytes32 runId);
    error RunNotFound(address payer, bytes32 runId);
    error EmptyRun();
    error MissingRoot();
    error NoPayeesGiven();

    /// @param total Display metadata, not verified against the leaves. Same for
    ///              `count`.
    function recordRun(
        bytes32 runId,
        bytes32 payeeRoot,
        uint256 total,
        uint32 count,
        string calldata memo
    ) external {
        // Sharing a transaction with the transfers, this also unwinds a replay.
        if (_runs[msg.sender][runId].payeeRoot != bytes32(0)) {
            revert RunAlreadyRecorded(msg.sender, runId);
        }
        if (payeeRoot == bytes32(0)) revert MissingRoot();
        if (count == 0) revert EmptyRun();

        // Narrow casts pack the struct tail into one slot: 3 SSTOREs, not 5.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 ts = uint64(block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 bn = uint64(block.number);

        _runs[msg.sender][runId] =
            Run({payeeRoot: payeeRoot, total: total, count: count, recordedAt: ts, blockNumber: bn});

        emit RunRecorded(msg.sender, runId, payeeRoot, total, count, memo);
    }

    /// @notice Lets the UI retry only the failures. Payer-only, enforced by the
    ///         record living under msg.sender.
    function markSkipped(
        bytes32 runId,
        address[] calldata payees
    ) external {
        if (_runs[msg.sender][runId].payeeRoot == bytes32(0)) {
            revert RunNotFound(msg.sender, runId);
        }
        if (payees.length == 0) revert NoPayeesGiven();

        mapping(address => bool) storage s = _skipped[msg.sender][runId];
        for (uint256 i; i < payees.length; ++i) {
            s[payees[i]] = true;
        }

        emit PayeesSkipped(msg.sender, runId, payees);
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

    function wasSkipped(
        address payer,
        bytes32 runId,
        address payee
    ) external view returns (bool) {
        return _skipped[payer][runId][payee];
    }

    /// @notice The leaf a receipt proves. Double-hashed against second-preimage
    ///         attacks.
    function leafOf(
        address payee,
        uint256 amount,
        bytes32 noteHash
    ) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(payee, amount, noteHash))));
    }

    /// @notice A view, so the frontend checks receipts over `eth_call`.
    /// @dev    Proves inclusion in a *declaration*, not that money moved: a payer
    ///         could record a root and send nothing. A complete receipt is this
    ///         proof plus a USDC `Transfer` log from the same transaction, which
    ///         `aggregate3` guarantees. See `docs/security.md`.
    function verifyInclusion(
        address payer,
        bytes32 runId,
        address payee,
        uint256 amount,
        bytes32 noteHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = _runs[payer][runId].payeeRoot;
        if (root == bytes32(0)) return false;
        return _processProof(proof, leafOf(payee, amount, noteHash)) == root;
    }

    /// @dev Sorted-pair hashing
    function _processProof(
        bytes32[] calldata proof,
        bytes32 leaf
    ) private pure returns (bytes32) {
        bytes32 computed = leaf;
        for (uint256 i; i < proof.length; ++i) {
            bytes32 p = proof[i];
            computed = computed <= p ? keccak256(abi.encode(computed, p)) : keccak256(abi.encode(p, computed));
        }
        return computed;
    }
}
