import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useResource } from "../../lib/useResource";
import { ContractTable } from "../../ui/ContractTable";
import { KpiRow } from "../../ui/KpiRow";
import { Banner, ButtonLink, PageHeader, SectionHeading } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";

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
        action={data.walletConnected ? <ButtonLink to={`/sponsor/${sponsorId}/contracts/new`}><Icon name="plus" width="16" height="16" /> New contract</ButtonLink> : <ButtonLink to="/accounts">Connect wallet</ButtonLink>}
      />
      <KpiRow
        items={[
          { label: "Escrowed", value: totals.escrowedCapAmount, money: true },
          { label: "Released", value: totals.releasedPayoutAmount, money: true },
          { label: "Pending", value: totals.pendingPayoutAmount, money: true },
          { label: "Contracts", value: String(totals.totalContracts) },
        ]}
      />
      <div className="mt-10">
        <SectionHeading
          title="Recent contracts"
          description={`${totals.byStatus.draft ?? 0} draft · ${totals.byStatus.active ?? 0} active · ${totals.byStatus.completed ?? 0} completed`}
          action={<ButtonLink variant="ghost" to={`/sponsor/${sponsorId}/contracts`}>View all <Icon name="arrow" width="14" height="14" /></ButtonLink>}
        />
        <ContractTable
          contracts={contracts}
          counterparty="creator"
          hrefFor={(contract) => `/sponsor/${sponsorId}/contracts/${contract.id}`}
        />
      </div>
    </div>
  );
}
