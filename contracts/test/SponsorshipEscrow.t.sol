// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {SponsorshipEscrow} from "../src/SponsorshipEscrow.sol";

interface Vm {
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function warp(uint256 timestamp) external;
}

contract SponsorshipEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC private token;
    SponsorshipEscrow private escrow;

    address private brand = address(0xBEEF);
    address private creator = address(0xCAFE);
    address private attacker = address(0xBAD);
    bytes32 private agreementId = keccak256("agreement-1");
    bytes32 private payoutId = keccak256("payout-1");
    bytes32 private termsHash = keccak256("terms");
    uint256 private cap = 8_000_000_000;

    event EscrowCreated(
        bytes32 indexed agreementId,
        address indexed brand,
        address indexed creator,
        address token,
        uint256 totalCap,
        bytes32 termsHash
    );
    event PayoutReleased(bytes32 indexed agreementId, bytes32 indexed payoutId, address indexed creator, uint256 amount);
    event CheckpointApproved(bytes32 indexed agreementId, bytes32 indexed checkpointId, bytes32 artifactHash, bytes32 payoutId);

    function setUp() public {
        token = new MockUSDC();
        escrow = new SponsorshipEscrow();
        token.mint(brand, cap);
        vm.prank(brand);
        token.approve(address(escrow), cap);
    }

    function testCreateEscrowFundsFullCap() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));

        (
            address storedBrand,
            address storedCreator,
            address storedToken,
            uint256 storedCap,
            uint256 releasedAmount,
            bytes32 storedTermsHash,
            uint64 storedRefundAfter,
            bool exists,
            bool active
        ) = escrow.escrows(agreementId);

        assertEq(storedBrand, brand);
        assertEq(storedCreator, creator);
        assertEq(storedToken, address(token));
        assertEq(storedCap, cap);
        assertEq(releasedAmount, 0);
        assertEq(storedTermsHash, termsHash);
        assertTrue(storedRefundAfter > block.timestamp);
        assertTrue(exists);
        assertTrue(active);
        assertEq(escrow.capAmount(agreementId), cap);
        assertEq(token.balanceOf(address(escrow)), cap);
        assertEq(token.balanceOf(brand), 0);
    }

    function testCreateEscrowEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(agreementId, brand, creator, address(token), cap, termsHash);

        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
    }

    function testReleasePayoutTransfersToCreator() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));

        uint256 amount = 500_000_000;
        vm.expectEmit(true, true, true, true);
        emit PayoutReleased(agreementId, payoutId, creator, amount);
        escrow.releasePayout(agreementId, payoutId, amount);

        assertEq(token.balanceOf(creator), amount);
        assertEq(token.balanceOf(address(escrow)), cap - amount);
        assertTrue(escrow.payoutReleased(agreementId, payoutId));
    }

    function testApproveDeliveryAnchorsHashAndReleasesPayoutAtomically() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
        bytes32 submissionHash = keccak256("submission-v1");
        uint256 amount = 500_000_000;

        vm.expectEmit(true, true, true, true);
        bytes32 checkpointId = keccak256("promo");
        emit CheckpointApproved(agreementId, checkpointId, submissionHash, payoutId);
        escrow.approveCheckpointAndRelease(agreementId, checkpointId, submissionHash, payoutId, amount);

        assertEq(escrow.approvedCheckpointHash(agreementId, checkpointId), submissionHash);
        assertTrue(escrow.payoutReleased(agreementId, payoutId));
        assertEq(token.balanceOf(creator), amount);
    }

    function testCannotApproveTwoDeliverables() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
        bytes32 checkpointId = keccak256("promo");
        escrow.approveCheckpointAndRelease(agreementId, checkpointId, keccak256("submission-v1"), payoutId, 500_000_000);

        vm.expectRevert(SponsorshipEscrow.CheckpointAlreadyApproved.selector);
        escrow.approveCheckpointAndRelease(
            agreementId,
            checkpointId,
            keccak256("submission-v2"),
            keccak256("payout-2"),
            500_000_000
        );
    }

    function testCannotReleaseSamePayoutTwice() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
        escrow.releasePayout(agreementId, payoutId, 500_000_000);

        vm.expectRevert(SponsorshipEscrow.PayoutAlreadyReleased.selector);
        escrow.releasePayout(agreementId, payoutId, 500_000_000);
    }

    function testCannotReleaseAboveCap() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
        escrow.releasePayout(agreementId, payoutId, 7_500_000_000);

        vm.expectRevert(SponsorshipEscrow.CapExceeded.selector);
        escrow.releasePayout(agreementId, keccak256("payout-2"), 600_000_000);
    }

    function testPublicationExtendsRefundDeadlineAndReleasesOnce() public {
        uint64 initialDeadline = uint64(block.timestamp + 1 days);
        uint64 measurementDeadline = uint64(block.timestamp + 30 days);
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, initialDeadline);
        bytes32 artifactHash = keccak256("approved-final-cut");
        escrow.recordPublicationAndRelease(agreementId, artifactHash, payoutId, 4_800_000_000, measurementDeadline);
        (,,,,,, uint64 refundAfter,,) = escrow.escrows(agreementId);
        assertEq(refundAfter, measurementDeadline);
        assertEq(escrow.approvedCheckpointHash(agreementId, keccak256("publication")), artifactHash);
        assertEq(token.balanceOf(creator), 4_800_000_000);
    }

    function testRefundReturnsOnlyUnreleasedBalanceAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, deadline);
        escrow.releasePayout(agreementId, payoutId, 800_000_000);
        vm.warp(deadline);
        vm.prank(brand);
        escrow.refundRemaining(agreementId);
        assertEq(token.balanceOf(brand), cap - 800_000_000);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testUnauthorizedCallerCannotCreateEscrow() public {
        vm.prank(attacker);
        vm.expectRevert(SponsorshipEscrow.Unauthorized.selector);
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));
    }

    function testUnauthorizedCallerCannotReleasePayout() public {
        escrow.createEscrow(agreementId, brand, creator, address(token), cap, termsHash, uint64(block.timestamp + 1 days));

        vm.prank(attacker);
        vm.expectRevert(SponsorshipEscrow.Unauthorized.selector);
        escrow.releasePayout(agreementId, payoutId, 500_000_000);
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "bytes32 mismatch");
    }

    function assertTrue(bool value) internal pure {
        require(value, "expected true");
    }
}
