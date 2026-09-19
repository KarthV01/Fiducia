import { describe, expect, it } from "vitest";
import { buildAgreementInputFromContractInvite } from "../src/accounts/contractBuilder.js";

describe("multi-platform contract builder", () => {
  it("creates independent publication and retention payouts without changing the base total", () => {
    const agreement = buildAgreementInputFromContractInvite({
      creatorProfileId: "creator-1",
      title: "Short-form launch",
      deliverableDescription: "One approved post adapted for Instagram and TikTok.",
      deadline: "2026-10-30T00:00:00.000Z",
      measurementWindowDays: 30,
      basePayoutAmount: "1000000",
      totalCapAmount: "1000000",
      viewMilestones: [],
      metricBonuses: [],
      promoRequirements: "Approved concept",
      finalCutRequirements: "Approved platform-ready posts",
      publicationRequirements: "Publish with disclosure",
      retentionDays: 7,
      platformDeliverables: [
        { provider: "instagram", requirements: "Publish with disclosure" },
        { provider: "tiktok", requirements: "Publish with disclosure" },
      ],
    }, {
      id: "sponsor-1", userId: "user-1", name: "Sponsor", handle: "@sponsor", walletAddress: "0x1111111111111111111111111111111111111111", industry: "Software", websiteUrl: null, logoUrl: null, monthlyBudgetAmount: "0", createdAt: new Date(), updatedAt: new Date(),
    }, {
      id: "creator-1", userId: "user-2", displayName: "Creator", handle: "@creator", walletAddress: "0x2222222222222222222222222222222222222222", channelUrl: null, category: "Tech", averageViews: 0, audience: null, avatarUrl: null, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(agreement.payouts.filter((payout) => payout.kind === "publication")).toHaveLength(2);
    expect(agreement.payouts.filter((payout) => payout.kind === "retention")).toHaveLength(2);
    expect(agreement.payouts.reduce((sum, payout) => sum + BigInt(payout.amount), 0n)).toBe(1_000_000n);
    expect(agreement.platformDeliverables.map((item) => item.provider)).toEqual(["instagram", "tiktok"]);
  });
});
