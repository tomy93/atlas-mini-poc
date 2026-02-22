export const travelerTypes = [
  "honeymoon",
  "multi_gen_family",
  "solo_wellness",
  "corporate_executive",
] as const;

export const seasonTypes = [
  "late_september",
  "peak_summer",
  "shoulder_apr_may",
  "low_nov_mar",
] as const;

export const roleTypes = [
  "reservations",
  "marketing",
  "destination_specialist",
  "finance",
] as const;

export type TravelerType = (typeof travelerTypes)[number];
export type SeasonType = (typeof seasonTypes)[number];
export type RoleType = (typeof roleTypes)[number];

export type SourceType =
  | "site_visit"
  | "post_trip_feedback"
  | "booking_intelligence"
  | "contract"
  | "promotion"
  | "ujv_pov"
  | "unstructured_chunk";

export type SectionKey =
  | "positioning"
  | "travelerFit"
  | "risks"
  | "promotions"
  | "ujvPov";

export interface QueryInput {
  hotelId: string;
  travelerType: TravelerType;
  season: SeasonType;
  includeRisks: boolean;
  includePromotions: boolean;
  includeUjvPov: boolean;
  role: RoleType;
  useLLM: boolean;
}

export interface SourceRecord {
  sourceId: string;
  type: SourceType;
  title: string;
  author: string;
  date: string;
  system: string;
  reliability: number;
  snippet: string;
  ownerTeam: string;
  version: string;
  docRef: string;
  lastVerifiedAt: string;
}

export interface UnstructuredChunk {
  chunkId: string;
  hotelId: string;
  sourceType: "unstructured_chunk";
  title: string;
  date: string;
  reliability: number;
  text: string;
  ownerTeam: string;
  version: string;
  docRef: string;
}

export interface HotelPolicy {
  maxAgeDaysBySourceType: Record<SourceType, number>;
}

export interface HotelData {
  hotelId: string;
  name: string;
  country: string;
  region: string;
  category: string;
  ownerTeam: string;
  version: string;
  lastUpdatedAt: string;
  policy: HotelPolicy;
  positioningTags: string[];
  positioning: {
    strengths: string[];
    sourceIds: string[];
  };
  travelerFit: {
    common: string[];
    byType: Record<TravelerType, string[]>;
    sourceIds: {
      common: string[];
    } & Record<TravelerType, string[]>;
  };
  seasonality: Record<SeasonType, string>;
  risks: Array<{
    riskId: string;
    text: string;
    severity: "low" | "medium" | "high";
    seasonRelevance: SeasonType[];
    sourceIds: string[];
  }>;
  promotions: Array<{
    promoId: string;
    name: string;
    description: string;
    validity: {
      bookingFrom: string;
      bookingTo: string;
      travelFrom: string;
      travelTo: string;
    };
    eligibility: string[];
    sourceIds: string[];
  }>;
  contract: {
    sourceIds: string[];
    stackingRules: Array<{
      ruleId: string;
      text: string;
      allowsCombination: boolean;
      appliesToPromoIds: string[];
      sourceIds: string[];
    }>;
  };
  bookingIntelligence: {
    avgBookingValueUsd: number;
    qualitativeSummary: string;
    patterns: string[];
    sourceIds: string[];
  };
  feedbackThemes: Array<{
    themeId: string;
    label: string;
    text: string;
    sourceIds: string[];
  }>;
  ujvPov: {
    talkTrack: string[];
    sourceIds: string[];
  };
}

export interface Citation {
  sourceId: string;
  type: SourceType;
  title: string;
  author: string;
  date: string;
  system: string;
  reliability: number;
  snippet: string;
  docRef: string;
}

export interface ConflictEvent {
  chunkId: string;
  reason: string;
  structuredRuleRef: string;
}

export interface RetrievalBreakdown {
  structuredFactsCount: number;
  semanticChunksCount: number;
  overridesApplied: boolean;
  conflictsIgnoredCount: number;
}

export interface TextSection {
  status: "OK" | "INSUFFICIENT_SOURCES";
  content: string;
  citations: Citation[];
  semanticChunksUsed: UnstructuredChunk[];
  retrievalBreakdown: RetrievalBreakdown;
  conflictsIgnored: ConflictEvent[];
  aiModified?: boolean;
}

export interface PromotionsSection {
  status: "OK" | "INSUFFICIENT_SOURCES";
  content: {
    promos: Array<{
      promoId: string;
      name: string;
      description: string;
      validity: HotelData["promotions"][number]["validity"];
      eligibility: string[];
    }>;
    stackingRules: Array<{
      ruleId: string;
      text: string;
      allowsCombination: boolean;
      appliesToPromoIds: string[];
    }>;
  };
  citations: Citation[];
  semanticChunksUsed: UnstructuredChunk[];
  retrievalBreakdown: RetrievalBreakdown;
  conflictsIgnored: ConflictEvent[];
  aiModified?: boolean;
}

export interface QueryPlan {
  hotelId: string;
  hotelName: string;
  travelerType: TravelerType;
  season: SeasonType;
  role: RoleType;
  sectionsRequested: SectionKey[];
  retrievalMode: "mock_synthesis" | "llm_assisted";
  queryTerms: {
    global: string[];
    perSection: Partial<Record<SectionKey, string[]>>;
  };
  createdAt: string;
}

export interface TrustPayload {
  evidenceStrengthScore: number;
  evidenceStrengthLabel: "High" | "Medium" | "Low";
  freshness: {
    promotionsLastVerifiedDate: string | null;
    mostRecentSiteVisitDate: string | null;
    lastFeedbackDate: string | null;
    lastSemanticChunkDate: string | null;
  };
  stats: {
    structuredSourcesUsed: number;
    unstructuredSourcesUsed: number;
    semanticChunksUsed: number;
    structuredFactsUsed: number;
    conflictsIgnored: number;
  };
  guardrails: {
    canonicalOverridesNotes: boolean;
    promotionsFromContractOnly: boolean;
    allSectionsBackedByCitations: boolean;
    sensitiveDataRestrictedByRole: boolean;
    withinFreshnessPolicy: "PASS" | "WARN";
    policyWarnings: string[];
  };
  policyCompliance: "PASS" | "WARN";
  policySnapshot: HotelPolicy["maxAgeDaysBySourceType"];
  escalationNeeded: boolean;
  escalationReason: string;
}

export interface QueryResponse {
  queryPlan: QueryPlan;
  sections: {
    positioning: TextSection;
    travelerFit: TextSection;
    risks?: TextSection;
    promotions?: PromotionsSection;
    ujvPov?: TextSection;
  };
  trust: TrustPayload;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
