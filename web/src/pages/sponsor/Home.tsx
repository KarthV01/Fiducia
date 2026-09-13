import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useResource } from "../../lib/useResource";
import { ContractTable } from "../../ui/ContractTable";
import { KpiRow } from "../../ui/KpiRow";
import { Banner, ButtonLink, PageHeader } from "../../ui/primitives";

export function SponsorHomePage() {
  const { sponsorId = "" } = useParams();
  const { data, error, loading } = useResource(`brand-dashboard-${sponsorId}`, () =>
    api.brandDashboard(sponsorId),
  );

  if (loading) {
    return <p className="text-sm text-muted">Loading dashboard...</p>;
  }

  if (error || !data) {
    return <Banner>{error ?? "Unable to load sponsor dashboard."}</Banner>;
  }

  const { totals, contracts } = data;

  return (
    <div>
      <PageHeader
        title="Workspace overview"
        description="Your partnerships, progress, and payments. All in one place."
        action={<ButtonLink to={`/sponsor/${sponsorId}/contracts/new`}>New contract</ButtonLink>}
      />
      <KpiRow
        items={[
          { label: "Escrowed", value: totals.escrowedCapAmount, money: true },
          { label: "Released", value: totals.releasedPayoutAmount, money: true },
          { label: "Pending", value: totals.pendingPayoutAmount, money: true },
          { label: "Contracts", value: String(totals.totalContracts) },
        ]}
      />
      <p className="mt-3 text-sm text-muted">
        {totals.byStatus.draft ?? 0} draft / {totals.byStatus.active ?? 0} active / {totals.byStatus.completed ?? 0}{" "}
        completed
      </p>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink">Recent contracts</h2>
        <ContractTable
          contracts={contracts}
          counterparty="creator"
          hrefFor={(contract) => `/sponsor/${sponsorId}/contracts/${contract.id}`}
        />
      </div>
    </div>
  );
}
