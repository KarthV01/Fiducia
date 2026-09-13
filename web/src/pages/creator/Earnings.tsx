import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatDate, formatNumber, partyName, truncateHash } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import type { EnrichedAgreement, Payout } from "../../lib/types";
import { useResource } from "../../lib/useResource";
import { KpiRow } from "../../ui/KpiRow";
import { Banner, CopyText, EmptyState, PageHeader, StatusPill } from "../../ui/primitives";

type PayoutRow = {
  payout: Payout;
  contract: EnrichedAgreement;
};

export function CreatorEarningsPage() {
  const { creatorId = "" } = useParams();
  const { data, error, loading } = useResource(`creator-contracts-${creatorId}`, () =>
    api.creatorContracts(creatorId),
  );

  if (loading) {
    return <p className="text-sm text-muted">Loading earnings...</p>;
  }

  if (error || !data) {
    return <Banner>{error ?? "Unable to load earnings."}</Banner>;
  }

  const rows = data.flatMap((contract) =>
    contract.payouts.map((payout) => ({
      payout,
      contract,
    })),
  );
  const pendingRows = rows
    .filter(({ payout }) => payout.status === "pending")
    .sort((a, b) => new Date(a.contract.deadline).getTime() - new Date(b.contract.deadline).getTime());
  const releasedRows = rows
    .filter(({ payout }) => payout.status === "released")
    .sort((a, b) => releasedTime(b.payout) - releasedTime(a.payout));

  return (
    <div>
      <PageHeader title="Earnings" description="Released payouts and pending opportunities across creator contracts." />
      <KpiRow
        items={[
          { label: "Released", value: sumRows(releasedRows), money: true },
          { label: "Pending", value: sumRows(pendingRows), money: true },
          { label: "Paid payouts", value: String(releasedRows.length) },
          { label: "Pending payouts", value: String(pendingRows.length) },
        ]}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink">Pending opportunities</h2>
        <PayoutTable rows={pendingRows} emptyLabel="No pending payouts." />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink">Payout history</h2>
        <PayoutTable rows={releasedRows} emptyLabel="No released payouts yet." />
      </section>
    </div>
  );
}

function PayoutTable({ rows, emptyLabel }: { rows: PayoutRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-rule text-[11px] uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-2.5 font-medium">Payout</th>
            <th className="px-4 py-2.5 font-medium">Contract</th>
            <th className="px-4 py-2.5 font-medium">Sponsor</th>
            <th className="px-4 py-2.5 font-medium">Amount</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payout, contract }) => (
            <tr key={`${contract.id}-${payout.id}`} className="border-b border-rule last:border-b-0">
              <td className="px-4 py-3">
                <div className="font-medium text-ink">{payout.label}</div>
                <div className="text-xs capitalize text-muted">{payout.kind}</div>
              </td>
              <td className="px-4 py-3 text-muted">{contract.title ?? "Untitled"}</td>
              <td className="px-4 py-3 text-muted">{partyName(contract.sponsorProfile)}</td>
              <td className="px-4 py-3 tabular-nums">{formatUsdc(payout.amount)}</td>
              <td className="px-4 py-3">
                <StatusPill status={payout.status} />
                {payout.releasedAt ? <div className="mt-1 text-xs text-muted">{formatDate(payout.releasedAt)}</div> : null}
              </td>
              <td className="px-4 py-3 text-muted">{payoutDetail(payout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function payoutDetail(payout: Payout) {
  if (payout.releasedTxHash) {
    return <CopyText value={payout.releasedTxHash} label={truncateHash(payout.releasedTxHash)} />;
  }

  if (payout.condition) {
    return `${payout.condition.metric.key} >= ${formatNumber(payout.condition.threshold)}`;
  }

  return "Delivery approval";
}

function sumRows(rows: PayoutRow[]): string {
  return rows.reduce((sum, row) => sum + BigInt(row.payout.amount), 0n).toString();
}

function releasedTime(payout: Payout): number {
  return payout.releasedAt ? new Date(payout.releasedAt).getTime() : 0;
}
