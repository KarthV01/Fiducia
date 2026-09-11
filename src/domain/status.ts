export const AGREEMENT_STATUS = {
  draft: "draft",
  acceptedOffchain: "accepted_offchain",
  escrowCreated: "escrow_created",
  active: "active",
  completed: "completed",
} as const;

export const PARTICIPANT_ROLE = {
  brand: "brand",
  creator: "creator",
} as const;

export const PAYOUT_KIND = {
  base: "base",
  promo: "promo",
  finalCut: "final_cut",
  publication: "publication",
  retention: "retention",
  bonus: "bonus",
  metered: "metered",
} as const;

export const PAYOUT_STATUS = {
  pending: "pending",
  released: "released",
} as const;

export const CONDITION_OPERATOR = {
  gte: "gte",
} as const;

export const DELIVERABLE_STATUS = {
  submitted: "submitted",
  changesRequested: "changes_requested",
  approved: "approved",
} as const;

export const REVIEW_DECISION = {
  changesRequested: "changes_requested",
  approved: "approved",
} as const;

export const CHECKPOINT = { promo: "promo", finalCut: "final_cut" } as const;
export const UPLOAD_STATUS = { uploading: "uploading", complete: "complete" } as const;
export const PUBLICATION_STATUS = {
  pending: "pending", publishing: "publishing", verifying: "verifying", verified: "verified",
  verificationRequired: "verification_required", retention: "retention", completed: "completed", failed: "failed",
} as const;
