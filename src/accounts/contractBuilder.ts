import { z } from "zod";
import type { CreatorProfile, SponsorProfile } from "@prisma/client";
import { CONDITION_OPERATOR, PAYOUT_KIND } from "../domain/status.js";
import { createAgreementSchema, type CreateAgreementInput } from "../domain/validation.js";
import { SOCIAL_PROVIDERS, type SocialProvider } from "../social/types.js";

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
  metricKey: z.string().optional(),
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
  platformDeliverables: z.array(z.object({ provider: z.enum(SOCIAL_PROVIDERS), requirements: z.string().min(1) })).min(1).default([{ provider: "youtube", requirements: "Publish the approved final cut on the contracted creator channel" }]),
}).superRefine((input, ctx) => {
  if (new Set(input.platformDeliverables.map((item) => item.provider)).size !== input.platformDeliverables.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["platformDeliverables"], message: "Choose each platform only once" });
  const providers = new Set(input.platformDeliverables.map((item) => item.provider));
  input.metricBonuses.forEach((bonus, index) => { if (![...providers].some((provider) => bonus.metricKey.startsWith(`${provider}.`))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["metricBonuses", index, "metricKey"], message: "Metric must belong to a selected publishing platform" }); });
  input.viewMilestones.forEach((milestone, index) => { if (milestone.metricKey && ![...providers].some((provider) => milestone.metricKey!.startsWith(`${provider}.`))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["viewMilestones", index, "metricKey"], message: "Metric must belong to a selected publishing platform" }); });
  if (input.meteredViews && !providers.has("youtube")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["meteredViews"], message: "Metered view earnings currently require a YouTube deliverable" });
});

export type ContractInviteFormInput = z.infer<typeof contractInviteFormSchema>;

export function buildAgreementInputFromContractInvite(
  input: ContractInviteFormInput,
  sponsor: SponsorProfile,
  creator: CreatorProfile & { walletAddress: string },
  tokenAddress?: string,
): CreateAgreementInput {
  const base = BigInt(input.basePayoutAmount);
  const promoAmount = (base * 10n) / 100n;
  const finalCutAmount = (base * 20n) / 100n;
  const retentionAmounts = splitAmount((base * 10n) / 100n, input.platformDeliverables.length);
  const publicationAmounts = splitAmount(base - promoAmount - finalCutAmount - retentionAmounts.reduce((sum, amount) => sum + amount, 0n), input.platformDeliverables.length);
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
    platformDeliverables: input.platformDeliverables,
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
      ...input.platformDeliverables.flatMap((deliverable, index) => [
        { kind: PAYOUT_KIND.publication, label: `${platformLabel(deliverable.provider)} verified publication`, amount: publicationAmounts[index].toString(), platform: deliverable.provider },
        { kind: PAYOUT_KIND.retention, label: `${platformLabel(deliverable.provider)} live-window retention`, amount: retentionAmounts[index].toString(), platform: deliverable.provider },
      ]),
      ...input.viewMilestones.map((milestone) => ({
        kind: PAYOUT_KIND.bonus,
        label: `${milestone.views} views milestone`,
        amount: milestone.bonusAmount,
        condition: {
          metricKey: milestone.metricKey ?? viewMetric(input.platformDeliverables[0].provider),
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

function splitAmount(total: bigint, parts: number) {
  const quotient = total / BigInt(parts);
  const remainder = total % BigInt(parts);
  return Array.from({ length: parts }, (_, index) => quotient + (BigInt(index) < remainder ? 1n : 0n));
}

function platformLabel(provider: SocialProvider) { return provider === "x" ? "X" : provider[0].toUpperCase() + provider.slice(1); }
function viewMetric(provider: SocialProvider) { return provider === "instagram" ? "instagram.media.views" : provider === "x" ? "x.post.impression" : `${provider}.video.views`; }
