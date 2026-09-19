import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { EnrichedAgreement } from "../../lib/types";
import { useResource } from "../../lib/useResource";
import { ContractPanel } from "../../ui/ContractPanel";
import { Banner, PageHeader } from "../../ui/primitives";
import { CreatorSocialDeliverables } from "../../ui/SocialDeliverables";

export function CreatorContractDetailPage() {
  const { creatorId = "", id = "" } = useParams();
  const { data, error, loading, reload } = useResource(`creator-contract-${creatorId}-${id}`, () =>
    api.creatorContract(creatorId, id),
  );
  const [contract, setContract] = useState<EnrichedAgreement | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const view = contract ?? data;
  const connections = useResource(`creator-contract-connections-${creatorId}`, () => api.socialConnections(creatorId));
  const evidence = useResource(`creator-contract-evidence-${creatorId}-${id}`, () => api.creatorMeasurementEvidence(creatorId, id));

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
        variant="creator"
        busy={busy}
        error={actionError}
        message={message}
        onSubmitDeliverable={async (checkpoint, file, notes, onProgress, existing, signal) => {
          setBusy(true);
          setActionError(null);
          setMessage(null);
          try {
            const uploadId = await api.uploadCheckpointFile(creatorId, view.id, checkpoint, file, onProgress, existing, signal);
            await api.submitCheckpoint(creatorId, view.id, checkpoint, { uploadId, notes: notes || undefined, attested: true });
            const refreshed = await api.creatorContract(creatorId, view.id);
            setContract(refreshed);
            setMessage(`${checkpoint === "promo" ? "Promotional concept" : "Final cut"} submitted for private review.`);
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") setMessage("Upload paused. Choose the same file and resume when ready.");
            else setActionError(err instanceof Error ? err.message : "Could not submit deliverable");
          } finally {
            setBusy(false);
            reload();
          }
        }}
        onPublish={async (input) => {
        try {
          setBusy(true);
          setActionError(null);
          await api.createPublication(creatorId, view.id, input);
          setMessage(input.method === "service" ? "Publication submitted to YouTube for processing." : "Manual publication submitted for fingerprint verification.");
          setContract(await api.creatorContract(creatorId, view.id));
        } catch (nextError) {
          setActionError(nextError instanceof Error ? nextError.message : "Could not start publication");
        } finally {
          setBusy(false);
          reload();
        }
        }}
        onConnectYouTube={async () => {
        setBusy(true);
        setActionError(null);
        try {
          const connection = await api.connectYouTube(creatorId, view.id);
          window.location.assign(connection.authorizationUrl);
        } catch (nextError) {
          setActionError(nextError instanceof Error ? nextError.message : "Could not connect YouTube");
          setBusy(false);
        }
        }}
      />
      {view.agreementContents?.length ? <CreatorSocialDeliverables creatorId={creatorId} agreementId={view.id} contents={view.agreementContents} connections={connections.data?.connections ?? []} evidence={evidence.data?.contents ?? []} onChanged={() => { reload(); evidence.reload(); }} /> : null}
    </div>
  );
}
