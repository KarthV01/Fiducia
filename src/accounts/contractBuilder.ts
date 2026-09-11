import { z } from "zod";
import type { CreatorProfile, SponsorProfile } from "@prisma/client";
import { CONDITION_OPERATOR, PAYOUT_KIND } from "../domain/status.js";
import { createAgreementSchema, type CreateAgreementInput } from "../domain/validation.js";

const positiveIntegerValue = z.union([
  z.string().regex(/^[1-9]\d*$/, "Must be a positive integer"),
  z.number().int().positive().safe(),
]);

function toIntegerString(value: string | number): string {
  return String(value);
}

const viewMilestoneSchema = z.object({
  views: positiveIntegerValue.transform(toIntegerString),
  bonusAmount: positiveIntegerValue.transform(toIntegerString),
});

const metricBonusSchema = z.object({
  metricKey: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Use dotted metric keys like youtube.video.views"),
  label: z.string().min(1),
  threshold: positiveIntegerValue.transform(toIntegerString),
  bonusAmount: positiveIntegerValue.transform(toIntegerString),
});

const meteredViewSchema = z.object({
  startsAtViews: positiveIntegerValue.transform(toIntegerString),
  amountPerThousandViews: positiveIntegerValue.transform(toIntegerString),
  maximumAmount: positiveIntegerValue.transform(toIntegerString),
}).optional();

export const contractInviteFormSchema = z.object({
  creatorProfileId: z.string().min(1),
  title: z.string().min(1),
  deliverableDescription: z.string().min(1),
  deadline: z.string().datetime(),
  measurementWindowDays: z.number().int().positive().default(30),
  basePayoutAmount: positiveIntegerValue.transform(toIntegerString),
  totalCapAmount: positiveIntegerValue.transform(toIntegerString),
  viewMilestones: z.array(viewMilestoneSchema).default([]),
  metricBonuses: z.array(metricBonusSchema).default([]),
  promoRequirements: z.string().min(1).default("Sponsor message and disclosure concept"),
  finalCutRequirements: z.string().min(1).default("Complete pre-publication video containing the approved promotion"),
  publicationRequirements: z.string().min(1).default("Publish the approved final cut on the contracted creator channel"),
  retentionDays: z.number().int().positive().default(7),
  meteredViews: meteredViewSchema,
});

export type ContractInviteFormInput = z.infer<typeof contractInviteFormSchema>;

export function buildAgreementInputFromContractInvite(
  input: ContractInviteFormInput,
  sponsor: SponsorProfile,
  creator: CreatorProfile,
  tokenAddress?: string,
): CreateAgreementInput {
  const base = BigInt(input.basePayoutAmount);
  const promoAmount = (base * 10n) / 100n;
  const finalCutAmount = (base * 20n) / 100n;
  const retentionAmount = (base * 10n) / 100n;
  const publicationAmount = base - promoAmount - finalCutAmount - retentionAmount;
  const fixedBonusTotal = input.viewMilestones.reduce((sum, row) => sum + BigInt(row.bonusAmount), 0n) + input.metricBonuses.reduce((sum, row) => sum + BigInt(row.bonusAmount), 0n);
  const meteredCap = BigInt(input.meteredViews?.maximumAmount ?? "0");
  return createAgreementSchema.parse({
    title: input.title,
    deliverableDescription: input.deliverableDescription,
    deadline: input.deadline,
    measurementWindowDays: input.measurementWindowDays,
    totalCapAmount: input.totalCapAmount,
    basePayoutAmount: input.basePayoutAmount,
    performancePoolAmount: (fixedBonusTotal + meteredCap).toString(),
    promoRequirements: input.promoRequirements,
    finalCutRequirements: input.finalCutRequirements,
    publicationRequirements: input.publicationRequirements,
    publicationDeadline: input.deadline,
    retentionDays: input.retentionDays,
    performanceRules: [
      ...input.viewMilestones.map((milestone) => ({ kind: "fixed", threshold: milestone.views, amount: milestone.bonusAmount })),
      ...(input.meteredViews ? [{ kind: "metered", ...input.meteredViews }] : []),
    ],
    tokenAddress,
    participants: {
      brand: {
        walletAddress: sponsor.walletAddress,
        handle: sponsor.handle,
        displayName: sponsor.name,
      },
      creator: {
        walletAddress: creator.walletAddress,
        handle: creator.handle,
        displayName: creator.displayName,
      },
    },
    payouts: [
      {
        kind: PAYOUT_KIND.promo, label: "Promotional concept approval", amount: promoAmount.toString(),
      },
      {
        kind: PAYOUT_KIND.finalCut, label: "Private final cut approval", amount: finalCutAmount.toString(),
      },
      {
        kind: PAYOUT_KIND.publication, label: "Verified publication", amount: publicationAmount.toString(),
      },
      {
        kind: PAYOUT_KIND.retention, label: "Live-window retention", amount: retentionAmount.toString(),
      },
      ...input.viewMilestones.map((milestone) => ({
        kind: PAYOUT_KIND.bonus,
        label: `${milestone.views} views milestone`,
        amount: milestone.bonusAmount,
        condition: {
          metricKey: "youtube.video.views",
          operator: CONDITION_OPERATOR.gte,
          threshold: milestone.views,
        },
      })),
      ...input.metricBonuses.map((bonus) => ({
        kind: PAYOUT_KIND.bonus,
        label: bonus.label,
        amount: bonus.bonusAmount,
        condition: {
          metricKey: bonus.metricKey,
          operator: CONDITION_OPERATOR.gte,
          threshold: bonus.threshold,
        },
      })),
    ],
  });
}
