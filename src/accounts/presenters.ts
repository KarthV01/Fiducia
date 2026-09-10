import type { CreatorProfile, SponsorProfile } from "@prisma/client";
import { AGREEMENT_STATUS, DELIVERABLE_STATUS, PARTICIPANT_ROLE, PAYOUT_STATUS } from "../domain/status.js";
import type { AgreementView } from "../services/agreementService.js";
import { publicCreatorProfile, publicSponsorProfile } from "./profiles.js";

export function sumAmounts(amounts: string[]): string {
  return amounts.reduce((sum, amount) => sum + BigInt(amount), 0n).toString();
}

export function buildDashboardTotals(agreements: AgreementView[]) {
  const byStatus = agreements.reduce<Record<string, number>>((acc, agreement) => {
    acc[agreement.status] = (acc[agreement.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalContracts: agreements.length,
    byStatus,
    escrowedCapAmount: sumAmounts(
      agreements
        .filter((agreement) => agreement.blockchainRecord)
        .map((agreement) => agreement.blockchainRecord!.totalCapAmount),
    ),
    releasedPayoutAmount: sumAmounts(
      agreements.flatMap((agreement) =>
        agreement.payouts
          .filter((payout) => payout.status === PAYOUT_STATUS.released)
          .map((payout) => payout.amount),
      ),
    ),
    pendingPayoutAmount: sumAmounts(
      agreements.flatMap((agreement) =>
        agreement.payouts
          .filter((payout) => payout.status === PAYOUT_STATUS.pending)
          .map((payout) => payout.amount),
      ),
    ),
  };
}

export function buildAgreementFinancials(agreement: AgreementView) {
  return {
    totalCapAmount: agreement.totalCapAmount,
    releasedPayoutAmount: sumAmounts(
      agreement.payouts
        .filter((payout) => payout.status === PAYOUT_STATUS.released)
        .map((payout) => payout.amount),
    ),
    pendingPayoutAmount: sumAmounts(
      agreement.payouts
        .filter((payout) => payout.status === PAYOUT_STATUS.pending)
        .map((payout) => payout.amount),
    ),
  };
}

export function enrichAgreement(
  agreement: AgreementView,
  sponsors: SponsorProfile[],
  creators: CreatorProfile[],
) {
  return {
    ...agreement,
    sponsorProfile: findAgreementSponsor(agreement, sponsors),
    creatorProfile: findAgreementCreator(agreement, creators),
    financials: buildAgreementFinancials(agreement),
    workflow: buildContractWorkflow(agreement),
  };
}

export function summarizeAgreement(
  agreement: AgreementView,
  sponsors: SponsorProfile[],
  creators: CreatorProfile[],
) {
  return {
    id: agreement.id,
    title: agreement.title,
    status: agreement.status,
    deadline: agreement.deadline,
    measurementWindowDays: agreement.measurementWindowDays,
    totalCapAmount: agreement.totalCapAmount,
    termsHash: agreement.termsHash,
    blockchainRecord: agreement.blockchainRecord,
    sponsorProfile: findAgreementSponsor(agreement, sponsors),
    creatorProfile: findAgreementCreator(agreement, creators),
    financials: buildAgreementFinancials(agreement),
    workflow: buildContractWorkflow(agreement),
  };
}

export function buildContractWorkflow(agreement: AgreementView) {
  const latestSubmission = agreement.deliverableSubmissions[0] ?? null;
  const basePaid = agreement.payouts.some(
    (payout) => payout.kind === "base" && payout.status === PAYOUT_STATUS.released,
  );
  const completedSteps: string[] = [];
  if (agreement.status !== AGREEMENT_STATUS.draft && agreement.status !== AGREEMENT_STATUS.acceptedOffchain) {
    completedSteps.push("Contract accepted", "Escrow funded");
  }
  if (latestSubmission) completedSteps.push("Deliverable submitted");
  if (latestSubmission?.status === DELIVERABLE_STATUS.approved) completedSteps.push("Sponsor approved");
  if (basePaid) completedSteps.push("Base payout released");

  let deliveryStatus = "awaiting_submission";
  let currentStep = "accept_contract";
  let creatorAction: string | null = null;
  let sponsorAction: string | null = null;

  if (agreement.status === AGREEMENT_STATUS.draft || agreement.status === AGREEMENT_STATUS.acceptedOffchain) {
    creatorAction = "accept";
  } else if (agreement.status === AGREEMENT_STATUS.completed) {
    deliveryStatus = latestSubmission?.status === DELIVERABLE_STATUS.approved ? "approved" : "awaiting_submission";
    currentStep = "completed";
  } else if (!latestSubmission) {
    currentStep = "submit_deliverable";
    creatorAction = "submit";
  } else if (latestSubmission.status === DELIVERABLE_STATUS.submitted) {
    deliveryStatus = "in_review";
    currentStep = "review_deliverable";
    sponsorAction = "review";
  } else if (latestSubmission.status === DELIVERABLE_STATUS.changesRequested) {
    deliveryStatus = "changes_requested";
    currentStep = "revise_deliverable";
    creatorAction = "revise";
  } else {
    deliveryStatus = "approved";
    currentStep = "track_performance";
  }

  return {
    deliveryStatus,
    currentStep,
    creatorAction,
    sponsorAction,
    completedSteps,
    remainingSteps: remainingSteps(currentStep),
    latestSubmission,
    inviteId: agreement.contractInvite?.id ?? null,
  };
}

function remainingSteps(currentStep: string) {
  const steps = [
    ["accept_contract", "Accept contract"],
    ["submit_deliverable", "Submit deliverable"],
    ["review_deliverable", "Sponsor review"],
    ["revise_deliverable", "Submit revision"],
    ["track_performance", "Track performance bonuses"],
  ];
  const index = steps.findIndex(([key]) => key === currentStep);
  return index < 0 ? [] : steps.slice(index).map(([, label]) => label);
}

export function presentInvite(invite: {
  id: string;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  sponsorProfile: SponsorProfile;
  creatorProfile: CreatorProfile;
  agreement: AgreementView;
}) {
  return {
    id: invite.id,
    status: invite.status,
    createdAt: invite.createdAt,
    acceptedAt: invite.acceptedAt,
    sponsorProfile: publicSponsorProfile(invite.sponsorProfile),
    creatorProfile: publicCreatorProfile(invite.creatorProfile),
    agreement: enrichAgreement(invite.agreement, [invite.sponsorProfile], [invite.creatorProfile]),
  };
}

function findAgreementCreator(agreement: AgreementView, creators: CreatorProfile[]) {
  const participant = agreement.participants.find((candidate) => candidate.role === PARTICIPANT_ROLE.creator);
  if (!participant) {
    return null;
  }

  const creator = creators.find(
    (candidate) => candidate.walletAddress.toLowerCase() === participant.walletAddress.toLowerCase(),
  );
  return creator
    ? publicCreatorProfile(creator)
    : {
        id: null,
        handle: participant.handle,
        displayName: participant.displayName,
        walletAddress: participant.walletAddress,
        channelUrl: null,
        category: "",
        averageViews: 0,
        audience: null,
        avatarUrl: null,
      };
}

function findAgreementSponsor(agreement: AgreementView, sponsors: SponsorProfile[]) {
  const participant = agreement.participants.find((candidate) => candidate.role === PARTICIPANT_ROLE.brand);
  if (!participant) {
    return null;
  }

  const sponsor = sponsors.find(
    (candidate) => candidate.walletAddress.toLowerCase() === participant.walletAddress.toLowerCase(),
  );
  return sponsor
    ? publicSponsorProfile(sponsor)
    : {
        id: null,
        name: participant.displayName,
        handle: participant.handle,
        walletAddress: participant.walletAddress,
        industry: "",
        websiteUrl: null,
        logoUrl: null,
        monthlyBudgetAmount: "0",
      };
}
