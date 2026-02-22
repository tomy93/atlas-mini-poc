"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ApiErrorResponse,
  PromotionsSection,
  QueryInput,
  QueryResponse,
  SectionKey,
  TextSection,
} from "@/lib/types";

const hotelOptions = [{ value: "amanzoe_gr", label: "Amanzoe (Greece)" }];
const travelerOptions = [
  { value: "honeymoon", label: "Honeymoon" },
  { value: "multi_gen_family", label: "Multi-gen Family" },
  { value: "solo_wellness", label: "Solo / Wellness" },
  { value: "corporate_executive", label: "Corporate / Executive" },
] as const;
const seasonOptions = [
  { value: "late_september", label: "Late September" },
  { value: "peak_summer", label: "Peak Summer (Jul-Aug)" },
  { value: "shoulder_apr_may", label: "Shoulder Season (Apr-May)" },
  { value: "low_nov_mar", label: "Low (Nov-Mar)" },
] as const;
const roleOptions = [
  { value: "reservations", label: "Reservations" },
  { value: "marketing", label: "Marketing" },
  { value: "destination_specialist", label: "Destination Specialist" },
  { value: "finance", label: "Finance (internal sensitive)" },
] as const;

const targetSectionOptions: Array<{ value: string; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "positioning", label: "Positioning" },
  { value: "travelerFit", label: "Traveler Fit" },
  { value: "risks", label: "Risks" },
  { value: "promotions", label: "Promotions" },
  { value: "ujvPov", label: "UJV POV" },
];

const defaultForm: QueryInput = {
  hotelId: "amanzoe_gr",
  travelerType: "honeymoon",
  season: "late_september",
  includeRisks: true,
  includePromotions: true,
  includeUjvPov: true,
  role: "reservations",
  useLLM: false,
};

const tooltipDefinitions = {
  evidenceStrength: "Composite score based on citation coverage, recency, and source reliability.",
  semanticChunksUsed: "Contextual text snippets retrieved via keyword matching to support narrative.",
  structuredFactsUsed: "Canonical hotel model fields that contributed to this section.",
  conflictsIgnored: "Semantic notes excluded because they contradicted canonical structured data.",
  canonicalOverridesNotes: "Indicates that official structured data overrode conflicting semantic notes.",
  policyCompliance: "Checks whether required sources meet internal data freshness limits.",
  allSourcesWithinFreshnessPolicy: "Verifies that each source is within its allowed age window by type.",
  escalationRequired: "Triggered when evidence strength is below threshold or policy checks fail.",
} as const;

type EnrichmentSignal = {
  hotelId: string;
  travelerType: QueryInput["travelerType"];
  season: QueryInput["season"];
  role: QueryInput["role"];
  helpful: boolean;
  missingInsight: string;
  targetSection: "positioning" | "travelerFit" | "risks" | "promotions" | "ujvPov" | "unknown";
  createdAt: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{children}</label>;
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Show definition"
        className="ml-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold text-slate-600"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-30 mt-2 w-72 max-w-[280px] rounded-md bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-lg transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

function CitationList({ citations }: { citations: TextSection["citations"] | PromotionsSection["citations"] }) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Citations</div>
      {citations.length === 0 ? (
        <p className="text-sm text-slate-500">No citations returned.</p>
      ) : (
        <ul className="space-y-3">
          {citations.map((c) => (
            <li key={c.sourceId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">{c.title}</div>
              <div className="mt-1 text-xs text-slate-600">
                {c.author} | {c.date} | {c.system}
              </div>
              <div className="mt-2 text-sm text-slate-700">{c.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TextSectionCard({
  title,
  icon,
  section,
}: {
  title: string;
  icon: string;
  section: TextSection;
}) {
  const lines = section.content.split("\n").filter(Boolean);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">
        <span className="mr-2">{icon}</span>
        {title}
      </h3>

      <div className="mt-3 space-y-2 text-sm text-slate-800">
        {lines.map((line, idx) => (
          <p key={`${idx}-${line.slice(0, 12)}`} className="leading-6">
            {line}
          </p>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        Retrieval Breakdown:{" "}
        <span className="inline-flex items-center">
          Structured facts used
          <InfoTooltip text={tooltipDefinitions.structuredFactsUsed} />
        </span>
        : {section.retrievalBreakdown.structuredFactsCount} |{" "}
        <span className="inline-flex items-center">
          Semantic chunks used
          <InfoTooltip text={tooltipDefinitions.semanticChunksUsed} />
        </span>
        : {section.retrievalBreakdown.semanticChunksCount} | Overrides applied: {section.retrievalBreakdown.overridesApplied ? "YES" : "NO"} |{" "}
        <span className="inline-flex items-center">
          Conflicts ignored
          <InfoTooltip text={tooltipDefinitions.conflictsIgnored} />
        </span>
        : {section.retrievalBreakdown.conflictsIgnoredCount}
      </div>

      {section.semanticChunksUsed.length > 0 ? (
        <details className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span className="inline-flex items-center">
              Semantic chunks used
              <InfoTooltip text={tooltipDefinitions.semanticChunksUsed} />
            </span>{" "}
            ({section.semanticChunksUsed.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {section.semanticChunksUsed.map((chunk) => (
              <li key={chunk.chunkId} className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="font-medium text-slate-900">{chunk.title}</div>
                <div className="text-xs text-slate-600">{chunk.date} | rel {chunk.reliability}</div>
                <div className="mt-1">{chunk.text}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {section.conflictsIgnored.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-amber-900">
            Conflicts ignored
            <InfoTooltip text={tooltipDefinitions.conflictsIgnored} />
          </div>
          <ul className="mt-2 space-y-2 text-sm text-amber-900">
            {section.conflictsIgnored.map((conflict) => (
              <li key={`${conflict.chunkId}-${conflict.structuredRuleRef}`}>
                {conflict.chunkId}: {conflict.reason} (ref: {conflict.structuredRuleRef})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CitationList citations={section.citations} />
    </section>
  );
}

function PromotionsCard({ section }: { section: PromotionsSection }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">
        <span className="mr-2">🎁</span>
        Active Promotions (Deterministic)
      </h3>

      {section.status === "INSUFFICIENT_SOURCES" ? (
        <p className="mt-3 text-sm text-slate-700">Insufficient verified sources to answer this section.</p>
      ) : (
        <div className="mt-3 space-y-4 text-sm text-slate-800">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Active promos</div>
            <ul className="mt-2 space-y-3">
              {section.content.promos.map((promo) => (
                <li key={promo.promoId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900">{promo.name}</div>
                  <div className="mt-1">{promo.description}</div>
                  <div className="mt-2 text-xs text-slate-700">
                    Booking: {promo.validity.bookingFrom} to {promo.validity.bookingTo} | Travel: {promo.validity.travelFrom} to {promo.validity.travelTo}
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    {promo.eligibility.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Stacking rules</div>
            <ul className="mt-2 space-y-2">
              {section.content.stackingRules.map((rule) => (
                <li key={rule.ruleId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">{rule.ruleId}</div>
                  <div className="mt-1">{rule.text}</div>
                  <div className="mt-1 text-xs text-slate-600">Allows combination: {rule.allowsCombination ? "YES" : "NO"}</div>
                  {rule.appliesToPromoIds.length > 0 ? (
                    <div className="mt-1 text-xs text-slate-600">Applies to: {rule.appliesToPromoIds.join(", ")}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {section.conflictsIgnored.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="inline-flex items-center text-xs font-semibold uppercase tracking-wide">
            Canonical overrides notes
            <InfoTooltip text={tooltipDefinitions.canonicalOverridesNotes} />
          </div>
          <ul className="mt-2 space-y-1">
            {section.conflictsIgnored.map((conflict) => (
              <li key={`${conflict.chunkId}-${conflict.structuredRuleRef}`}>
                {conflict.chunkId}: {conflict.reason} (ref: {conflict.structuredRuleRef})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CitationList citations={section.citations} />
    </section>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "!"}</span>
      <span className="text-slate-800">{label}</span>
    </div>
  );
}

export default function Home() {
  const [form, setForm] = useState<QueryInput>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<QueryResponse | null>(null);

  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [missingInsight, setMissingInsight] = useState("");
  const [targetSection, setTargetSection] = useState<EnrichmentSignal["targetSection"]>("unknown");
  const [toast, setToast] = useState<string | null>(null);
  const [enrichmentSignal, setEnrichmentSignal] = useState<EnrichmentSignal | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);

  const canSubmitFeedback = helpful !== null;

  const submitQuery = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = (await res.json()) as QueryResponse | ApiErrorResponse;
      if (!res.ok) {
        setResponse(null);
        setError(`${(json as ApiErrorResponse).error}: ${(json as ApiErrorResponse).details ?? "Request failed"}`);
        return;
      }

      setResponse(json as QueryResponse);
    } catch (e) {
      setResponse(null);
      setError(e instanceof Error ? e.message : "Unexpected network error");
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (helpful === null) return;
    const signal: EnrichmentSignal = {
      hotelId: form.hotelId,
      travelerType: form.travelerType,
      season: form.season,
      role: form.role,
      helpful,
      missingInsight,
      targetSection,
      createdAt: new Date().toISOString(),
    };
    setEnrichmentSignal(signal);
    setToast("Feedback captured (demo).");
    window.setTimeout(() => setToast(null), 2500);
  };

  const trustChecks = useMemo(() => {
    if (!response) return null;
    const g = response.trust.guardrails;
    return [
      { label: "Canonical data overrides conflicting notes", ok: g.canonicalOverridesNotes },
      { label: "Promotions derived only from contract data", ok: g.promotionsFromContractOnly },
      { label: "All sections backed by citations", ok: g.allSectionsBackedByCitations },
      { label: "Sensitive data restricted by role", ok: g.sensitiveDataRestrictedByRole },
      { label: "All sources within freshness policy", ok: g.withinFreshnessPolicy === "PASS" },
    ];
  }, [response]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">UJV Atlas — Knowledge Platform Validation</h1>
              <p className="mt-1 text-sm font-medium text-slate-700">Thin Operational Slice (Internal Demo)</p>
              <p className="mt-2 text-sm text-slate-600">Controlled flows, grounded output, citations required.</p>
            </div>
            <div className="sm:pt-1">
              <button
                type="button"
                onClick={() => setShowGlossary((v) => !v)}
                className="text-sm text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              >
                ℹ️ Data Model Glossary
              </button>
            </div>
          </div>
        </header>
        {showGlossary ? (
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-100 p-4 text-xs leading-5 text-slate-700">
            <div className="font-semibold text-slate-900">STRUCTURED (CANONICAL) DATA</div>
            <p className="mt-1">
              Governed, contract-backed fields from the official hotel model (e.g., promotions, stacking rules,
              positioning tags). These define business truth.
            </p>
            <div className="mt-3 font-semibold text-slate-900">UNSTRUCTURED (SEMANTIC) NOTES</div>
            <p className="mt-1">
              Contextual text snippets (emails, advisor briefs, web content) used for narrative support. These cannot
              override canonical data.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <form onSubmit={submitQuery} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Query</h2>
              <p className="mt-1 text-xs text-slate-500">Structured inputs only. No free conversation.</p>

              <div className="mt-4 space-y-4">
                <div>
                  <FieldLabel>Hotel</FieldLabel>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.hotelId}
                    onChange={(e) => setForm((prev) => ({ ...prev, hotelId: e.target.value }))}
                  >
                    {hotelOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel>Traveler Type</FieldLabel>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.travelerType}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, travelerType: e.target.value as QueryInput["travelerType"] }))
                    }
                  >
                    {travelerOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel>Season</FieldLabel>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.season}
                    onChange={(e) => setForm((prev) => ({ ...prev, season: e.target.value as QueryInput["season"] }))}
                  >
                    {seasonOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.includeRisks}
                      onChange={(e) => setForm((prev) => ({ ...prev, includeRisks: e.target.checked }))}
                    />
                    Include Risks
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.includePromotions}
                      onChange={(e) => setForm((prev) => ({ ...prev, includePromotions: e.target.checked }))}
                    />
                    Include Active Promotions
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.includeUjvPov}
                      onChange={(e) => setForm((prev) => ({ ...prev, includeUjvPov: e.target.checked }))}
                    />
                    Include UJV POV
                  </label>
                </div>

                <div>
                  <FieldLabel>Role Context</FieldLabel>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as QueryInput["role"] }))}
                  >
                    {roleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span>AI-Assisted Narrative (optional)</span>
                  <input
                    type="checkbox"
                    checked={form.useLLM}
                    onChange={(e) => setForm((prev) => ({ ...prev, useLLM: e.target.checked }))}
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Generating..." : "Generate Structured Brief"}
                </button>
              </div>
            </form>
          </aside>

          <main className="space-y-4 lg:col-span-6">
            {error ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
            ) : null}

            {!response ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 shadow-sm">
                Select a structured flow and generate a brief. Results will render as citation-backed section cards here.
              </div>
            ) : (
              <div className="space-y-4">
                <TextSectionCard title="Positioning" icon="🏨" section={response.sections.positioning} />
                <TextSectionCard title="Traveler Fit" icon="💍" section={response.sections.travelerFit} />
                {response.sections.risks ? <TextSectionCard title="Risks / Caveats" icon="⚠" section={response.sections.risks} /> : null}
                {response.sections.promotions ? <PromotionsCard section={response.sections.promotions} /> : null}
                {response.sections.ujvPov ? <TextSectionCard title="UJV POV / Talk Track" icon="🧠" section={response.sections.ujvPov} /> : null}
              </div>
            )}
          </main>

          <aside className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Trust & Governance</h2>
              {!response ? (
                <p className="mt-3 text-sm text-slate-600">Trust metrics appear after a brief is generated.</p>
              ) : (
                <div className="mt-4 space-y-5 text-sm">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center font-medium text-slate-800">
                        Evidence Strength
                        <InfoTooltip text={tooltipDefinitions.evidenceStrength} />
                      </span>
                      <span className="text-slate-700">
                        {response.trust.evidenceStrengthLabel} ({response.trust.evidenceStrengthScore.toFixed(2)})
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200">
                      <div
                        className={`h-2 rounded-full ${
                          response.trust.evidenceStrengthScore >= 0.75
                            ? "bg-emerald-500"
                            : response.trust.evidenceStrengthScore >= 0.6
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.round(response.trust.evidenceStrengthScore * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Source Freshness</div>
                    <div className="space-y-1 text-slate-800">
                      <div>Promotions Last Verified: {response.trust.freshness.promotionsLastVerifiedDate ?? "N/A"}</div>
                      <div>Most Recent Site Visit: {response.trust.freshness.mostRecentSiteVisitDate ?? "N/A"}</div>
                      <div>Last feedback date: {response.trust.freshness.lastFeedbackDate ?? "N/A"}</div>
                      <div>Last semantic chunk date: {response.trust.freshness.lastSemanticChunkDate ?? "N/A"}</div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Retrieval stats</div>
                    <div className="space-y-1 text-slate-800">
                      <div>Structured sources used: {response.trust.stats.structuredSourcesUsed}</div>
                      <div>Unstructured sources used: {response.trust.stats.unstructuredSourcesUsed}</div>
                      <div>
                        <span className="inline-flex items-center">
                          Semantic chunks used
                          <InfoTooltip text={tooltipDefinitions.semanticChunksUsed} />
                        </span>
                        : {response.trust.stats.semanticChunksUsed}
                      </div>
                      <div>
                        <span className="inline-flex items-center">
                          Structured facts used
                          <InfoTooltip text={tooltipDefinitions.structuredFactsUsed} />
                        </span>
                        : {response.trust.stats.structuredFactsUsed}
                      </div>
                      <div>
                        <span className="inline-flex items-center">
                          Conflicts ignored
                          <InfoTooltip text={tooltipDefinitions.conflictsIgnored} />
                        </span>
                        : {response.trust.stats.conflictsIgnored}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Validation Checks</div>
                    <div className="space-y-1">
                      {trustChecks?.map((check) => (
                        <div key={check.label} className="flex items-start">
                          <CheckRow label={check.label} ok={check.ok} />
                          {check.label === "All sources within freshness policy" ? (
                            <InfoTooltip text={tooltipDefinitions.allSourcesWithinFreshnessPolicy} />
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-sm text-slate-800">
                      <span className="inline-flex items-center">
                        Escalation Required
                        <InfoTooltip text={tooltipDefinitions.escalationRequired} />
                      </span>
                      :{" "}
                      <span className={response.trust.escalationNeeded ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>{response.trust.escalationNeeded ? "YES" : "NO"}</span>
                    </div>
                    {response.trust.escalationNeeded ? (
                      <div className="mt-1 text-xs text-slate-700">{response.trust.escalationReason}</div>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Policy</div>
                    <div className="text-slate-800">
                      <span className="inline-flex items-center">
                        Policy Compliance
                        <InfoTooltip text={tooltipDefinitions.policyCompliance} />
                      </span>
                      : {response.trust.policyCompliance}
                    </div>
                    <div className="text-slate-800">Policy check result: {response.trust.guardrails.withinFreshnessPolicy}</div>
                    {response.trust.guardrails.policyWarnings.length > 0 ? (
                      <ul className="mt-2 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                        {response.trust.guardrails.policyWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
{JSON.stringify(response.trust.policySnapshot, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Feedback</h2>
          <form onSubmit={handleFeedbackSubmit} className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-slate-800">Was this brief helpful?</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHelpful(true)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    helpful === true ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white"
                  }`}
                >
                  👍
                </button>
                <button
                  type="button"
                  onClick={() => setHelpful(false)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    helpful === false ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-300 bg-white"
                  }`}
                >
                  👎
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <FieldLabel>Missing insight?</FieldLabel>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={missingInsight}
                  onChange={(e) => setMissingInsight(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <FieldLabel>Target Section</FieldLabel>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={targetSection}
                  onChange={(e) => setTargetSection(e.target.value as EnrichmentSignal["targetSection"])}
                >
                  {targetSectionOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmitFeedback}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Submit Enrichment Signal
            </button>
          </form>

          {toast ? <div className="mt-3 text-sm text-emerald-700">{toast}</div> : null}

          {enrichmentSignal ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Structured enrichment signal (demo)</div>
              <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
{JSON.stringify(enrichmentSignal, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
