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
  const promo = agreement.deliverableSubmissions.find((item) => item.checkpoint === "promo") ?? null;
  const finalCut = agreement.deliverableSubmissions.find((item) => item.checkpoint === "final_cut") ?? null;
  const publication = agreement.publications[0] ?? null;
  const latestSubmission = finalCut ?? promo;
  const completedSteps: string[] = [];
  if (agreement.status !== AGREEMENT_STATUS.draft && agreement.status !== AGREEMENT_STATUS.acceptedOffchain) {
    completedSteps.push("Contract accepted", "Escrow funded");
  }
  if (promo) completedSteps.push("Promotional concept submitted");
  if (promo?.status === DELIVERABLE_STATUS.approved) completedSteps.push("Promotional concept approved", "10% base payment released");
  if (finalCut) completedSteps.push("Private final cut submitted");
  if (finalCut?.status === DELIVERABLE_STATUS.approved) completedSteps.push("Private final cut approved", "20% base payment released");
  if (publication?.status === "verified" || publication?.status === "retention" || publication?.status === "completed") completedSteps.push("Publication verified", "60% base payment released");

  let deliveryStatus = "awaiting_submission";
  let currentStep = "accept_contract";
  let creatorAction: string | null = null;
  let sponsorAction: string | null = null;

  if (agreement.status === AGREEMENT_STATUS.draft || agreement.status === AGREEMENT_STATUS.acceptedOffchain) {
    creatorAction = "accept";
  } else if (agreement.status === AGREEMENT_STATUS.completed) {
    deliveryStatus = latestSubmission?.status === DELIVERABLE_STATUS.approved ? "approved" : "awaiting_submission";
    currentStep = "completed";
  } else if (!promo || promo.status === DELIVERABLE_STATUS.changesRequested) {
    currentStep = promo ? "revise_promo" : "submit_promo";
    creatorAction = promo ? "revise_promo" : "submit_promo";
  } else if (promo.status === DELIVERABLE_STATUS.submitted) {
    deliveryStatus = "in_review";
    currentStep = "review_promo";
    sponsorAction = "review";
  } else if (!finalCut || finalCut.status === DELIVERABLE_STATUS.changesRequested) {
    currentStep = finalCut ? "revise_final_cut" : "submit_final_cut";
    creatorAction = finalCut ? "revise_final_cut" : "submit_final_cut";
  } else if (finalCut.status === DELIVERABLE_STATUS.submitted) {
    deliveryStatus = "in_review";
    currentStep = "review_final_cut";
    sponsorAction = "review";
  } else if (!publication) {
    deliveryStatus = "approved_for_publication";
    currentStep = "publish";
    creatorAction = "publish";
  } else if (publication.status === "verification_required") {
    deliveryStatus = "changes_requested";
    currentStep = "publish";
    creatorAction = "publish";
  } else {
    deliveryStatus = publication.status;
    currentStep = publication.status === "completed" ? "completed" : "retention";
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
    ["submit_promo", "Submit promotional concept"],
    ["review_promo", "Sponsor reviews concept"],
    ["submit_final_cut", "Submit private final cut"],
    ["review_final_cut", "Sponsor reviews final cut"],
    ["publish", "Publish verified video"],
    ["retention", "Complete live window"],
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

  const creator = creators.find((candidate) =>
    candidate.id === agreement.contractInvite?.creatorProfileId
    || candidate.walletAddress?.toLowerCase() === participant.walletAddress.toLowerCase(),
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
