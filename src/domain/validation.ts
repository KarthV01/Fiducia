import { z } from "zod";
import { CONDITION_OPERATOR, PAYOUT_KIND, REVIEW_DECISION } from "./status.js";

const positiveIntegerString = z.string().regex(/^[1-9]\d*$/, "Must be a positive integer string");
const nonNegativeIntegerString = z.string().regex(/^(0|[1-9]\d*)$/, "Must be an integer string");
const walletAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be an EVM wallet address");
const metricKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "Use dotted metric keys like youtube.video.views");

const participantSchema = z.object({
  walletAddress,
  handle: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
});

const conditionSchema = z.object({
  metricKey,
  operator: z.literal(CONDITION_OPERATOR.gte),
  threshold: nonNegativeIntegerString,
});

const payoutSchema = z
  .object({
    kind: z.enum([PAYOUT_KIND.base, PAYOUT_KIND.promo, PAYOUT_KIND.finalCut, PAYOUT_KIND.publication, PAYOUT_KIND.retention, PAYOUT_KIND.bonus]),
    label: z.string().min(1),
    amount: positiveIntegerString,
    condition: conditionSchema.optional(),
  })
  .superRefine((payout, ctx) => {
    if (payout.kind !== PAYOUT_KIND.bonus && payout.condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["condition"],
        message: "Base payouts cannot have metric conditions",
      });
    }

    if (payout.kind === PAYOUT_KIND.bonus && !payout.condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["condition"],
        message: "Bonus payouts require a metric condition",
      });
    }
  });

export const createAgreementSchema = z
  .object({
    title: z.string().min(1).optional(),
    deliverableDescription: z.string().min(1),
    deadline: z.string().datetime(),
    measurementWindowDays: z.number().int().positive().default(30),
    totalCapAmount: positiveIntegerString,
    tokenAddress: walletAddress.optional(),
    participants: z.object({
      brand: participantSchema,
      creator: participantSchema,
    }),
    payouts: z.array(payoutSchema).min(1),
    basePayoutAmount: positiveIntegerString.optional(),
    performancePoolAmount: nonNegativeIntegerString.optional(),
    promoRequirements: z.string().optional(),
    finalCutRequirements: z.string().optional(),
    publicationRequirements: z.string().optional(),
    publicationDeadline: z.string().datetime().optional(),
    retentionDays: z.number().int().positive().default(7),
    performanceRules: z.array(z.object({
      kind: z.enum(["fixed", "metered"]),
      threshold: positiveIntegerString.optional(),
      amount: positiveIntegerString.optional(),
      startsAtViews: nonNegativeIntegerString.optional(),
      amountPerThousandViews: positiveIntegerString.optional(),
      maximumAmount: positiveIntegerString.optional(),
    })).default([]),
  })
  .superRefine((agreement, ctx) => {
    const basePayouts = agreement.payouts.filter((payout) => payout.kind === PAYOUT_KIND.base);
    const milestoneKinds = [PAYOUT_KIND.promo, PAYOUT_KIND.finalCut, PAYOUT_KIND.publication, PAYOUT_KIND.retention];
    const hasMilestones = milestoneKinds.every((kind) => agreement.payouts.filter((payout) => payout.kind === kind).length === 1);
    if (basePayouts.length !== 1 && !hasMilestones) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payouts"],
        message: "One legacy base payout or all four milestone payouts are required",
      });
    }

    const totalPayouts = agreement.payouts.reduce((sum, payout) => sum + BigInt(payout.amount), 0n);
    const meteredCap = agreement.performanceRules.filter((rule) => rule.kind === "metered").reduce((sum, rule) => sum + BigInt(rule.maximumAmount ?? "0"), 0n);
    if (totalPayouts + meteredCap > BigInt(agreement.totalCapAmount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalCapAmount"],
        message: "Total cap must cover the sum of all defined payouts",
      });
    }
  });

export const metricObservationSchema = z.object({
  metricKey,
  value: nonNegativeIntegerString,
  source: z.string().min(1).default("simulation"),
  observedAt: z.string().datetime().optional(),
});

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;
export type MetricObservationInput = z.infer<typeof metricObservationSchema>;

export const deliverableReviewSchema = z
  .object({
    decision: z.enum([REVIEW_DECISION.changesRequested, REVIEW_DECISION.approved]),
    comment: z.string().trim().max(5000).optional(),
    failedCriteria: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .superRefine((review, ctx) => {
    if (review.decision === REVIEW_DECISION.changesRequested && (!review.comment || review.failedCriteria.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Revision feedback is required" });
    }
  });

export type DeliverableReviewInput = z.infer<typeof deliverableReviewSchema>;
