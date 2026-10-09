// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Payfetti} from "../src/Payfetti.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Multicall3From without the CallFrom precompile, so msg.sender becomes
///      the forwarder: the opposite of Arc's behaviour.
contract NaiveForwarder {
    Payfetti private immutable payfetti;

    constructor(
        Payfetti _payfetti
    ) {
        payfetti = _payfetti;
    }

    function forwardRecordRun(
        bytes32 runId,
        bytes32 root,
        uint256 total,
        uint32 count
    ) external {
        payfetti.recordRun(runId, root, total, count, "via forwarder");
    }
}

contract PayfettiTest is Test {
    Payfetti internal payfetti;

    address internal payer = makeAddr("payer");
    address internal otherPayer = makeAddr("otherPayer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    bytes32 internal constant RUN_ID = keccak256("run-1");
    bytes32 internal constant NOTE = keccak256("march panel");

    event RunRecorded(
        address indexed payer,
        bytes32 indexed runId,
        bytes32 payeeRoot,
        uint256 total,
        uint32 count,
        string memo
    );
    event PayeesSkipped(address indexed payer, bytes32 indexed runId, address[] payees);

    function setUp() public {
        payfetti = new Payfetti();
    }

    /* ----------------------------- recordRun ----------------------------- */

    function test_recordRun_storesTheRun() public {
        bytes32 root = keccak256("root");

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 500_000, 50, "march panel");

        Payfetti.Run memory r = payfetti.getRun(payer, RUN_ID);
        assertEq(r.payeeRoot, root, "root");
        assertEq(r.total, 500_000, "total");
        assertEq(r.count, 50, "count");
        assertEq(r.recordedAt, uint64(block.timestamp), "recordedAt");
        assertEq(r.blockNumber, uint64(block.number), "blockNumber");
        assertTrue(payfetti.runExists(payer, RUN_ID));
    }

    function test_recordRun_emitsEvent() public {
        bytes32 root = keccak256("root");

        vm.expectEmit(true, true, true, true);
        emit RunRecorded(payer, RUN_ID, root, 500_000, 50, "march panel");

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 500_000, 50, "march panel");
    }

    /// Sharing a transaction with the transfers, this revert unwinds those too.
    function test_recordRun_revertsOnDuplicateRunId() public {
        bytes32 root = keccak256("root");

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 500_000, 50, "first");

        vm.expectRevert(abi.encodeWithSelector(Payfetti.RunAlreadyRecorded.selector, payer, RUN_ID));
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 999_999, 7, "second");
    }

    function test_recordRun_runIdsAreNamespacedPerPayer() public {
        bytes32 rootA = keccak256("rootA");
        bytes32 rootB = keccak256("rootB");

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, rootA, 100, 1, "a");

        vm.prank(otherPayer);
        payfetti.recordRun(RUN_ID, rootB, 200, 2, "b");

        assertEq(payfetti.getRun(payer, RUN_ID).payeeRoot, rootA);
        assertEq(payfetti.getRun(otherPayer, RUN_ID).payeeRoot, rootB);
        assertEq(payfetti.getRun(payer, RUN_ID).total, 100);
        assertEq(payfetti.getRun(otherPayer, RUN_ID).total, 200);
    }

    function test_recordRun_revertsOnZeroRoot() public {
        vm.expectRevert(Payfetti.MissingRoot.selector);
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, bytes32(0), 100, 1, "");
    }

    function test_recordRun_revertsOnZeroCount() public {
        vm.expectRevert(Payfetti.EmptyRun.selector);
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, keccak256("root"), 100, 0, "");
    }

    /// So a run cannot be forged in someone else's name.
    function test_recordRun_attributesToDirectCaller_notAnIntermediary() public {
        NaiveForwarder fwd = new NaiveForwarder(payfetti);

        vm.prank(payer);
        fwd.forwardRecordRun(RUN_ID, keccak256("root"), 100, 1);

        assertFalse(payfetti.runExists(payer, RUN_ID), "must not attribute to the indirect sender");
        assertTrue(payfetti.runExists(address(fwd), RUN_ID), "attributed to the direct caller");
    }

    /* ---------------------------- markSkipped ---------------------------- */

    function test_markSkipped_flagsPayees() public {
        _recordSimpleRun();

        address[] memory skipped = new address[](2);
        skipped[0] = alice;
        skipped[1] = bob;

        vm.prank(payer);
        payfetti.markSkipped(RUN_ID, skipped);

        assertTrue(payfetti.wasSkipped(payer, RUN_ID, alice));
        assertTrue(payfetti.wasSkipped(payer, RUN_ID, bob));
        assertFalse(payfetti.wasSkipped(payer, RUN_ID, carol));
    }

    function test_markSkipped_emitsEvent() public {
        _recordSimpleRun();

        address[] memory skipped = new address[](1);
        skipped[0] = alice;

        vm.expectEmit(true, true, true, true);
        emit PayeesSkipped(payer, RUN_ID, skipped);

        vm.prank(payer);
        payfetti.markSkipped(RUN_ID, skipped);
    }

    /// Enforced by the record living under msg.sender, not an ownership check.
    function test_markSkipped_revertsForNonPayer() public {
        _recordSimpleRun();

        address[] memory skipped = new address[](1);
        skipped[0] = alice;

        vm.expectRevert(abi.encodeWithSelector(Payfetti.RunNotFound.selector, otherPayer, RUN_ID));
        vm.prank(otherPayer);
        payfetti.markSkipped(RUN_ID, skipped);
    }

    function test_markSkipped_revertsForUnknownRun() public {
        address[] memory skipped = new address[](1);
        skipped[0] = alice;

        vm.expectRevert(abi.encodeWithSelector(Payfetti.RunNotFound.selector, payer, RUN_ID));
        vm.prank(payer);
        payfetti.markSkipped(RUN_ID, skipped);
    }

    function test_markSkipped_revertsOnEmptyList() public {
        _recordSimpleRun();

        vm.expectRevert(Payfetti.NoPayeesGiven.selector);
        vm.prank(payer);
        payfetti.markSkipped(RUN_ID, new address[](0));
    }

    /* -------------------------- verifyInclusion -------------------------- */

    function test_verifyInclusion_provesEveryPayeeInAFourLeafTree() public {
        (bytes32 root, bytes32[4] memory leaves) = _buildFourLeafTree();

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 4_000_000, 4, "four payees");

        // tree:        root
        //            /      \
        //         h01        h23
        //        /   \      /   \
        //      l0    l1   l2    l3
        bytes32 h01 = _hashPair(leaves[0], leaves[1]);
        bytes32 h23 = _hashPair(leaves[2], leaves[3]);

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = leaves[1];
        proof0[1] = h23;
        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, alice, 1_000_000, NOTE, proof0), "alice");

        bytes32[] memory proof1 = new bytes32[](2);
        proof1[0] = leaves[0];
        proof1[1] = h23;
        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, bob, 1_000_000, NOTE, proof1), "bob");

        bytes32[] memory proof2 = new bytes32[](2);
        proof2[0] = leaves[3];
        proof2[1] = h01;
        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, carol, 1_000_000, NOTE, proof2), "carol");

        bytes32[] memory proof3 = new bytes32[](2);
        proof3[0] = leaves[2];
        proof3[1] = h01;
        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, dave, 1_000_000, NOTE, proof3), "dave");
    }

    /// A real proof with an inflated amount must fail, or receipts prove nothing.
    function test_verifyInclusion_failsOnWrongAmount() public {
        (bytes32 root, bytes32[4] memory leaves) = _buildFourLeafTree();

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 4_000_000, 4, "four payees");

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = leaves[1];
        proof0[1] = _hashPair(leaves[2], leaves[3]);

        assertFalse(payfetti.verifyInclusion(payer, RUN_ID, alice, 9_999_999, NOTE, proof0));
    }

    function test_verifyInclusion_failsForPayeeNotInTheRun() public {
        (bytes32 root, bytes32[4] memory leaves) = _buildFourLeafTree();

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 4_000_000, 4, "four payees");

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = leaves[1];
        proof0[1] = _hashPair(leaves[2], leaves[3]);

        address stranger = makeAddr("stranger");
        assertFalse(payfetti.verifyInclusion(payer, RUN_ID, stranger, 1_000_000, NOTE, proof0));
    }

    function test_verifyInclusion_failsOnUnknownRun() public view {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(payfetti.verifyInclusion(payer, RUN_ID, alice, 1_000_000, NOTE, proof));
    }

    /// A single-payee run: the leaf is the root, so the proof is empty.
    function test_verifyInclusion_singlePayeeRun() public {
        bytes32 leaf = payfetti.leafOf(alice, 1_000_000, NOTE);

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, leaf, 1_000_000, 1, "one payee");

        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, alice, 1_000_000, NOTE, new bytes32[](0)));
        assertFalse(payfetti.verifyInclusion(payer, RUN_ID, bob, 1_000_000, NOTE, new bytes32[](0)));
    }

    /* ------------------------------- fuzz -------------------------------- */

    function testFuzz_recordRun_roundTrips(
        bytes32 runId,
        bytes32 root,
        uint256 total,
        uint32 count,
        address who
    ) public {
        vm.assume(root != bytes32(0));
        vm.assume(count != 0);
        vm.assume(who != address(0));

        vm.prank(who);
        payfetti.recordRun(runId, root, total, count, "fuzz");

        Payfetti.Run memory r = payfetti.getRun(who, runId);
        assertEq(r.payeeRoot, root);
        assertEq(r.total, total);
        assertEq(r.count, count);
    }

    function testFuzz_recordRun_alwaysRejectsReplay(
        bytes32 runId,
        bytes32 root,
        address who
    ) public {
        vm.assume(root != bytes32(0));
        vm.assume(who != address(0));

        vm.prank(who);
        payfetti.recordRun(runId, root, 1, 1, "");

        vm.expectRevert(abi.encodeWithSelector(Payfetti.RunAlreadyRecorded.selector, who, runId));
        vm.prank(who);
        payfetti.recordRun(runId, root, 1, 1, "");
    }

    function testFuzz_verifyInclusion_rejectsForgedPayee(
        address realPayee,
        address forged,
        uint256 amount
    ) public {
        vm.assume(realPayee != forged);

        bytes32 leaf = payfetti.leafOf(realPayee, amount, NOTE);

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, leaf, amount, 1, "");

        assertTrue(payfetti.verifyInclusion(payer, RUN_ID, realPayee, amount, NOTE, new bytes32[](0)));
        assertFalse(payfetti.verifyInclusion(payer, RUN_ID, forged, amount, NOTE, new bytes32[](0)));
    }

    /* ------------------------------ helpers ------------------------------ */

    function _recordSimpleRun() private {
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, keccak256("root"), 500_000, 50, "simple");
    }

    function _buildFourLeafTree() private view returns (bytes32 root, bytes32[4] memory leaves) {
        leaves[0] = payfetti.leafOf(alice, 1_000_000, NOTE);
        leaves[1] = payfetti.leafOf(bob, 1_000_000, NOTE);
        leaves[2] = payfetti.leafOf(carol, 1_000_000, NOTE);
        leaves[3] = payfetti.leafOf(dave, 1_000_000, NOTE);

        root = _hashPair(_hashPair(leaves[0], leaves[1]), _hashPair(leaves[2], leaves[3]));
    }

    /// Mirrors the contract's sorted-pair hashing.
    function _hashPair(
        bytes32 a,
        bytes32 b
    ) private pure returns (bytes32) {
        return a <= b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }
}
