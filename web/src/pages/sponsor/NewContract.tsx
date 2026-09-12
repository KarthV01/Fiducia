import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatUsdc, usdcToUnits } from "../../lib/money";
import type { SocialProfile } from "../../lib/types";
import { useResource } from "../../lib/useResource";
import { Banner, Button, Field, Input, PageHeader, RequiredMark, Select, Textarea } from "../../ui/primitives";

type MilestoneRow = {
  views: string;
  bonusUsdc: string;
};

type BonusRow = {
  metricKey: string;
  label: string;
  threshold: string;
  bonusUsdc: string;
};

export function NewContractPage() {
  const navigate = useNavigate();
  const { sponsorId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { data, error, loading } = useResource(`contract-builder-${sponsorId}`, () => api.contractBuilder(sponsorId));
  const [creatorProfileId, setCreatorProfileId] = useState(searchParams.get("creatorProfileId") ?? "");
  const [creatorQuery, setCreatorQuery] = useState("");
  const [creatorResults, setCreatorResults] = useState<SocialProfile[]>([]);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [deadline, setDeadline] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const [baseUsdc, setBaseUsdc] = useState("");
  const [capUsdc, setCapUsdc] = useState("");
  const [promoRequirements, setPromoRequirements] = useState("Sponsor message and disclosure concept");
  const [finalCutRequirements, setFinalCutRequirements] = useState("Complete pre-publication video containing the approved promotion");
  const [publicationRequirements, setPublicationRequirements] = useState("Publish the approved final cut on the contracted creator channel");
  const [retentionDays, setRetentionDays] = useState("7");
  const [meteredStart, setMeteredStart] = useState("");
  const [meteredRate, setMeteredRate] = useState("");
  const [meteredCap, setMeteredCap] = useState("");
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ views: "", bonusUsdc: "" }]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCreator = creatorResults.find((creator) => creator.profileId === creatorProfileId) ?? null;
  const preview = useMemo(() => {
    try {
      const base = BigInt(usdcToUnits(baseUsdc || "0"));
      const milestoneTotal = milestones.reduce(
        (sum, row) => sum + (row.bonusUsdc.trim() ? BigInt(usdcToUnits(row.bonusUsdc)) : 0n),
        0n,
      );
      const bonusTotal = bonuses.reduce(
        (sum, row) => sum + (row.bonusUsdc.trim() ? BigInt(usdcToUnits(row.bonusUsdc)) : 0n),
        0n,
      );
      const meteredMaximum = meteredCap.trim() ? BigInt(usdcToUnits(meteredCap)) : 0n;
      const defined = base + milestoneTotal + bonusTotal + meteredMaximum;
      const cap = capUsdc.trim() ? BigInt(usdcToUnits(capUsdc)) : defined;
      return { defined: defined.toString(), cap: cap.toString(), valid: cap >= defined };
    } catch {
      return null;
    }
  }, [baseUsdc, bonuses, capUsdc, milestones, meteredCap]);

  useEffect(() => {
    const fromQuery = searchParams.get("creatorProfileId");
    if (fromQuery) {
      setCreatorProfileId(fromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    void api.searchProfiles(`sponsor:${sponsorId}`, { relationship: "connected", profileType: "creator" })
      .then((result) => setCreatorResults(result.items))
      .catch(() => undefined);
  }, [sponsorId]);

  if (loading) {
    return <p className="text-sm text-muted">Loading builder...</p>;
  }

  if (error || !data) {
    return <Banner>{error ?? "Unable to load the contract builder."}</Banner>;
  }

  async function searchCreators() {
    setCreatorLoading(true);
    setFormError(null);
    try {
      const result = await api.searchProfiles(`sponsor:${sponsorId}`, { q: creatorQuery, relationship: "connected", profileType: "creator" });
      setCreatorResults(result.items);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not search creators");
    } finally {
      setCreatorLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const basePayoutAmount = usdcToUnits(baseUsdc);
      const viewMilestones = milestones
        .filter((row) => row.views.trim() && row.bonusUsdc.trim())
        .map((row) => ({
          views: row.views.trim(),
          bonusAmount: usdcToUnits(row.bonusUsdc),
        }));
      const metricBonuses = bonuses
        .filter((row) => row.metricKey && row.label.trim() && row.threshold.trim() && row.bonusUsdc.trim())
        .map((row) => ({
          metricKey: row.metricKey,
          label: row.label.trim(),
          threshold: row.threshold.trim(),
          bonusAmount: usdcToUnits(row.bonusUsdc),
        }));
      const defined =
        BigInt(basePayoutAmount) +
        viewMilestones.reduce((sum, row) => sum + BigInt(row.bonusAmount), 0n) +
        metricBonuses.reduce((sum, row) => sum + BigInt(row.bonusAmount), 0n) +
        BigInt(meteredCap.trim() ? usdcToUnits(meteredCap) : "0");
      const totalCapAmount = capUsdc.trim() ? usdcToUnits(capUsdc) : defined.toString();
      if (BigInt(totalCapAmount) < defined) {
        throw new Error("Total cap must cover the base payout and all bonuses.");
      }

      const created = await api.createContract(sponsorId, {
        creatorProfileId,
        title,
        deliverableDescription: deliverable,
        deadline: `${deadline}T00:00:00.000Z`,
        measurementWindowDays: Number(windowDays),
        basePayoutAmount,
        totalCapAmount,
        viewMilestones,
        metricBonuses,
        promoRequirements,
        finalCutRequirements,
        publicationRequirements,
        retentionDays: Number(retentionDays),
        meteredViews: meteredStart && meteredRate && meteredCap ? { startsAtViews: meteredStart, amountPerThousandViews: usdcToUnits(meteredRate), maximumAmount: usdcToUnits(meteredCap) } : undefined,
      });
      navigate(`/sponsor/${sponsorId}/contracts/${created.agreement.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create contract");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="New contract"
        description={`Send an invitation to a creator account. ${data.token.symbol} escrow funds when the creator accepts.`}
      />
      {formError ? (
        <div className="mb-4">
          <Banner>{formError}</Banner>
        </div>
      ) : null}
      <form className="space-y-6" onSubmit={onSubmit}>
        <section className="rounded-[8px] border-2 border-ink/20 bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">
            Creator account
            <RequiredMark />
          </h2>
          <div className="mt-3 flex gap-2">
            <Input
              value={creatorQuery}
              onChange={(event) => setCreatorQuery(event.target.value)}
              placeholder="Search by handle or name"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creatorLoading || creatorQuery.trim().length < 2}
              onClick={searchCreators}
            >
              {creatorLoading ? "Searching..." : "Search"}
            </Button>
          </div>
          {creatorProfileId ? (
            <p className="mt-3 text-sm text-muted">
              Selected{" "}
              <span className="font-medium text-ink">
                {selectedCreator ? `${selectedCreator.displayName} (${selectedCreator.handle})` : creatorProfileId}
              </span>
            </p>
          ) : null}
          {creatorResults.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {creatorResults.map((creator) => {
                const selected = creator.profileId === creatorProfileId;
                return (
                  <button
                    key={creator.id}
                    type="button"
                    className={`rounded-[6px] border-2 px-3 py-2 text-left transition-colors ${
                      selected ? "border-accent bg-accent-soft" : "border-ink/15 hover:border-ink/35 hover:bg-accent-soft"
                    }`}
                    onClick={() => setCreatorProfileId(creator.profileId)}
                  >
                    <div className="text-sm font-semibold text-ink">{creator.displayName}</div>
                    <div className="text-xs text-muted">
                      {creator.handle} - {creator.descriptor}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <Field label="Title" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <Field label="Deliverable" required>
          <Textarea rows={4} value={deliverable} onChange={(event) => setDeliverable(event.target.value)} required />
        </Field>
        <section className="space-y-4 rounded-[8px] border-2 border-ink/20 bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">Approval criteria</h2>
          <Field label="Promotional concept requirements" required><Textarea rows={3} value={promoRequirements} onChange={(event) => setPromoRequirements(event.target.value)} required /></Field>
          <Field label="Private final-cut requirements" required><Textarea rows={3} value={finalCutRequirements} onChange={(event) => setFinalCutRequirements(event.target.value)} required /></Field>
          <Field label="Publication requirements" required><Textarea rows={3} value={publicationRequirements} onChange={(event) => setPublicationRequirements(event.target.value)} required /></Field>
          <Field label="Required live window (days)" required><Input type="number" min={1} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} required /></Field>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Deadline" required>
            <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
          </Field>
          <Field label="Measurement window (days)" required>
            <Input type="number" min={1} value={windowDays} onChange={(event) => setWindowDays(event.target.value)} required />
          </Field>
          <Field label="Base payout (USDC)" required>
            <Input value={baseUsdc} onChange={(event) => setBaseUsdc(event.target.value)} required />
          </Field>
          <Field label="Total cap (USDC)" hint="Must cover base plus bonuses" required>
            <Input value={capUsdc} onChange={(event) => setCapUsdc(event.target.value)} required />
          </Field>
        </div>

        <section className="rounded-[8px] border-2 border-ink/20 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">View milestones</h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMilestones((rows) => [...rows, { views: "", bonusUsdc: "" }])}
            >
              Add row
            </Button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Views</span>
              <span>Bonus USDC</span>
              <span className="w-[72px]">Action</span>
            </div>
            {milestones.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  aria-label="Views"
                  value={row.views}
                  onChange={(event) =>
                    setMilestones((rows) => rows.map((item, itemIndex) => (itemIndex === index ? { ...item, views: event.target.value } : item)))
                  }
                />
                <Input
                  aria-label="Bonus USDC"
                  value={row.bonusUsdc}
                  onChange={(event) =>
                    setMilestones((rows) =>
                      rows.map((item, itemIndex) => (itemIndex === index ? { ...item, bonusUsdc: event.target.value } : item)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMilestones((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[8px] border-2 border-ink/20 bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">Metered view earnings</h2>
          <p className="mt-1 text-sm text-muted">Optional capped payment per 1,000 verified views above a starting point.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Starts after views"><Input value={meteredStart} onChange={(event) => setMeteredStart(event.target.value)} /></Field>
            <Field label="USDC per 1,000"><Input value={meteredRate} onChange={(event) => setMeteredRate(event.target.value)} /></Field>
            <Field label="Maximum USDC"><Input value={meteredCap} onChange={(event) => setMeteredCap(event.target.value)} /></Field>
          </div>
        </section>

        <section className="rounded-[8px] border-2 border-ink/20 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Other metric bonuses</h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setBonuses((rows) => [
                  ...rows,
                  { metricKey: data.metrics[0]?.key ?? "", label: "", threshold: "", bonusUsdc: "" },
                ])
              }
            >
              Add row
            </Button>
          </div>
          {bonuses.length === 0 ? <p className="text-sm text-muted">Optional. Use this for likes or referral conversions.</p> : null}
          <div className="space-y-2">
            {bonuses.map((row, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Metric</span>
                  <Select
                    value={row.metricKey}
                    onChange={(event) =>
                      setBonuses((rows) =>
                        rows.map((item, itemIndex) => (itemIndex === index ? { ...item, metricKey: event.target.value } : item)),
                      )
                    }
                  >
                    {data.metrics.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Label</span>
                  <Input
                    value={row.label}
                    onChange={(event) =>
                      setBonuses((rows) => rows.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Threshold</span>
                  <Input
                    value={row.threshold}
                    onChange={(event) =>
                      setBonuses((rows) =>
                        rows.map((item, itemIndex) => (itemIndex === index ? { ...item, threshold: event.target.value } : item)),
                      )
                    }
                  />
                </label>
                <div className="flex items-end gap-2">
                  <label className="block flex-1">
                    <span className="mb-1 block text-xs text-muted">Bonus USDC</span>
                    <Input
                      value={row.bonusUsdc}
                      onChange={(event) =>
                        setBonuses((rows) =>
                          rows.map((item, itemIndex) => (itemIndex === index ? { ...item, bonusUsdc: event.target.value } : item)),
                        )
                      }
                    />
                  </label>
                  <Button type="button" variant="ghost" onClick={() => setBonuses((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-between rounded-[8px] border-2 border-ink/20 bg-surface px-4 py-3 text-sm">
          <div>
            <div className="text-muted">Defined payouts / cap</div>
            <div className="tabular-nums text-ink">
              {hasPayoutInput(baseUsdc, capUsdc, milestones, bonuses) && preview
                ? `${formatUsdc(preview.defined)} / ${formatUsdc(preview.cap)}`
                : "Enter payout amounts"}
              {preview && !preview.valid ? " - cap is too low" : ""}
            </div>
          </div>
          <Button
            type="submit"
            disabled={
              submitting ||
              !creatorProfileId ||
              !title.trim() ||
              !deliverable.trim() ||
              !deadline ||
              !windowDays.trim() ||
              !baseUsdc.trim() ||
              !capUsdc.trim() ||
              (preview ? !preview.valid : true)
            }
          >
            {submitting ? "Sending..." : "Send invite"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function hasPayoutInput(baseUsdc: string, capUsdc: string, milestones: MilestoneRow[], bonuses: BonusRow[]): boolean {
  return Boolean(
    baseUsdc.trim() ||
      capUsdc.trim() ||
      milestones.some((row) => row.views.trim() || row.bonusUsdc.trim()) ||
      bonuses.some((row) => row.threshold.trim() || row.bonusUsdc.trim()),
  );
}
