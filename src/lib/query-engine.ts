import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Citation,
  ConflictEvent,
  HotelData,
  PromotionsSection,
  QueryInput,
  QueryPlan,
  QueryResponse,
  RetrievalBreakdown,
  RoleType,
  SectionKey,
  SourceRecord,
  SourceType,
  TextSection,
  TravelerType,
  UnstructuredChunk,
} from "@/lib/types";
import { roleTypes, seasonTypes, travelerTypes } from "@/lib/types";

const travelerLabels: Record<TravelerType, string> = {
  honeymoon: "Honeymoon",
  multi_gen_family: "Multi-gen Family",
  solo_wellness: "Solo / Wellness",
  corporate_executive: "Corporate / Executive",
};

const seasonLabels = {
  late_september: "Late September",
  peak_summer: "Peak Summer (Jul-Aug)",
  shoulder_apr_may: "Shoulder Season (Apr-May)",
  low_nov_mar: "Low (Nov-Mar)",
} as const;

const roleLabels: Record<RoleType, string> = {
  reservations: "Reservations",
  marketing: "Marketing",
  destination_specialist: "Destination Specialist",
  finance: "Finance",
};

const sectionKeywords: Record<SectionKey, string[]> = {
  positioning: ["privacy", "romantic", "service", "design", "nightlife"],
  travelerFit: ["traveler", "fit", "honeymoon", "family", "wellness", "executive"],
  risks: ["risk", "caveat", "transfer", "logistics", "nightlife"],
  promotions: ["promotion", "discount", "offer", "stack", "combinable"],
  ujvPov: ["talk track", "position", "qualify", "value drivers"],
};

const unstructuredSourceTypes = new Set<SourceType>([
  "site_visit",
  "post_trip_feedback",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function formatDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysOld(date: string, now = new Date()): number {
  const ts = new Date(date).getTime();
  return Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24));
}

function maxDate(dates: Array<string | null | undefined>): string | null {
  const valid = dates
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (!valid.length) return null;
  return new Date(Math.max(...valid)).toISOString().slice(0, 10);
}

async function readJson<T>(filename: string): Promise<T> {
  const filePath = path.join(process.cwd(), "data", filename);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function toCitation(source: SourceRecord): Citation {
  return {
    sourceId: source.sourceId,
    type: source.type,
    title: source.title,
    author: source.author,
    date: source.date,
    system: source.system,
    reliability: source.reliability,
    snippet: source.snippet,
    docRef: source.docRef,
  };
}

function validateInput(payload: unknown): QueryInput {
  if (!isRecord(payload)) {
    throw new Error("Invalid request body");
  }

  const body = payload as Record<string, unknown>;
  const travelerType = body.travelerType;
  const season = body.season;
  const role = body.role;

  if (typeof body.hotelId !== "string" || !body.hotelId) {
    throw new Error("hotelId is required");
  }
  if (typeof travelerType !== "string" || !travelerTypes.includes(travelerType as TravelerType)) {
    throw new Error("Invalid travelerType");
  }
  if (typeof season !== "string" || !seasonTypes.includes(season as (typeof seasonTypes)[number])) {
    throw new Error("Invalid season");
  }
  if (typeof role !== "string" || !roleTypes.includes(role as RoleType)) {
    throw new Error("Invalid role");
  }

  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    hotelId: body.hotelId,
    travelerType: travelerType as TravelerType,
    season: season as QueryInput["season"],
    includeRisks: bool(body.includeRisks, true),
    includePromotions: bool(body.includePromotions, true),
    includeUjvPov: bool(body.includeUjvPov, true),
    role: role as RoleType,
    useLLM: bool(body.useLLM, false),
  };
}

function buildQueryPlan(hotel: HotelData, input: QueryInput): QueryPlan {
  const sectionsRequested: SectionKey[] = ["positioning", "travelerFit"];
  if (input.includeRisks) sectionsRequested.push("risks");
  if (input.includePromotions) sectionsRequested.push("promotions");
  if (input.includeUjvPov) sectionsRequested.push("ujvPov");

  const globalTerms = uniq([
    hotel.name,
    hotel.region,
    travelerLabels[input.travelerType],
    seasonLabels[input.season],
    roleLabels[input.role],
  ]);

  const perSection: QueryPlan["queryTerms"]["perSection"] = {
    positioning: uniq([...globalTerms, ...sectionKeywords.positioning]),
    travelerFit: uniq([...globalTerms, ...sectionKeywords.travelerFit]),
  };

  if (input.includeRisks) {
    perSection.risks = uniq([...globalTerms, ...sectionKeywords.risks]);
  }
  if (input.includePromotions) {
    perSection.promotions = uniq([...globalTerms, ...sectionKeywords.promotions]);
  }
  if (input.includeUjvPov) {
    perSection.ujvPov = uniq([...globalTerms, ...sectionKeywords.ujvPov]);
  }

  return {
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    travelerType: input.travelerType,
    season: input.season,
    role: input.role,
    sectionsRequested,
    retrievalMode: input.useLLM && !!process.env.OPENAI_API_KEY ? "llm_assisted" : "mock_synthesis",
    queryTerms: { global: globalTerms, perSection },
    createdAt: new Date().toISOString(),
  };
}

function keywordScore(chunk: UnstructuredChunk, terms: string[]): number {
  const text = `${chunk.title} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t.trim()) continue;
    if (text.includes(t)) {
      score += t.includes(" ") ? 2 : 1;
    }
    const compact = t.replace(/[^a-z0-9]+/g, "");
    if (compact && compact !== t && text.replace(/[^a-z0-9]+/g, "").includes(compact)) {
      score += 1;
    }
  }
  return score;
}

function detectSemanticConflict(params: {
  chunk: UnstructuredChunk;
  section: SectionKey;
  hotel: HotelData;
}): ConflictEvent | null {
  const text = params.chunk.text.toLowerCase();
  const hasPromoStackClaim =
    (text.includes("stack") || text.includes("combine") || text.includes("combinable")) &&
    text.includes("4th") &&
    text.includes("early booking");

  if (hasPromoStackClaim) {
    const rule = params.hotel.contract.stackingRules.find(
      (r) => r.ruleId === "sr_nonstack_4nf_eb15" || (!r.allowsCombination && r.appliesToPromoIds.length > 0),
    );
    if (rule) {
      return {
        chunkId: params.chunk.chunkId,
        reason: "Chunk claims promo combinability that conflicts with contract stacking rules.",
        structuredRuleRef: `contract.stackingRules.${rule.ruleId}`,
      };
    }
  }

  const nightlifeConflictPhrases = ["nightlife-focused", "nightlife focused", "late-night scene"];
  const claimsNightlife = nightlifeConflictPhrases.some((p) => text.includes(p));
  const structuredSaysNightlifeLimited = !params.hotel.positioningTags.includes("nightlife");
  if (claimsNightlife && structuredSaysNightlifeLimited && params.section === "positioning") {
    return {
      chunkId: params.chunk.chunkId,
      reason: "Chunk conflicts with canonical positioning tags and site visit notes (privacy-led, not nightlife-led).",
      structuredRuleRef: "hotel.positioningTags",
    };
  }

  return null;
}

function retrieveSemanticChunks(params: {
  allChunks: UnstructuredChunk[];
  hotel: HotelData;
  section: SectionKey;
  terms: string[];
  topN?: number;
}): { used: UnstructuredChunk[]; conflictsIgnored: ConflictEvent[] } {
  const topN = params.topN ?? 3;
  const scored = params.allChunks
    .filter((c) => c.hotelId === params.hotel.hotelId)
    .map((c) => ({ chunk: c, score: keywordScore(c, params.terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.chunk.reliability - a.chunk.reliability);

  const used: UnstructuredChunk[] = [];
  const conflictsIgnored: ConflictEvent[] = [];

  for (const item of scored) {
    const conflict = detectSemanticConflict({ chunk: item.chunk, section: params.section, hotel: params.hotel });
    if (conflict) {
      conflictsIgnored.push(conflict);
      continue;
    }
    used.push(item.chunk);
    if (used.length >= topN) break;
  }

  return { used, conflictsIgnored };
}

function collectCitations(sourceIds: string[], sourceMap: Map<string, SourceRecord>): Citation[] {
  return uniq(sourceIds)
    .map((id) => sourceMap.get(id))
    .filter((s): s is SourceRecord => Boolean(s))
    .map(toCitation);
}

function buildRetrievalBreakdown(
  structuredFactsCount: number,
  semanticChunksCount: number,
  conflictsIgnoredCount: number,
): RetrievalBreakdown {
  return {
    structuredFactsCount,
    semanticChunksCount,
    overridesApplied: conflictsIgnoredCount > 0,
    conflictsIgnoredCount,
  };
}

function insufficientText(): string {
  return "Insufficient verified sources to answer this section.";
}

function renderBulletText(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function buildPositioningSection(params: {
  hotel: HotelData;
  sourceMap: Map<string, SourceRecord>;
  semantic: { used: UnstructuredChunk[]; conflictsIgnored: ConflictEvent[] };
  input: QueryInput;
}): TextSection {
  const { hotel, sourceMap, semantic, input } = params;
  const sourceIds = [...hotel.positioning.sourceIds];
  const citations = collectCitations(sourceIds, sourceMap);
  const facts = [
    `${hotel.name} is positioned as ${hotel.positioningTags.join(", ")}.`,
    ...hotel.positioning.strengths,
    hotel.seasonality[input.season],
  ];

  const status = citations.length === 0 ? "INSUFFICIENT_SOURCES" : "OK";
  const contentLines =
    status === "OK"
      ? [
          facts[0],
          `Core strengths: ${hotel.positioning.strengths.join("; ")}.`,
          hotel.seasonality[input.season],
          ...(semantic.used.length
            ? [`Supporting color (non-canonical): ${semantic.used.map((c) => c.title).join(", ")}.`]
            : []),
        ]
      : [insufficientText()];

  return {
    status,
    content: renderBulletText(contentLines),
    citations,
    semanticChunksUsed: semantic.used,
    retrievalBreakdown: buildRetrievalBreakdown(
      facts.length,
      semantic.used.length,
      semantic.conflictsIgnored.length,
    ),
    conflictsIgnored: semantic.conflictsIgnored,
  };
}

function buildTravelerFitSection(params: {
  hotel: HotelData;
  sourceMap: Map<string, SourceRecord>;
  semantic: { used: UnstructuredChunk[]; conflictsIgnored: ConflictEvent[] };
  input: QueryInput;
}): TextSection {
  const { hotel, sourceMap, semantic, input } = params;
  const travelerSpecific = hotel.travelerFit.byType[input.travelerType] ?? [];
  const travelerSourceIds = [
    ...hotel.travelerFit.sourceIds.common,
    ...(hotel.travelerFit.sourceIds[input.travelerType] ?? []),
    ...hotel.feedbackThemes.flatMap((t) => t.sourceIds),
  ];
  const citations = collectCitations(travelerSourceIds, sourceMap);

  const bookingValueLine =
    input.role === "finance"
      ? `Average booking value signal: USD ${hotel.bookingIntelligence.avgBookingValueUsd.toLocaleString()}.`
      : `Average booking value signal: ${hotel.bookingIntelligence.qualitativeSummary}.`;

  const facts = [
    ...hotel.travelerFit.common,
    ...travelerSpecific,
    ...hotel.bookingIntelligence.patterns,
    ...hotel.feedbackThemes.map((t) => t.text),
    bookingValueLine,
  ];

  const status = citations.length === 0 ? "INSUFFICIENT_SOURCES" : "OK";
  const contentLines =
    status === "OK"
      ? [
          `Traveler type assessed: ${travelerLabels[input.travelerType]}.`,
          ...hotel.travelerFit.common,
          ...travelerSpecific,
          `Booking intelligence: ${hotel.bookingIntelligence.patterns.join("; ")}.`,
          bookingValueLine,
          `Feedback themes: ${hotel.feedbackThemes.map((t) => t.label).join(", ")}.`,
          ...(semantic.used.length
            ? [`Supporting color (non-canonical): ${semantic.used.map((c) => c.title).join(", ")}.`]
            : []),
        ]
      : [insufficientText()];

  return {
    status,
    content: renderBulletText(contentLines),
    citations,
    semanticChunksUsed: semantic.used,
    retrievalBreakdown: buildRetrievalBreakdown(
      facts.length,
      semantic.used.length,
      semantic.conflictsIgnored.length,
    ),
    conflictsIgnored: semantic.conflictsIgnored,
  };
}

function buildRisksSection(params: {
  hotel: HotelData;
  sourceMap: Map<string, SourceRecord>;
  semantic: { used: UnstructuredChunk[]; conflictsIgnored: ConflictEvent[] };
  input: QueryInput;
}): TextSection {
  const { hotel, sourceMap, semantic, input } = params;
  const relevantRisks = hotel.risks.filter((r) => r.seasonRelevance.includes(input.season));
  const sourceIds = [...relevantRisks.flatMap((r) => r.sourceIds)];
  const citations = collectCitations(sourceIds, sourceMap);
  const facts = relevantRisks.map((r) => `${r.severity.toUpperCase()}: ${r.text}`);

  const status = citations.length === 0 ? "INSUFFICIENT_SOURCES" : "OK";
  const contentLines =
    status === "OK"
      ? [
          `Season assessed: ${seasonLabels[input.season]}.`,
          ...facts,
          ...(semantic.used.length
            ? [`Supporting color (non-canonical): ${semantic.used.map((c) => c.title).join(", ")}.`]
            : []),
        ]
      : [insufficientText()];

  return {
    status,
    content: renderBulletText(contentLines),
    citations,
    semanticChunksUsed: semantic.used,
    retrievalBreakdown: buildRetrievalBreakdown(
      facts.length,
      semantic.used.length,
      semantic.conflictsIgnored.length,
    ),
    conflictsIgnored: semantic.conflictsIgnored,
  };
}

function buildUjvPovSection(params: {
  hotel: HotelData;
  sourceMap: Map<string, SourceRecord>;
  semantic: { used: UnstructuredChunk[]; conflictsIgnored: ConflictEvent[] };
}): TextSection {
  const { hotel, sourceMap, semantic } = params;
  const citations = collectCitations(hotel.ujvPov.sourceIds, sourceMap);
  const facts = [...hotel.ujvPov.talkTrack];
  const status = citations.length === 0 ? "INSUFFICIENT_SOURCES" : "OK";

  const contentLines =
    status === "OK"
      ? [
          ...hotel.ujvPov.talkTrack,
          ...(semantic.used.length
            ? [`Supporting color (non-canonical): ${semantic.used.map((c) => c.title).join(", ")}.`]
            : []),
        ]
      : [insufficientText()];

  return {
    status,
    content: renderBulletText(contentLines),
    citations,
    semanticChunksUsed: semantic.used,
    retrievalBreakdown: buildRetrievalBreakdown(
      facts.length,
      semantic.used.length,
      semantic.conflictsIgnored.length,
    ),
    conflictsIgnored: semantic.conflictsIgnored,
  };
}

function buildPromotionsSection(params: {
  hotel: HotelData;
  sourceMap: Map<string, SourceRecord>;
  promoConflicts: ConflictEvent[];
}): PromotionsSection {
  const { hotel, sourceMap, promoConflicts } = params;
  const sourceIds = [
    ...hotel.promotions.flatMap((p) => p.sourceIds),
    ...hotel.contract.sourceIds,
    ...hotel.contract.stackingRules.flatMap((r) => r.sourceIds),
  ];
  const citations = collectCitations(sourceIds, sourceMap);
  const status = citations.length === 0 ? "INSUFFICIENT_SOURCES" : "OK";

  return {
    status,
    content: {
      promos:
        status === "OK"
          ? hotel.promotions.map((p) => ({
              promoId: p.promoId,
              name: p.name,
              description: p.description,
              validity: p.validity,
              eligibility: p.eligibility,
            }))
          : [],
      stackingRules:
        status === "OK"
          ? hotel.contract.stackingRules.map((r) => ({
              ruleId: r.ruleId,
              text: r.text,
              allowsCombination: r.allowsCombination,
              appliesToPromoIds: r.appliesToPromoIds,
            }))
          : [],
    },
    citations,
    semanticChunksUsed: [],
    retrievalBreakdown: buildRetrievalBreakdown(
      hotel.promotions.length + hotel.contract.stackingRules.length,
      0,
      promoConflicts.length,
    ),
    conflictsIgnored: promoConflicts,
  };
}

async function maybeLlmNarrativeOverride(params: {
  responseDraft: QueryResponse;
  hotel: HotelData;
  input: QueryInput;
}): Promise<Partial<Record<"positioning" | "travelerFit" | "risks" | "ujvPov", string>>> {
  if (!params.input.useLLM || !process.env.OPENAI_API_KEY) {
    console.log("[LLM] Skipped narrative override", {
      useLLM: params.input.useLLM,
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    });
    return {};
  }

  const sectionsForPrompt = {
    positioning: params.responseDraft.sections.positioning,
    travelerFit: params.responseDraft.sections.travelerFit,
    risks: params.responseDraft.sections.risks,
    ujvPov: params.responseDraft.sections.ujvPov,
  };

  const context = {
    hotel: {
      hotelId: params.hotel.hotelId,
      name: params.hotel.name,
      region: params.hotel.region,
      category: params.hotel.category,
    },
    query: params.responseDraft.queryPlan,
    sections: Object.fromEntries(
      Object.entries(sectionsForPrompt)
        .filter(([, section]) => section)
        .map(([key, section]) => [
          key,
          {
            status: section?.status,
            contentDraft: section?.content,
            citations: section?.citations,
            semanticChunksUsed: section?.semanticChunksUsed,
            conflictsIgnored: section?.conflictsIgnored,
          },
        ]),
    ),
  };

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  console.log("[LLM] Narrative override requested", {
    model,
    sectionStatuses: {
      positioning: params.responseDraft.sections.positioning.status,
      travelerFit: params.responseDraft.sections.travelerFit.status,
      risks: params.responseDraft.sections.risks?.status ?? "NOT_REQUESTED",
      ujvPov: params.responseDraft.sections.ujvPov?.status ?? "NOT_REQUESTED",
    },
  });
  const prompt = {
    instructions:
      "Rewrite section content into concise business-ready bullet text. Do not invent facts. If information is insufficient, keep the provided insufficient-sources sentence. Return JSON only with keys positioning/travelerFit/risks/ujvPov and string values. Do not return promotions.",
    context,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You generate grounded structured JSON from provided context only." },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });

    console.log("[LLM] OpenAI response", {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    });
    if (!res.ok) {
      return {};
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return {};

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const out: Partial<Record<"positioning" | "travelerFit" | "risks" | "ujvPov", string>> = {};
    for (const key of ["positioning", "travelerFit", "risks", "ujvPov"] as const) {
      if (typeof parsed[key] === "string") out[key] = parsed[key];
    }
    console.log("[LLM] Parsed override keys", {
      keys: Object.keys(out),
    });
    return out;
  } catch (error) {
    console.log("[LLM] Narrative override failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function collectPromoSemanticConflicts(allChunks: UnstructuredChunk[], hotel: HotelData): ConflictEvent[] {
  const conflicts: ConflictEvent[] = [];
  for (const chunk of allChunks.filter((c) => c.hotelId === hotel.hotelId)) {
    const event = detectSemanticConflict({ chunk, section: "promotions", hotel });
    if (event) conflicts.push(event);
  }
  return conflicts;
}

function selectSectionSourceItems(
  section: TextSection | PromotionsSection,
): Array<{ date: string; type: SourceType; label: string }> {
  const citationItems = section.citations.map((c) => ({
    date: c.date,
    type: c.type,
    label: `${c.sourceId} (${c.type})`,
  }));
  const semanticItems = section.semanticChunksUsed.map((c) => ({
    date: c.date,
    type: c.sourceType as SourceType,
    label: `${c.chunkId} (${c.sourceType})`,
  }));
  return [...citationItems, ...semanticItems];
}

export async function runKnowledgeSpineQuery(rawPayload: unknown): Promise<QueryResponse> {
  const input = validateInput(rawPayload);

  const [hotel, allSources, allChunks] = await Promise.all([
    readJson<HotelData>("hotel_amanzoe.json"),
    readJson<SourceRecord[]>("sources.json"),
    readJson<UnstructuredChunk[]>("unstructured_chunks.json"),
  ]);

  if (hotel.hotelId !== input.hotelId) {
    const error = new Error(`Hotel not found: ${input.hotelId}`);
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const sourceMap = new Map(allSources.map((s) => [s.sourceId, s]));
  const queryPlan = buildQueryPlan(hotel, input);

  const positioningSemantic = retrieveSemanticChunks({
    allChunks,
    hotel,
    section: "positioning",
    terms: queryPlan.queryTerms.perSection.positioning ?? [],
  });
  const travelerSemantic = retrieveSemanticChunks({
    allChunks,
    hotel,
    section: "travelerFit",
    terms: queryPlan.queryTerms.perSection.travelerFit ?? [],
  });
  const risksSemantic = input.includeRisks
    ? retrieveSemanticChunks({
        allChunks,
        hotel,
        section: "risks",
        terms: queryPlan.queryTerms.perSection.risks ?? [],
      })
    : null;
  const ujvSemantic = input.includeUjvPov
    ? retrieveSemanticChunks({
        allChunks,
        hotel,
        section: "ujvPov",
        terms: queryPlan.queryTerms.perSection.ujvPov ?? [],
      })
    : null;

  const promoConflicts = input.includePromotions ? collectPromoSemanticConflicts(allChunks, hotel) : [];

  const positioning = buildPositioningSection({ hotel, sourceMap, semantic: positioningSemantic, input });
  const travelerFit = buildTravelerFitSection({ hotel, sourceMap, semantic: travelerSemantic, input });
  const risks = input.includeRisks
    ? buildRisksSection({ hotel, sourceMap, semantic: risksSemantic!, input })
    : undefined;
  const promotions = input.includePromotions
    ? buildPromotionsSection({ hotel, sourceMap, promoConflicts })
    : undefined;
  const ujvPov = input.includeUjvPov
    ? buildUjvPovSection({ hotel, sourceMap, semantic: ujvSemantic! })
    : undefined;

  const responseDraft: QueryResponse = {
    queryPlan,
    sections: {
      positioning,
      travelerFit,
      ...(risks ? { risks } : {}),
      ...(promotions ? { promotions } : {}),
      ...(ujvPov ? { ujvPov } : {}),
    },
    trust: {
      evidenceStrengthScore: 0,
      evidenceStrengthLabel: "Low",
      freshness: {
        promotionsLastVerifiedDate: null,
        mostRecentSiteVisitDate: null,
        lastFeedbackDate: null,
        lastSemanticChunkDate: null,
      },
      stats: {
        structuredSourcesUsed: 0,
        unstructuredSourcesUsed: 0,
        semanticChunksUsed: 0,
        structuredFactsUsed: 0,
        conflictsIgnored: 0,
      },
      guardrails: {
        canonicalOverridesNotes: false,
        promotionsFromContractOnly: true,
        allSectionsBackedByCitations: false,
        sensitiveDataRestrictedByRole: true,
        withinFreshnessPolicy: "PASS",
        policyWarnings: [],
      },
      policyCompliance: "PASS",
      policySnapshot: hotel.policy.maxAgeDaysBySourceType,
      escalationNeeded: false,
      escalationReason: "",
    },
  };

  const llmOverrides = await maybeLlmNarrativeOverride({ responseDraft, hotel, input });
  console.log("[LLM] Applying overrides check", {
    sectionStatuses: {
      positioning: responseDraft.sections.positioning.status,
      travelerFit: responseDraft.sections.travelerFit.status,
      risks: responseDraft.sections.risks?.status ?? "NOT_REQUESTED",
      ujvPov: responseDraft.sections.ujvPov?.status ?? "NOT_REQUESTED",
    },
    overrideKeys: Object.keys(llmOverrides),
  });
  if (llmOverrides.positioning && responseDraft.sections.positioning.status === "OK") {
    responseDraft.sections.positioning.content = llmOverrides.positioning;
  }
  if (llmOverrides.travelerFit && responseDraft.sections.travelerFit.status === "OK") {
    responseDraft.sections.travelerFit.content = llmOverrides.travelerFit;
  }
  if (llmOverrides.risks && responseDraft.sections.risks?.status === "OK") {
    responseDraft.sections.risks.content = llmOverrides.risks;
  }
  if (llmOverrides.ujvPov && responseDraft.sections.ujvPov?.status === "OK") {
    responseDraft.sections.ujvPov.content = llmOverrides.ujvPov;
  }
  console.log("[LLM] Override application result", {
    applied: {
      positioning: Boolean(llmOverrides.positioning && responseDraft.sections.positioning.status === "OK"),
      travelerFit: Boolean(llmOverrides.travelerFit && responseDraft.sections.travelerFit.status === "OK"),
      risks: Boolean(llmOverrides.risks && responseDraft.sections.risks?.status === "OK"),
      ujvPov: Boolean(llmOverrides.ujvPov && responseDraft.sections.ujvPov?.status === "OK"),
    },
  });

  const requestedSections = Object.values(responseDraft.sections);
  const allCitations = requestedSections.flatMap((section) => section.citations);
  const totalCitations = allCitations.length;
  const avgReliability =
    allCitations.length > 0
      ? allCitations.reduce((sum, c) => sum + c.reliability, 0) / allCitations.length
      : 0;
  const anyRecent = allCitations.some((c) => daysOld(c.date) <= 120);
  const nonConflictingSemanticCount = requestedSections.reduce(
    (sum, s) => sum + s.semanticChunksUsed.length,
    0,
  );
  const semanticBonus = Math.min(0.02, nonConflictingSemanticCount * 0.01);
  const base = Math.min(1, totalCitations / 8);
  const recencyBonus = anyRecent ? 0.05 : 0;
  const reliabilityFactor = avgReliability * 0.9;
  const evidenceStrengthScore = clamp(base * reliabilityFactor + recencyBonus + semanticBonus, 0, 1);
  const evidenceStrengthLabel =
    evidenceStrengthScore >= 0.75 ? "High" : evidenceStrengthScore >= 0.6 ? "Medium" : "Low";

  const uniqueCitationSources = uniq(allCitations.map((c) => c.sourceId)).map((id) => sourceMap.get(id)).filter(Boolean) as SourceRecord[];
  const structuredSourcesUsed = uniqueCitationSources.filter((s) => !unstructuredSourceTypes.has(s.type)).length;
  const unstructuredSourcesUsed = uniqueCitationSources.filter((s) => unstructuredSourceTypes.has(s.type)).length;
  const structuredFactsUsed = requestedSections.reduce(
    (sum, s) => sum + s.retrievalBreakdown.structuredFactsCount,
    0,
  );
  const conflictsIgnored = requestedSections.reduce(
    (sum, s) => sum + s.conflictsIgnored.length,
    0,
  );

  const promotionsDates = promotions
    ? promotions.citations
        .filter((c) => c.type === "promotion" || c.type === "contract")
        .map((c) => sourceMap.get(c.sourceId)?.lastVerifiedAt ?? c.date)
    : [];
  const siteVisitDates = uniqueCitationSources.filter((s) => s.type === "site_visit").map((s) => s.date);
  const feedbackDates = uniqueCitationSources
    .filter((s) => s.type === "post_trip_feedback")
    .map((s) => s.date);
  const semanticDates = requestedSections.flatMap((s) => s.semanticChunksUsed.map((c) => c.date));

  const policyWarnings: string[] = [];
  for (const [sectionKey, section] of Object.entries(responseDraft.sections) as Array<[
    string,
    TextSection | PromotionsSection
  ]>) {
    for (const item of selectSectionSourceItems(section)) {
      const maxAge = hotel.policy.maxAgeDaysBySourceType[item.type];
      if (typeof maxAge !== "number") continue;
      const age = daysOld(item.date);
      if (age > maxAge) {
        policyWarnings.push(`${sectionKey}: ${item.label} exceeds max age ${maxAge}d (age ${age}d)`);
      }
    }
  }

  const withinFreshnessPolicy = policyWarnings.length > 0 ? "WARN" : "PASS";
  const allSectionsBackedByCitations = Object.values(responseDraft.sections).every(
    (s) => s.citations.length > 0 && s.status === "OK",
  );
  const sensitiveDataRestrictedByRole =
    input.role === "finance" || !responseDraft.sections.travelerFit.content.includes(String(hotel.bookingIntelligence.avgBookingValueUsd));

  const travelerFitInsufficient = responseDraft.sections.travelerFit.status === "INSUFFICIENT_SOURCES";
  const promotionsMissingSources = !!input.includePromotions && (promotions?.citations.length ?? 0) === 0;
  const policyWarn = withinFreshnessPolicy === "WARN";
  const escalationNeeded = evidenceStrengthScore < 0.6 || promotionsMissingSources || travelerFitInsufficient || policyWarn;

  let escalationReason = "";
  if (evidenceStrengthScore < 0.6) {
    escalationReason = `Reason: Evidence Strength below threshold (0.6). Current score ${evidenceStrengthScore.toFixed(2)}`;
  } else if (promotionsMissingSources) {
    escalationReason = "Reason: Promotions requested but no verified promotions/contract sources were found.";
  } else if (travelerFitInsufficient) {
    escalationReason = "Reason: Traveler Fit section lacks sufficient verified evidence.";
  } else if (policyWarn) {
    escalationReason = "Reason: Policy freshness WARN.";
  }

  responseDraft.trust = {
    evidenceStrengthScore: Number(evidenceStrengthScore.toFixed(2)),
    evidenceStrengthLabel,
    freshness: {
      promotionsLastVerifiedDate: formatDate(maxDate(promotionsDates)),
      mostRecentSiteVisitDate: formatDate(maxDate(siteVisitDates)),
      lastFeedbackDate: formatDate(maxDate(feedbackDates)),
      lastSemanticChunkDate: formatDate(maxDate(semanticDates)),
    },
    stats: {
      structuredSourcesUsed,
      unstructuredSourcesUsed,
      semanticChunksUsed: nonConflictingSemanticCount,
      structuredFactsUsed,
      conflictsIgnored,
    },
    guardrails: {
      canonicalOverridesNotes: conflictsIgnored > 0,
      promotionsFromContractOnly: true,
      allSectionsBackedByCitations,
      sensitiveDataRestrictedByRole,
      withinFreshnessPolicy,
      policyWarnings,
    },
    policyCompliance: withinFreshnessPolicy,
    policySnapshot: hotel.policy.maxAgeDaysBySourceType,
    escalationNeeded,
    escalationReason,
  };

  return responseDraft;
}
