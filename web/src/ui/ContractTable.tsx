import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, partyName } from "../lib/format";
import { formatUsdc } from "../lib/money";
import type { ContractSummary } from "../lib/types";
import { buttonClass, EmptyState, StatusPill } from "./primitives";
import { Icon } from "./Icon";

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
    <div className="overflow-x-auto rounded-xl border border-rule bg-surface shadow-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-rule bg-canvas/60 text-xs text-muted">
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">Title</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{counterparty === "creator" ? "Creator" : "Sponsor"}</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">Cap</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{counterparty === "creator" ? "Released" : "Earned"}</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const expanded = expandedId === contract.id;
            const action = counterparty === "creator" ? contract.workflow.sponsorAction : contract.workflow.creatorAction;
            return (
            <Fragment key={contract.id}>
            <tr className={`cursor-pointer border-b border-rule transition-colors last:border-0 ${expanded ? "bg-canvas/60" : "hover:bg-canvas/60"}`} onClick={() => setExpandedId(expanded ? null : contract.id)}>
              <td className="px-4 py-3">
                <button type="button" aria-expanded={expanded} className="-ml-1 inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-left font-medium text-ink">
                  <Icon name="chevron" width="14" height="14" className={`shrink-0 text-muted transition-transform ${expanded ? "" : "-rotate-90"}`} />
                  {contract.title ?? "Untitled contract"}
                </button>
              </td>
              <td className="px-4 py-3 text-muted">
                {partyName(counterparty === "creator" ? contract.creatorProfile : contract.sponsorProfile)}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={contract.status} />
              </td>
              <td className="px-4 py-3 font-medium tabular-nums">{formatUsdc(contract.financials.totalCapAmount)}</td>
              <td className="px-4 py-3 font-medium tabular-nums">{formatUsdc(contract.financials.releasedPayoutAmount)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(contract.deadline)}</td>
            </tr>
            {expanded ? (
              <tr className="border-b border-rule bg-canvas/60">
                <td colSpan={6} className="px-6 pt-1 pb-5 pl-11">
                  <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <div className="text-xs font-medium text-muted">Progress</div>
                      <ol className="mt-2.5 grid gap-1.5 text-sm">
                        {contract.workflow.completedSteps.map((step) => <li key={step} className="flex items-center gap-2 text-muted"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" width="10" height="10" strokeWidth="3" /></span><span className="line-through decoration-rule">{step}</span></li>)}
                        {contract.workflow.remainingSteps.map((step, index) => (
                          <li key={step} className={`flex items-center gap-2 ${index === 0 ? "font-medium text-ink" : "text-muted"}`}><span aria-hidden="true" className={`h-4 w-4 rounded-full border-[1.5px] ${index === 0 ? "border-accent" : "border-rule"}`} />{step}</li>
                        ))}
                      </ol>
                    </div>
                    {action === "accept" && acceptBlocked ? <button type="button" disabled className={buttonClass("secondary", "text-warning")}><Icon name="lock" width="14" height="14" /> Wallet required</button> : action === "accept" && contract.workflow.inviteId && onAccept ? (
                      <button type="button" onClick={() => onAccept(contract.workflow.inviteId!)} className={buttonClass()}>Accept contract</button>
                    ) : (
                      <Link to={hrefFor(contract)} className={buttonClass()}>
                        {action ? actionLabel(action) : "View full contract"} <Icon name="arrow" width="14" height="14" />
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
