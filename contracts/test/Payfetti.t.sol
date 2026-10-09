// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Payfetti} from "../src/Payfetti.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Stands in for Multicall3From without the CallFrom precompile, so
///      msg.sender becomes the forwarder: the opposite of Arc's behaviour.
///      Proves attribution is correct either way.
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

    bytes32 internal constant RUN_ID = keccak256("run-1");

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

    /// A retried batch must not create a second record. Since the record shares
    /// a transaction with the transfers, this revert unwinds those too.
    function test_recordRun_revertsOnDuplicateRunId() public {
        bytes32 root = keccak256("root");

        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 500_000, 50, "first");

        vm.expectRevert(abi.encodeWithSelector(Payfetti.RunAlreadyRecorded.selector, payer, RUN_ID));
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, root, 999_999, 7, "second");
    }

    /// runIds are namespaced per payer, so one payer cannot squat or block
    /// another's identifier.
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

    /// Attribution follows the direct caller, never an address passed in as an
    /// argument, so a run cannot be forged in someone else's name.
    function test_recordRun_attributesToDirectCaller_notAnIntermediary() public {
        NaiveForwarder fwd = new NaiveForwarder(payfetti);

        vm.prank(payer);
        fwd.forwardRecordRun(RUN_ID, keccak256("root"), 100, 1);

        // Recorded under the forwarder, not under payer.
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

    /// Only the run's payer can flag skips, enforced structurally: the record
    /// lives under msg.sender rather than behind an ownership check.
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

    /* ------------------------------ helpers ------------------------------ */

    function _recordSimpleRun() private {
        vm.prank(payer);
        payfetti.recordRun(RUN_ID, keccak256("root"), 500_000, 50, "simple");
    }
}
