# implementation.md
**Last updated:** 2025-08-22 00:00:00

## Purpose
This document explains how to implement the next iteration of the Invoice Verification agents so a junior developer can read the current `AGENT_ARCHITECTURE.md`, understand what exists, and then follow this to build/modify agents.

---

## 0) What exists today (quick read)
- Multi-agent system orchestrated with **CrewAI**; prompts and traces via **Langfuse**; models routed through **OpenRouter** with provider flexibility.
- Core agents:
  - **Item Matcher** → matches user items to canonical catalog (exact → synonyms → fuzzy). Emits confidence and proposals.
  - **Price Learner / Validator** → validates unit price against price bands; proposes range adjustments.
  - **Rule Applier** → deterministic policy codes (ALLOW/DENY/NEEDS_MORE_INFO).
  - **Item Validator** → LLM-powered moderation and FM-domain classification with rule-based fallback.
  - **Judge System** → evaluates each agent’s quality, latency, and cost, logged in Langfuse.
- Execution entry points exist for invoice processing and validation routes; OpenRouter and Langfuse envs are already wired.

> You should skim `AGENT_ARCHITECTURE.md` first, then continue here.

---

## 1) Target pipeline (with the new behavior)

```
User adds line items (async-friendly UI; items can be added continuously)
        │
        ▼
[Step A] Pre-Validation Agent (fast)
        - profanity / blacklist / structural sanity / FM-likelihood scoring
        - APPROVED → proceed, else REJECT or NEEDS_REVIEW (block matcher)
        │
        ▼
[Step B] Item Matcher
        - success → go to Price Validator
        - no match → emit MATCH_MISS event → Web Searcher & Ingester
        │
        ▼
[Step C] Web Searcher & Ingester (whitelisted sites only)
        - search → fetch PDP → parse → normalize → persist canonical/external item
        - notify Item Matcher to re-run for this line item
        │
        ▼
[Step D] Price Validator (a.k.a. Price Learner/Validator)
        - validate price vs bands; learn/propose band updates
        │
        ▼
[Step E] Rule Agent (contextual allow/deny/needs-info)
        - if inconsistent with service line/type/hours/scope → request Explanation
        │
        ▼
[Step F] Explanation Loop
        - user explains → Rule Agent verifies → ALLOW or DENY
        │
        ▼
All checks complete → line item READY_FOR_SUBMISSION
```

### Key principles
- Validation-first to stop junk early.
- Match-then-search to keep latency low and DB clean.
- Async orchestration so users can keep typing while checks run.
- Gates before submit: every item must be VERIFIED (or explicitly DENIED).

---

## 2) Data model additions (SQL migrations)

> Use your existing migrations system. Create the following tables if they don’t exist.

```sql
-- A. Validation events (fast moderation + heuristics)
create table if not exists item_validation_events (
  id bigserial primary key,
  line_item_id uuid not null,
  verdict text not null check (verdict in ('APPROVED','REJECTED','NEEDS_REVIEW')),
  reasons jsonb not null default '[]'::jsonb,
  score numeric(5,2), -- 0..1 likelihood of being material/equipment
  blacklisted_term text,
  created_at timestamptz not null default now()
);

-- B. Web search and ingestion bookkeeping
create table if not exists external_item_sources (
  id bigserial primary key,
  source_vendor text not null,                -- 'grainger'|'amazon_business'|'home_depot'|'zoro'|'msc'|'fastenal'|...
  source_url text not null,
  source_sku text,
  item_name text not null,
  unit_of_measure text,                       -- e.g., 'EA','PK','FT'
  pack_qty numeric(12,3),
  normalized_unit_of_measure text,            -- post-normalization UoM
  normalized_multiplier numeric(12,3),        -- pack → unit conversion
  last_price numeric(12,4),
  last_price_currency text default 'USD',
  price_last_seen_at timestamptz,
  availability jsonb default null,
  raw jsonb not null,                         -- full parsed payload
  created_at timestamptz not null default now(),
  unique (source_vendor, source_url)
);

-- C. Link external sources to canonical catalog
create table if not exists canonical_item_links (
  id bigserial primary key,
  canonical_item_id uuid not null,
  external_source_id bigint not null references external_item_sources(id),
  confidence numeric(5,2) not null,
  created_at timestamptz not null default now(),
  unique (canonical_item_id, external_source_id)
);

-- D. Rule-agent explanations (user supplied)
create table if not exists line_item_explanations (
  id bigserial primary key,
  line_item_id uuid not null,
  user_id uuid not null,
  explanation text not null,
  accepted boolean,                -- set by Rule Agent after verification
  rejected_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- E. Orchestration state machine per line item
create type line_item_status as enum (
  'NEW','VALIDATION_REJECTED','AWAITING_MATCH','AWAITING_INGEST',
  'MATCHED','PRICE_VALIDATED','NEEDS_EXPLANATION','READY_FOR_SUBMISSION','DENIED'
);

alter table line_items add column if not exists status line_item_status default 'NEW';
alter table line_items add column if not exists orchestrator_lock text; -- idempotency/lock token
```

**Indexes to add**
```sql
create index if not exists idx_item_validation_events_line on item_validation_events(line_item_id);
create index if not exists idx_external_item_sources_vendor on external_item_sources(source_vendor);
create index if not exists idx_external_item_sources_name on external_item_sources using gin (to_tsvector('english', item_name));
create index if not exists idx_canonical_item_links_canonical on canonical_item_links(canonical_item_id);
create index if not exists idx_line_items_status on line_items(status);
```

---

## 3) Agents (what to build/modify)

### 3.1 Pre-Validation Agent (new, runs first)
Goal: Block profanity/junk; confirm “looks like FM material/equipment”; return verdict + reasons.

- Inputs: raw item name/notes, optional: service_line, service_type.
- Outputs: APPROVED/REJECTED/NEEDS_REVIEW, score, reasons, blacklisted term (if any).
- Implementation:
  - Rule layer (cheap): reject if empty/too short, numeric-only, symbols-only, contains blacklisted tokens (e.g., helper, labour/labor, technician, fees, visit, charges, tax, gst, vat, convenience, misc, --, n/a, test).
  - LLM layer (fast small model): classify FM-material-likelihood; maintain allowlist patterns (e.g., ANSI gauge sizes, pipe/thread specs).
  - Persist to item_validation_events; update line_items.status:
    - REJECTED → VALIDATION_REJECTED (stop pipeline for this item).
    - APPROVED → AWAITING_MATCH.
    - NEEDS_REVIEW → keep gated until manual or retry with larger model.
  - Langfuse: new prompt validator_v2 with versioning; log score & reasons.

### 3.2 Item Matcher (existing; minor changes)
- On APPROVED items, run existing hybrid matching.
- If no match, emit MATCH_MISS domain event and set status AWAITING_INGEST.
- If matched, set status MATCHED and continue.

### 3.3 Web Searcher & Ingester (new)
Goal: On MATCH_MISS, search whitelisted sites, parse product pages, normalize, and persist so matcher can succeed on retry.

- Scope (whitelist initial): Grainger, Amazon Business, Home Depot, Zoro, MSC, Fastenal (extendable).
- Search strategy:
  1) Site search: site:<vendor> "<query>" via your search provider or vendor search endpoints.
  2) Select top-N PDPs with high textual similarity to query.
- Fetcher: Headless browser (Playwright) with JS enabled; block images/trackers; exponential backoff; vendor-specific anti-bot guards.
- Parser: Per-vendor extractors returning a common schema: {name, sku, pack_qty, uom, price, currency, url, availability, attributes}.
- Normalizer: Compute unit price from pack price (e.g., 12-pack → per EA); map UoM synonyms (EA/Each/Unit; FT/Foot; PR/Pair; RL/Roll). 
- Persistence: Upsert into external_item_sources; optionally auto-link to a canonical item by fuzzy score → insert into canonical_item_links.
- Kickback: After persistence, re-run Item Matcher for the line item (idempotent).
- Feature flags: FEATURE_WEB_INGEST=true to enable.
- Observability: Langfuse trace web_ingest_v1 with vendor, url, parse-time, match-score.

### 3.4 Price Validator (existing)
- Ensure it reads price bands; if only external-source price exists, treat as provisional band with wider tolerance; create PRICE_RANGE_ADJUST proposals.
- Set status to PRICE_VALIDATED on success; otherwise keep DENY code or NEEDS_MORE_INFO.

### 3.5 Rule Agent + Explanation loop (enhanced)
- Add rule: MATERIAL_INCONSISTENT_WITH_CONTEXT when item conflicts with service_line/service_type/hours/work_scope.
- When triggered, set NEEDS_EXPLANATION and surface a prompt to the user:
  - “This item looks atypical for {service_line}/{service_type} given {hours}/{scope}. Explain why it was needed.”
- New endpoint accepts free-text explanation; Rule Agent evaluates:
  - If legit → mark explanation accepted=true, transition to READY_FOR_SUBMISSION (or back to PRICE_VALIDATED if other gates pending).
  - If not legit → DENIED and store rejected_reason.

---

## 4) Orchestration

### 4.1 Event-driven + idempotent workers
- Domain events: LINE_ITEM_ADDED, VALIDATED, MATCH_MISS, WEB_INGESTED, MATCHED, PRICE_VALIDATED, NEEDS_EXPLANATION, EXPLANATION_SUBMITTED, DENIED, READY_FOR_SUBMISSION.
- Queue: Use your standard background worker (e.g., Celery/RQ/Sidekiq/Cloud task) with concurrency 4–8; each task uses an idempotency key (line_item_id + stage).
- Locks: Use line_items.orchestrator_lock to avoid double-processing.
- Timeouts: If web ingest exceeds T seconds, show “Still checking…” chip in UI; item remains AWAITING_INGEST until resolved or user edits.

### 4.2 Front-end contract
- Items can be added continuously; each row shows status chips:
  - Validating, Awaiting Match, Searching, Matched, Price OK, Needs Explanation, Denied.
- Submit button stays disabled until every item is READY_FOR_SUBMISSION or explicitly removed.
- Explain action opens a modal; posts explanation; shows decision.

---

## 5) API surface (minimal, versioned)

```
POST /api/items/validate           → { verdict, reasons, score }
POST /api/items/match              → { matched: bool, canonical_item_id?, confidence }
POST /api/items/search_ingest      → { ingested: int, links: int }   # kicks matcher
POST /api/items/explain            → { accepted: bool, rejected_reason? }
GET  /api/items/{id}/status        → { status, stage_details }
```

Notes
- These should call into the CrewAI/agent layer you have, not re-implement logic in the controller.
- All endpoints traced in Langfuse with user_id, invoice_id, and line_item_id tags.

---

## 6) Prompts & models

- Pre-Validation prompt: concise, domain-anchored; return JSON with fields {verdict, score, reasons[]}.
- Web Searcher prompts: use for re-ranking (if needed); avoid LLM for parsing—prefer deterministic parsers.
- Rule Agent prompt: must consider service_line, service_type, hours_on_site, work_scope_text.
- Model tiers: small/fast for validation; standard for rules; fallback to premium only on NEEDS_REVIEW.

---

## 7) Testing

- Unit: validators, blacklist/allowlist, UoM normalization, price calc, per-vendor parsers.
- Integration: end-to-end from LINE_ITEM_ADDED → READY_FOR_SUBMISSION with mock vendors.
- Golden fixtures: store HTML snapshots for vendor PDPs; parse deterministically.
- Load tests: 1k items burst to ensure queue sizing is correct.
- Observability checks: Langfuse traces exist for every step; judge scores recorded.

---

## 8) Security & compliance
- Respect robots.txt where applicable; throttle requests; rotate UA; never store PHI/PII in traces.
- Vendor scraping behind a feature flag and allowlist; block arbitrary domains.
- API keys in env; no secrets in logs; redact URLs if they contain tokens.

---

## 9) Acceptance criteria (DoD)
- Validation-first pipeline active; junk items are blocked.
- On match miss, system ingests from whitelisted vendors and re-matches successfully for >=70% of misses.
- Rule/Explanation loop works end-to-end with clear user UX.
- Users can continue adding items while checks run; Submit is gated correctly.
- Langfuse tracing present for all stages; judge metrics visible.
