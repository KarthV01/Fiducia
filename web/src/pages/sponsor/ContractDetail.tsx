import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useResource } from "../../lib/useResource";
import type { EnrichedAgreement } from "../../lib/types";
import { ContractPanel } from "../../ui/ContractPanel";
import { Banner, PageHeader } from "../../ui/primitives";

export function SponsorContractDetailPage() {
  const { sponsorId = "", id = "" } = useParams();
  const { data, error, loading, reload } = useResource(`brand-contract-${sponsorId}-${id}`, () =>
    api.brandContract(sponsorId, id),
  );
  const [contract, setContract] = useState<EnrichedAgreement | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const view = contract ?? data;

  async function run(action: () => Promise<EnrichedAgreement | { releasedPayoutIds: string[]; agreement: EnrichedAgreement }>) {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await action();
      if ("agreement" in result) {
        setContract(result.agreement);
        setMessage(
          result.releasedPayoutIds.length > 0
            ? `Released ${result.releasedPayoutIds.length} payout${result.releasedPayoutIds.length === 1 ? "" : "s"}.`
            : "No new payouts released.",
        );
      } else {
        setContract(result);
        setMessage("Escrow funded.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (loading && !view) {
    return <p className="text-sm text-muted">Loading contract...</p>;
  }

  if ((error && !view) || !view) {
    return <Banner>{error ?? "Contract not found."}</Banner>;
  }

  return (
    <div>
      <PageHeader title={view.title ?? "Untitled contract"} description={view.id} />
      <ContractPanel
        contract={view}
        variant="sponsor"
        busy={busy}
        error={actionError}
        message={message}
        onReviewDeliverable={(submissionId, input) =>
          run(() => api.reviewDeliverable(sponsorId, view.id, submissionId, input))
        }
        onRecordMetric={(input) => run(() => api.recordBrandMetric(sponsorId, view.id, input))}
      />
    </div>
  );
}
