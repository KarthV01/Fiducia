import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { formatDate, formatNumber, partyName, truncateAddress, truncateHash } from "../lib/format";
import { formatUsdc } from "../lib/money";
import type { DeliverableReviewInput, EnrichedAgreement, MetricObservationInput, UploadSession } from "../lib/types";
import { Banner, Button, CopyText, Field, Input, Select, StatusPill, Textarea } from "./primitives";

export function ContractPanel({
  contract,
  variant,
  busy,
  message,
  error,
  onFund,
  onSubmitDeliverable,
  onReviewDeliverable,
  onRecordMetric,
  onPublish,
  onConnectYouTube,
}: {
  contract: EnrichedAgreement;
  variant: "sponsor" | "creator";
  busy?: boolean;
  message?: string | null;
  error?: string | null;
  onFund?: () => void;
  onSubmitDeliverable?: (checkpoint: "promo" | "final_cut", file: File, notes: string, onProgress: (value: number) => void, existing?: UploadSession, signal?: AbortSignal) => Promise<void>;
  onReviewDeliverable?: (submissionId: string, input: DeliverableReviewInput) => void;
  onRecordMetric?: (input: MetricObservationInput) => void;
  onPublish?: (input: { method: "manual"; youtubeUrl: string } | { method: "service"; title: string; description: string }) => Promise<void>;
  onConnectYouTube?: () => Promise<void>;
}) {
  const canFund = variant === "sponsor" && contract.status === "draft" && onFund;
  const canRecord = variant === "sponsor" && contract.status === "active" && contract.metrics.length > 0 && onRecordMetric;

  return (
    <div className="space-y-6">
      {error ? <Banner>{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      <DeliverableWorkflow
        contract={contract}
        variant={variant}
        busy={busy}
        onSubmit={onSubmitDeliverable}
        onReview={onReviewDeliverable}
        onPublish={onPublish}
        onConnectYouTube={onConnectYouTube}
      />

      {(canFund || canRecord) && (
        <section className="rounded-xl border border-rule bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Actions</h2>
          <p className="mt-1 text-sm text-muted">
            {variant === "sponsor"
              ? "Record performance after the approved deliverable starts accumulating results."
              : "Submit observed performance metrics for this active contract. File uploads are handled separately."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canFund ? (
              <Button type="button" disabled={busy} onClick={onFund}>
                Fund escrow
              </Button>
            ) : null}
          </div>
          {canRecord ? (
            <RecordPerformanceForm
              metrics={contract.metrics}
              busy={busy}
              onSubmit={(input) => onRecordMetric?.(input)}
            />
          ) : null}
        </section>
      )}

      <details className="rounded-xl border border-rule bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ink">Contract details, payouts, performance, and on-chain record</summary>
        <div className="space-y-6 border-t border-rule p-5">
      <section className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-2">
        <InfoCell label="Status">
          <StatusPill status={contract.status} />
        </InfoCell>
        <InfoCell label="Cap">{formatUsdc(contract.financials.totalCapAmount)}</InfoCell>
        <InfoCell label="Released">{formatUsdc(contract.financials.releasedPayoutAmount)}</InfoCell>
        <InfoCell label="Pending">{formatUsdc(contract.financials.pendingPayoutAmount)}</InfoCell>
        <InfoCell label="Deadline">{formatDate(contract.deadline)}</InfoCell>
        <InfoCell label="Measurement window">{contract.measurementWindowDays} days</InfoCell>
        <InfoCell label="Sponsor">{partyName(contract.sponsorProfile)}</InfoCell>
        <InfoCell label="Creator">{partyName(contract.creatorProfile)}</InfoCell>
      </section>

      <section className="rounded-xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">Deliverable</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{contract.deliverableDescription}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="border-b border-rule px-4 py-3 text-sm font-medium text-ink">Payout schedule</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-2.5 font-medium">Payout</th>
              <th className="px-4 py-2.5 font-medium">Condition</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {contract.payouts.map((payout) => (
              <tr key={payout.id} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{payout.label}</div>
                  <div className="text-xs capitalize text-muted">{payout.kind}</div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {payout.condition
                    ? `${payout.condition.metric.key} >= ${formatNumber(payout.condition.threshold)}`
                    : "On delivery approval"}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatUsdc(payout.amount)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={payout.status} />
                  {payout.releasedTxHash ? (
                    <div className="mt-1">
                      <CopyText value={payout.releasedTxHash} label={truncateHash(payout.releasedTxHash)} />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="border-b border-rule px-4 py-3 text-sm font-medium text-ink">Performance observations</div>
        {contract.observations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No observations recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Metric</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Observed</th>
              </tr>
            </thead>
            <tbody>
              {contract.observations.map((observation) => (
                <tr key={observation.id} className="border-b border-rule last:border-b-0">
                  <td className="px-4 py-3">{observation.metric.key}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(observation.value)}</td>
                  <td className="px-4 py-3 text-muted">{observation.source}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(observation.observedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">On-chain</h2>
        {contract.blockchainRecord ? (
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <HashRow label="Escrow" value={contract.blockchainRecord.escrowAddress} display={truncateAddress(contract.blockchainRecord.escrowAddress)} />
            <HashRow label="Create tx" value={contract.blockchainRecord.createTxHash} display={truncateHash(contract.blockchainRecord.createTxHash)} />
            <HashRow label="Terms hash" value={contract.blockchainRecord.termsHash} display={truncateHash(contract.blockchainRecord.termsHash)} />
            <HashRow label="Agreement key" value={contract.blockchainRecord.agreementKey} display={truncateHash(contract.blockchainRecord.agreementKey)} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">Escrow has not been funded yet.</p>
        )}
      </section>
        </div>
      </details>
    </div>
  );
}

function DeliverableWorkflow({
  contract,
  variant,
  busy,
  onSubmit,
  onReview,
  onPublish,
  onConnectYouTube,
}: {
  contract: EnrichedAgreement;
  variant: "sponsor" | "creator";
  busy?: boolean;
  onSubmit?: (checkpoint: "promo" | "final_cut", file: File, notes: string, onProgress: (value: number) => void, existing?: UploadSession, signal?: AbortSignal) => Promise<void>;
  onReview?: (submissionId: string, input: DeliverableReviewInput) => void;
  onPublish?: (input: { method: "manual"; youtubeUrl: string } | { method: "service"; title: string; description: string }) => Promise<void>;
  onConnectYouTube?: () => Promise<void>;
}) {
  const latest = contract.workflow.latestSubmission;
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState("");
  const [attested, setAttested] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [failedCriteria, setFailedCriteria] = useState<string[]>([]);
  const [uploadAbort, setUploadAbort] = useState<AbortController | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const creatorAction = contract.workflow.creatorAction;
  const maySubmit = variant === "creator" && !!creatorAction && creatorAction !== "accept" && creatorAction !== "publish";
  const checkpoint: "promo" | "final_cut" = creatorAction?.includes("final_cut") ? "final_cut" : "promo";
  const mayReview = variant === "sponsor" && contract.workflow.sponsorAction === "review" && latest;

  return (
    <section className="rounded-xl border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Next step</h2>
          <p className="mt-1 text-sm text-muted">Current step: {contract.workflow.currentStep.replaceAll("_", " ")}</p>
        </div>
        <StatusPill status={contract.workflow.deliveryStatus} />
      </div>

      <ol className="mt-4 grid gap-2 text-sm md:grid-cols-2">
        {contract.workflow.completedSteps.map((step) => <li key={step}>✓ {step}</li>)}
        {contract.workflow.remainingSteps.map((step, index) => <li key={step} className={index === 0 ? "font-semibold text-ink" : "text-muted"}>○ {step}</li>)}
      </ol>

      {latest ? (
        <div className="mt-5 rounded-[6px] border border-rule bg-canvas p-4 text-sm">
          <div className="flex items-center justify-between"><strong>Submission v{latest.version}</strong><StatusPill status={latest.status} /></div>
          {latest.upload ? <a className="mt-2 block text-accent underline" href={`/api/contracts/${contract.id}/artifacts/${latest.id}/content`} target="_blank" rel="noreferrer">Preview {latest.upload.fileName}</a> : null}
          {latest.proofUrl ? <a className="mt-2 block break-all text-accent underline" href={latest.proofUrl} target="_blank" rel="noreferrer">{latest.proofUrl}</a> : null}
          {latest.notes ? <p className="mt-2 whitespace-pre-wrap text-muted">{latest.notes}</p> : null}
          {latest.evidence.map((item) => <a key={item.id} className="mt-2 block break-all text-accent underline" href={item.url} target="_blank" rel="noreferrer">{item.label ?? item.url}</a>)}
          {latest.isLate ? <p className="mt-2 text-[#f49ba5]">Submitted after the contract deadline.</p> : null}
          {latest.reviews.map((review) => review.comment ? <p key={review.id} className="mt-3 border-l-2 border-ink/25 pl-3 text-muted"><strong>{review.decision.replaceAll("_", " ")}:</strong> {review.comment}</p> : null)}
          {latest.approvedTxHash ? <div className="mt-3"><CopyText value={latest.approvedTxHash} label={truncateHash(latest.approvedTxHash)} /></div> : null}
        </div>
      ) : null}

      {contract.deliverableSubmissions.length > 1 ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink">Earlier submission versions</summary>
          <div className="mt-3 space-y-3">
            {contract.deliverableSubmissions.slice(1).map((submission) => (
              <div key={submission.id} className="rounded-[6px] border border-rule p-3">
                <div className="flex justify-between"><strong>Version {submission.version}</strong><StatusPill status={submission.status} /></div>
                {submission.upload ? <a className="mt-2 block text-accent underline" href={`/api/contracts/${contract.id}/artifacts/${submission.id}/content`} target="_blank" rel="noreferrer">{submission.upload.fileName}</a> : null}
                {submission.reviews.map((review) => review.comment ? <p key={review.id} className="mt-2 text-muted">{review.comment}</p> : null)}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {maySubmit ? (
        <form className="mt-5 space-y-4" onSubmit={async (event) => { event.preventDefault(); if (file) { const controller = new AbortController(); setUploadAbort(controller); const resumable = contract.uploadSessions.find((upload) => upload.status === "uploading" && upload.checkpoint === checkpoint && upload.fileName === file.name && upload.totalSize === String(file.size)); try { await onSubmit?.(checkpoint, file, notes, setProgress, resumable, controller.signal); setFile(null); setNotes(""); setAttested(false); setProgress(0); } finally { setUploadAbort(null); } } }}>
          <p className="rounded-[6px] bg-accent-soft p-3 text-sm text-ink">{checkpoint === "promo" ? contract.promoRequirements ?? "Upload the promotional concept or script for private review." : contract.finalCutRequirements ?? "Upload the complete pre-publication final cut."}</p>
          <UploadDropzone
            checkpoint={checkpoint}
            file={file}
            error={fileError}
            onFile={(nextFile) => {
              setFile(nextFile);
              setFileError(null);
              setProgress(0);
            }}
            onError={(nextError) => {
              setFile(null);
              setFileError(nextError);
              setProgress(0);
            }}
          />
          <Field label="Submission notes"><Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where the integration appears, review notes, or supporting context" /></Field>
          <label className="flex gap-2 text-sm text-ink"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />I confirm this is the deliverable covered by this contract.</label>
          {progress > 0 ? <div className="h-2 overflow-hidden rounded bg-rule"><div className="h-full bg-accent" style={{ width: `${progress}%` }} /></div> : null}
          <div className="flex gap-2"><Button type="submit" disabled={busy || !file || !attested}>{contract.uploadSessions.some((upload) => upload.status === "uploading" && upload.checkpoint === checkpoint) ? "Resume upload" : creatorAction?.startsWith("revise") ? "Upload revision" : `Submit ${checkpoint === "promo" ? "concept" : "final cut"}`}</Button>{uploadAbort ? <Button type="button" variant="secondary" onClick={() => uploadAbort.abort()}>Pause</Button> : null}</div>
        </form>
      ) : null}

      {mayReview ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[6px] border border-rule p-3 text-sm">
            <strong>Locked requirements</strong>
            {(latest.checkpoint === "promo" ? contract.promoRequirements : contract.finalCutRequirements)?.split(/\r?\n|;/).filter(Boolean).map((criterion) => (
              <label key={criterion} className="mt-2 flex gap-2"><input type="checkbox" checked={failedCriteria.includes(criterion)} onChange={(event) => setFailedCriteria((current) => event.target.checked ? [...current, criterion] : current.filter((item) => item !== criterion))} />Mark unmet: {criterion}</label>
            ))}
          </div>
          <Field label="Review comment"><Textarea rows={4} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Feedback for the creator" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy || !reviewComment.trim() || failedCriteria.length === 0} onClick={() => onReview?.(latest.id, { decision: "changes_requested", comment: reviewComment, failedCriteria })}>Request changes</Button>
            <Button type="button" disabled={busy} onClick={() => { if (window.confirm("Approve this private artifact and irreversibly release its milestone payment?")) onReview?.(latest.id, { decision: "approved", comment: reviewComment || undefined, failedCriteria: [] }); }}>Approve milestone</Button>
          </div>
        </div>
      ) : null}

      {variant === "creator" && creatorAction === "publish" ? (
        <div className="mt-5 space-y-4">
          <p className="rounded-[6px] bg-accent-soft p-3 text-sm text-ink">The sponsor approved the exact private final cut. Publish that file through the connected channel, or submit its public YouTube URL for fingerprint verification. There is no second sponsor veto.</p>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onConnectYouTube?.()}>Connect YouTube channel</Button>
          <Button type="button" disabled={busy} onClick={() => onPublish?.({ method: "service", title: contract.title ?? "Sponsored video", description: contract.publicationRequirements ?? "" })}>Publish approved file through YouTube</Button>
          <div className="flex gap-2">
            <Input type="url" value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://youtube.com/watch?v=..." />
            <Button type="button" variant="secondary" disabled={busy || !manualUrl} onClick={() => onPublish?.({ method: "manual", youtubeUrl: manualUrl })}>Verify manual upload</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const FINAL_CUT_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const PROMO_MIME_TYPES = [
  ...FINAL_CUT_MIME_TYPES,
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_UPLOAD_BYTES = 5_000_000_000;

function UploadDropzone({
  checkpoint,
  file,
  error,
  onFile,
  onError,
}: {
  checkpoint: "promo" | "final_cut";
  file: File | null;
  error: string | null;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isFinalCut = checkpoint === "final_cut";
  const acceptedMimeTypes = isFinalCut ? FINAL_CUT_MIME_TYPES : PROMO_MIME_TYPES;
  const accept = isFinalCut
    ? FINAL_CUT_MIME_TYPES.join(",")
    : `${PROMO_MIME_TYPES.join(",")},.pdf,.txt,.doc,.docx`;

  const selectFile = (candidate?: File) => {
    if (!candidate) return;
    if (!acceptedMimeTypes.includes(candidate.type)) {
      onError(
        isFinalCut
          ? "Choose a video in MP4, MOV, or WebM format."
          : "Choose a supported video, image, PDF, text, or Word file.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (candidate.size <= 0 || candidate.size > MAX_UPLOAD_BYTES) {
      onError("Choose a file larger than 0 bytes and no larger than 5 GB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFile(candidate);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div className="mb-1.5 text-sm text-ink">
        {isFinalCut ? "Private final-cut video" : "Promotional concept file"}
        <span className="ml-0.5 text-[#f49ba5]" aria-hidden="true">*</span>
      </div>
      <input ref={inputRef} className="sr-only" type="file" accept={accept} onChange={handleInput} />
      <div
        className={`rounded-[8px] border-2 border-dashed px-5 py-7 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : error ? "border-[#c0392b] bg-[#332128]" : "border-ink/30 bg-canvas/45 hover:border-accent hover:bg-accent-soft/45"}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={handleDrop}
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink/20 bg-surface text-accent" aria-hidden="true">
          <UploadIcon />
        </div>
        {file ? (
          <>
            <p className="mt-3 break-all text-sm font-semibold text-ink">{file.name}</p>
            <p className="mt-1 text-xs text-muted">{formatFileSize(file.size)}</p>
            <button type="button" className="mt-3 text-sm font-medium text-accent underline underline-offset-2" onClick={() => inputRef.current?.click()}>Choose a different file</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-semibold text-ink">Drop your {isFinalCut ? "video" : "file"} here</p>
            <p className="mt-1 text-xs text-muted">or</p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => inputRef.current?.click()}>Browse files</Button>
          </>
        )}
        <p className="mt-3 text-xs text-muted">
          {isFinalCut ? "MP4, MOV, or WebM video only" : "Video, image, PDF, TXT, DOC, or DOCX"} · 5 GB max
        </p>
      </div>
      {error ? <p className="mt-1.5 text-xs text-[#f49ba5]" role="alert">{error}</p> : null}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className="mt-1 text-sm text-ink">{children}</div>
    </div>
  );
}

function HashRow({ label, value, display }: { label: string; value: string; display: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <CopyText value={value} label={display} />
    </div>
  );
}

function RecordPerformanceForm({
  metrics,
  busy,
  onSubmit,
}: {
  metrics: EnrichedAgreement["metrics"];
  busy?: boolean;
  onSubmit: (input: MetricObservationInput) => void;
}) {
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? "");
  const [value, setValue] = useState("");

  return (
    <form
      className="mt-5 grid gap-3 border-t border-rule pt-5 md:grid-cols-[1fr_160px_auto] md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ metricKey, value: value.trim() });
      }}
    >
      <Field label="Metric">
        <Select value={metricKey} onChange={(event) => setMetricKey(event.target.value)}>
          {metrics.map((metric) => (
            <option key={metric.id} value={metric.key}>
              {metric.label ?? metric.key}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Value" hint="Integer only">
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="100000" />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || !metricKey || !value.trim()}>
        Record performance
      </Button>
    </form>
  );
}
