# UJV Atlas — Knowledge Spine Validation

Thin proof-of-execution demo for validating the pattern:

`structured knowledge -> controlled query -> grounded, transparent output with citations`

This is intentionally **not a product** and **not a chatbot**.
It exposes a constrained operational flow to prove a knowledge spine can be queried with guardrails and traceability.

## What This Demo Proves

- Controlled query UI (no free-text chat)
- Deterministic retrieval pipeline over local JSON data
- Structured sectioned output (Positioning, Traveler Fit, Risks, Promotions, UJV POV)
- Citations shown for every section
- Trust/Governance panel with evidence score, freshness checks, validation checks, and escalation logic
- Canonical structured data overriding conflicting semantic notes
- Deterministic promotions output (no LLM-generated offers)

## Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Local JSON data files under `data/`
- Optional OpenAI API synthesis for narrative phrasing only (fallback to deterministic mock synthesis)

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Optional LLM Mode

Default behavior is deterministic mock synthesis.

To enable optional AI-assisted narrative generation (still grounded on retrieved context only):

```bash
export OPENAI_API_KEY=your_key_here
# optional
export OPENAI_MODEL=gpt-4o-mini
npm run dev
```

Then toggle **"AI-Assisted Narrative (optional)"** in the Query panel.

Important constraints in LLM mode:

- Promotions remain deterministic and contract-derived only
- The model receives only retrieved facts/citations/allowed semantic chunks
- If the model fails or is unavailable, the API falls back to deterministic synthesis

## API

- `POST /api/query`

Example request body:

```json
{
  "hotelId": "amanzoe_gr",
  "travelerType": "honeymoon",
  "season": "late_september",
  "includeRisks": true,
  "includePromotions": true,
  "includeUjvPov": true,
  "role": "reservations",
  "useLLM": false
}
```

## Key Guardrails

- Citations required per section (`no sources -> no answer`)
- Promotions deterministic and derived from `hotel.promotions` + contract stacking rules
- Semantic chunks are keyword-retrieved (no embeddings) and used only as supporting color
- Canonical structured facts override conflicting semantic notes
- Role-based restriction hides numeric booking value unless `role=finance`
- Governance freshness policy checks source ages and can trigger escalation

## Canonical Overrides Notes Demo

The mock `data/unstructured_chunks.json` includes deliberate conflicts:

- Promo combinability note claiming `4th night free` can stack with `early booking` (unconfirmed)
- Positioning note claiming Amanzoe is `nightlife-focused`

The API detects these conflicts against canonical structured rules/tags in `data/hotel_amanzoe.json` and excludes them from section context while recording:

- `conflictsIgnored[]`
- `retrievalBreakdown.overridesApplied = true`
- Trust check: `canonicalOverridesNotes = true`

This makes the override behavior observable in the UI.

## Governance Policy / Freshness

Policy snapshot is stored in `data/hotel_amanzoe.json`:

- `maxAgeDaysBySourceType` for `contract`, `promotion`, `site_visit`, `post_trip_feedback`, `booking_intelligence`, `ujv_pov`, `unstructured_chunk`

The API evaluates required section sources (including used semantic chunks) against this policy.

- If any source exceeds age policy: `WARN`
- `WARN` triggers escalation in the Trust panel

## Feedback Enrichment Signals (Frontend-only Demo)

The Feedback section captures a local structured enrichment signal (no persistence yet):

```json
{
  "hotelId": "amanzoe_gr",
  "travelerType": "honeymoon",
  "season": "late_september",
  "role": "reservations",
  "helpful": true,
  "missingInsight": "Add transfer duration caveat by arrival airport",
  "targetSection": "risks",
  "createdAt": "2026-02-22T00:00:00.000Z"
}
```

Intent: future ingestion into curation/enrichment workflows without turning the interface into chat.

## Project Structure

- `src/app/page.tsx` - single page UI (header + 3-column content row + feedback)
- `src/app/api/query/route.ts` - deterministic query endpoint
- `src/lib/query-engine.ts` - retrieval, guardrails, scoring, freshness, escalation logic
- `src/lib/types.ts` - shared types
- `data/hotel_amanzoe.json` - canonical structured hotel model + policy
- `data/sources.json` - source records and provenance metadata
- `data/unstructured_chunks.json` - mock semantic retrieval corpus + conflict examples
