// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SponsorshipEscrow {
    struct Escrow {
        address brand;
        address creator;
        address token;
        uint256 totalCap;
        uint256 releasedAmount;
        bytes32 termsHash;
        uint64 refundAfter;
        bool exists;
        bool active;
    }

    address public owner;

    mapping(address => bool) public operators;
    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => mapping(bytes32 => bool)) public payoutReleased;
    mapping(bytes32 => mapping(bytes32 => bytes32)) public approvedCheckpointHash;

    event OperatorUpdated(address indexed operator, bool allowed);
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
    event PublicationRecorded(bytes32 indexed agreementId, bytes32 indexed artifactHash, bytes32 indexed payoutId);
    event EscrowRefunded(bytes32 indexed agreementId, address indexed brand, uint256 amount);
    event EscrowCompleted(bytes32 indexed agreementId);

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error EscrowNotActive();
    error PayoutAlreadyReleased();
    error CapExceeded();
    error TokenTransferFailed();
    error CheckpointAlreadyApproved();
    error ZeroHash();
    error RefundNotAvailable();

    constructor() {
        owner = msg.sender;
        operators[msg.sender] = true;
        emit OperatorUpdated(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert Unauthorized();
        _;
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function createEscrow(
        bytes32 agreementId,
        address brand,
        address creator,
        address token,
        uint256 totalCap,
        bytes32 termsHash,
        uint64 refundAfter
    ) external onlyOperator {
        if (brand == address(0) || creator == address(0) || token == address(0)) revert ZeroAddress();
        if (totalCap == 0) revert ZeroAmount();
        if (escrows[agreementId].exists) revert EscrowAlreadyExists();

        bool funded = IERC20Like(token).transferFrom(brand, address(this), totalCap);
        if (!funded) revert TokenTransferFailed();

        escrows[agreementId] = Escrow({
            brand: brand,
            creator: creator,
            token: token,
            totalCap: totalCap,
            releasedAmount: 0,
            termsHash: termsHash,
            refundAfter: refundAfter,
            exists: true,
            active: true
        });

        emit EscrowCreated(agreementId, brand, creator, token, totalCap, termsHash);
    }

    function releasePayout(bytes32 agreementId, bytes32 payoutId, uint256 amount) external onlyOperator {
        _releasePayout(agreementId, payoutId, amount);
    }

    function approveCheckpointAndRelease(
        bytes32 agreementId,
        bytes32 checkpointId,
        bytes32 artifactHash,
        bytes32 payoutId,
        uint256 amount
    ) external onlyOperator {
        if (checkpointId == bytes32(0) || artifactHash == bytes32(0)) revert ZeroHash();
        if (approvedCheckpointHash[agreementId][checkpointId] != bytes32(0)) revert CheckpointAlreadyApproved();

        approvedCheckpointHash[agreementId][checkpointId] = artifactHash;
        emit CheckpointApproved(agreementId, checkpointId, artifactHash, payoutId);
        _releasePayout(agreementId, payoutId, amount);
    }

    function recordPublicationAndRelease(
        bytes32 agreementId,
        bytes32 artifactHash,
        bytes32 payoutId,
        uint256 amount,
        uint64 newRefundAfter
    ) external onlyOperator {
        Escrow storage escrow = escrows[agreementId];
        bytes32 checkpointId = keccak256("publication");
        if (artifactHash == bytes32(0)) revert ZeroHash();
        if (approvedCheckpointHash[agreementId][checkpointId] != bytes32(0)) revert CheckpointAlreadyApproved();
        if (newRefundAfter > escrow.refundAfter) escrow.refundAfter = newRefundAfter;
        approvedCheckpointHash[agreementId][checkpointId] = artifactHash;
        emit PublicationRecorded(agreementId, artifactHash, payoutId);
        _releasePayout(agreementId, payoutId, amount);
    }

    function refundRemaining(bytes32 agreementId) external {
        Escrow storage escrow = escrows[agreementId];
        if (!escrow.exists) revert EscrowNotFound();
        if (!escrow.active) revert EscrowNotActive();
        if (msg.sender != escrow.brand && !operators[msg.sender]) revert Unauthorized();
        if (block.timestamp < escrow.refundAfter) revert RefundNotAvailable();
        uint256 amount = escrow.totalCap - escrow.releasedAmount;
        escrow.active = false;
        if (amount > 0 && !IERC20Like(escrow.token).transfer(escrow.brand, amount)) revert TokenTransferFailed();
        emit EscrowRefunded(agreementId, escrow.brand, amount);
    }

    function _releasePayout(bytes32 agreementId, bytes32 payoutId, uint256 amount) internal {
        Escrow storage escrow = escrows[agreementId];
        if (!escrow.exists) revert EscrowNotFound();
        if (!escrow.active) revert EscrowNotActive();
        if (amount == 0) revert ZeroAmount();
        if (payoutReleased[agreementId][payoutId]) revert PayoutAlreadyReleased();
        if (escrow.releasedAmount + amount > escrow.totalCap) revert CapExceeded();

        payoutReleased[agreementId][payoutId] = true;
        escrow.releasedAmount += amount;

        bool paid = IERC20Like(escrow.token).transfer(escrow.creator, amount);
        if (!paid) revert TokenTransferFailed();

        emit PayoutReleased(agreementId, payoutId, escrow.creator, amount);

        if (escrow.releasedAmount == escrow.totalCap) {
            escrow.active = false;
            emit EscrowCompleted(agreementId);
        }
    }

    function remainingAmount(bytes32 agreementId) external view returns (uint256) {
        Escrow storage escrow = escrows[agreementId];
        if (!escrow.exists) revert EscrowNotFound();
        return escrow.totalCap - escrow.releasedAmount;
    }

    function capAmount(bytes32 agreementId) external view returns (uint256) {
        Escrow storage escrow = escrows[agreementId];
        if (!escrow.exists) revert EscrowNotFound();
        return escrow.totalCap;
    }
}
