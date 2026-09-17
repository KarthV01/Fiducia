import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, partyName } from "../lib/format";
import { formatUsdc } from "../lib/money";
import type { ContractSummary } from "../lib/types";
import { EmptyState, StatusPill } from "./primitives";

export function ContractTable({
  contracts,
  hrefFor,
  counterparty,
  emptyLabel = "No contracts yet.",
  onAccept,
  acceptBlocked = false,
}: {
  contracts: ContractSummary[];
  hrefFor: (contract: ContractSummary) => string;
  counterparty: "creator" | "sponsor";
  emptyLabel?: string;
  onAccept?: (inviteId: string) => void;
  acceptBlocked?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (contracts.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-rule text-[11px] uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">{counterparty === "creator" ? "Creator" : "Sponsor"}</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Cap</th>
            <th className="px-4 py-2.5 font-medium">{counterparty === "creator" ? "Released" : "Earned"}</th>
            <th className="px-4 py-2.5 font-medium">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const expanded = expandedId === contract.id;
            const action = counterparty === "creator" ? contract.workflow.sponsorAction : contract.workflow.creatorAction;
            return (
            <Fragment key={contract.id}>
            <tr className="cursor-pointer border-b border-rule transition-colors last:border-0 hover:bg-ink/5" onClick={() => setExpandedId(expanded ? null : contract.id)}>
              <td className="px-4 py-3">
                <button type="button" className="inline-flex items-center gap-2 rounded-[6px] border-2 border-transparent px-2 py-1 font-semibold text-ink transition-colors hover:border-ink/25 hover:bg-accent-soft">
                  {contract.title ?? "Untitled contract"}
                  <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
                </button>
              </td>
              <td className="px-4 py-3 text-muted">
                {partyName(counterparty === "creator" ? contract.creatorProfile : contract.sponsorProfile)}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={contract.status} />
              </td>
              <td className="px-4 py-3 tabular-nums">{formatUsdc(contract.financials.totalCapAmount)}</td>
              <td className="px-4 py-3 tabular-nums">{formatUsdc(contract.financials.releasedPayoutAmount)}</td>
              <td className="px-4 py-3 text-muted">{formatDate(contract.deadline)}</td>
            </tr>
            {expanded ? (
              <tr className="border-b border-rule bg-canvas">
                <td colSpan={6} className="px-6 py-5">
                  <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">What remains</div>
                      <ol className="mt-3 grid gap-2 text-sm">
                        {contract.workflow.completedSteps.map((step) => <li key={step}>✓ {step}</li>)}
                        {contract.workflow.remainingSteps.map((step, index) => (
                          <li key={step} className={index === 0 ? "font-semibold text-ink" : "text-muted"}>○ {step}</li>
                        ))}
                      </ol>
                    </div>
                    {action === "accept" && acceptBlocked ? <button type="button" disabled className="inline-flex h-9 items-center justify-center rounded-[6px] border border-warning-rule bg-warning-soft px-3.5 text-sm font-medium text-warning opacity-80">Wallet required</button> : action === "accept" && contract.workflow.inviteId && onAccept ? (
                      <button type="button" onClick={() => onAccept(contract.workflow.inviteId!)} className="inline-flex h-9 items-center justify-center rounded-[6px] bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">Accept contract</button>
                    ) : (
                      <Link to={hrefFor(contract)} className="inline-flex h-9 items-center justify-center rounded-[6px] bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover">
                        {action ? actionLabel(action) : "View full contract"}
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ) : null}
            </Fragment>
          )})}
        </tbody>
      </table>
    </div>
  );
}

function actionLabel(action: string) {
  return ({
    accept: "Accept contract",
    submit_promo: "Upload promotional concept",
    revise_promo: "Upload concept revision",
    submit_final_cut: "Upload private final cut",
    revise_final_cut: "Upload final-cut revision",
    publish: "Publish approved video",
    review: "Review deliverable",
  } as Record<string, string>)[action] ?? "View full contract";
}
