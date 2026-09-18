import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useResource } from "../../lib/useResource";
import { ContractTable } from "../../ui/ContractTable";
import { KpiRow } from "../../ui/KpiRow";
import { Banner, Button, ButtonLink, PageHeader, StatusPill } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";
import { formatDate, partyName } from "../../lib/format";
import { formatUsdc } from "../../lib/money";

export function CreatorHomePage() {
  const { creatorId = "" } = useParams();
  const { data, error, loading, reload } = useResource(`creator-dashboard-${creatorId}`, () =>
    api.creatorDashboard(creatorId),
  );
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function acceptInvite(inviteId: string) {
    setBusyInvite(inviteId);
    setActionError(null);
    try {
      await api.acceptInvite(creatorId, inviteId);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusyInvite(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading dashboard...</p>;
  }

  if (error || !data) {
    return <Banner>{error ?? "Unable to load creator dashboard."}</Banner>;
  }

  const upcoming = [...data.contracts]
    .filter((contract) => contract.status !== "completed")
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const active = data.contracts.filter((contract) => contract.status === "active");

  return (
    <div>
      <PageHeader title="Workspace overview" description="Keep your collaborations moving. Track deadlines, contracts, and earnings." />
      {actionError ? (
        <div className="mb-4">
          <Banner>{actionError}</Banner>
        </div>
      ) : null}
      {!data.creator.walletAddress ? <div className="mb-7 flex flex-wrap items-center justify-between gap-5 rounded-xl border border-accent-rule bg-accent-soft p-5"><div className="flex items-start gap-4"><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-link"><Icon name="wallet" /></span><div><h2 className="font-medium text-ink">Connect a payout wallet</h2><p className="mt-1 max-w-2xl text-sm text-muted">Your profile is ready for networking and messages. Verify a browser or mobile wallet before entering a new contract or receiving future payouts.</p></div></div><ButtonLink to={`/creator/${creatorId}/wallets`}>Set up wallet</ButtonLink></div> : null}
      <KpiRow
        items={[
          { label: "Earned", value: data.totals.releasedPayoutAmount, money: true },
          { label: "Pending", value: data.totals.pendingPayoutAmount, money: true },
          { label: "Active contracts", value: String(data.totals.byStatus.active ?? 0) },
          { label: "Completed", value: String(data.totals.byStatus.completed ?? 0) },
        ]}
      />
      {data.pendingInvites.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-ink">Pending invitations</h2>
          <div className="grid gap-3">
            {data.pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-xl border border-rule bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      {invite.agreement.title ?? "Untitled contract"}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {partyName(invite.sponsorProfile)} - {formatUsdc(invite.agreement.totalCapAmount)} cap - due{" "}
                      {formatDate(invite.agreement.deadline)}
                    </div>
                    <div className="mt-2">
                      <StatusPill status={invite.status} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={busyInvite === invite.id || !data.creator.walletAddress}
                    onClick={() => acceptInvite(invite.id)}
                  >
                    {busyInvite === invite.id ? "Accepting..." : data.creator.walletAddress ? "Accept" : "Wallet required"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink">Current contracts</h2>
        <ContractTable
          contracts={active}
          counterparty="sponsor"
          emptyLabel="No active contracts."
          hrefFor={(contract) => `/creator/${creatorId}/contracts/${contract.id}`}
        />
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink">Upcoming deadlines</h2>
        <ContractTable
          contracts={upcoming}
          counterparty="sponsor"
          emptyLabel="No upcoming contracts."
          hrefFor={(contract) => `/creator/${creatorId}/contracts/${contract.id}`}
        />
      </div>
    </div>
  );
}
