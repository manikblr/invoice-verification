# Plan.md
**Last updated:** 2025-08-22 00:00:00

This is the execution plan with phases, tasks, and checklists for a junior developer. Follow the order; do not skip review gates.

---

## Phase 0 — Read & Local Setup (0.5 day)
- [ ] Read `AGENT_ARCHITECTURE.md` end-to-end.
- [ ] Run the app locally; confirm Langfuse and OpenRouter connectivity (use safe test keys).
- [ ] Explore existing routes:
      - `app/api/agent_run_crew/route.ts` (invoice processing)
      - `app/api/validate_item/route.ts` (validation)
      - `app/api/performance/route.ts` (metrics)
- [ ] Create a `feature/validation-first` branch.

**Gate:** You can describe current Item Matcher, Price Validator, Rule Agent, and Item Validator responsibilities and how traces land in Langfuse.

---

## Phase 1 — Pre-Validation Agent (1 day)
- [ ] Add SQL migration for `item_validation_events`.
- [ ] Implement blacklist checks (helper, labor/labour, technician, fees, visit, charges, tax, gst, vat, misc, --, n/a, numeric-only, symbols-only).
- [ ] Implement LLM mini-classifier with JSON output `{verdict, score, reasons[]}`.
- [ ] Add endpoint `POST /api/items/validate` calling the agent.
- [ ] Update orchestrator: on APPROVED → `AWAITING_MATCH`; on REJECTED → `VALIDATION_REJECTED`.
- [ ] Add Langfuse prompt `validator_v2` and trace fields.
- [ ] Unit tests for blacklist, structure, and LLM JSON parsing.

**Gate:** 95%+ of obvious junk rejected in a synthetic dataset. Traces visible.

---

## Phase 2 — Item Matcher hooks (0.5 day)
- [ ] Ensure matcher runs only on APPROVED items.
- [ ] On match miss, publish `MATCH_MISS` event, set status `AWAITING_INGEST`.
- [ ] Add `GET /api/items/{id}/status` with state + stage details.
- [ ] Integration test: NEW → APPROVED → AWAITING_INGEST.

**Gate:** Events fire reliably; idempotency on replays.

---

## Phase 3 — Web Searcher & Ingester (3–4 days)
- [ ] Add SQL migrations for `external_item_sources` and `canonical_item_links`.
- [ ] Create `web_ingest` worker with a queue (concurrency 4–8).
- [ ] Implement Playwright fetcher with per-vendor strategies (start with Grainger & Home Depot).
- [ ] Build deterministic parsers (no LLM) for `name, sku, price, currency, uom, pack_qty`.
- [ ] Normalizer: UoM mapping + pack→unit conversion; compute `last_price` (per-unit).
- [ ] Upsert to `external_item_sources`; try auto-link with fuzzy score to nearest canonical.
- [ ] After ingest, trigger matcher retry for the line item.
- [ ] Feature flag: `FEATURE_WEB_INGEST`.
- [ ] Langfuse trace `web_ingest_v1` with vendor, url, parse ms.

**Gate:** For a curated set of 50 items, >=70% of initial match misses become matched after ingest. Zero LLM parsing.

---

## Phase 4 — Price Validator alignment (0.5–1 day)
- [ ] Ensure validator reads newly ingested prices; treat as provisional bands if needed.
- [ ] Keep proposals for `PRICE_RANGE_ADJUST` working.
- [ ] Integration test: matched item with only external price → accepted with provisional tolerance.

**Gate:** Price paths green on CI; traces show decisions.

---

## Phase 5 — Rule Agent + Explanation Loop (2 days)
- [ ] Add `line_item_explanations` table.
- [ ] Extend Rule Agent with `MATERIAL_INCONSISTENT_WITH_CONTEXT` rule.
- [ ] UI: “Explain” modal posting to `POST /api/items/explain`.
- [ ] Agent verifies explanation; sets `accepted` or `rejected_reason` and transitions status.
- [ ] Add judge prompts to evaluate clarity of the rule decision (optional).

**Gate:** End-to-end demo where item is flagged, user explains, and agent accepts/denies consistently.

---

## Phase 6 — Orchestration & Front-end UX (1–2 days)
- [ ] Implement domain events and queue consumers for each stage.
- [ ] Add status chips on each line item row.
- [ ] Disable Submit until all items are `READY_FOR_SUBMISSION` (or removed).
- [ ] Idempotency keys & `orchestrator_lock` usage.
- [ ] Timeouts and “Still checking…” chip when web ingest is slow.

**Gate:** Add 10 items rapidly; pipeline works concurrently; submission gates behave.

---

## Phase 7 — Testing, Observability, and Staging (1–2 days)
- [ ] Golden HTML fixtures for vendor pages; parser unit tests.
- [ ] E2E test covering NEW → READY_FOR_SUBMISSION with/without explanation.
- [ ] Langfuse dashboards: filter by invoice_id, stage heatmap.
- [ ] Deploy behind feature flags to staging; run smoke tests.

**Gate:** All tests pass; staging is stable for 24h with test data.

---

## Non-goals & risks
- General web crawling (stay on allowlisted vendors).
- LLM-based HTML parsing (too brittle/costly).
- Fighting hard anti-bot measures at scale (time-box; escalate if blocking).

---

## PR checklist
- [ ] Migrations reviewed and reversible.
- [ ] Feature flags default OFF in production.
- [ ] New endpoints documented.
- [ ] Langfuse traces verified.
- [ ] Benchmarks recorded (latency per stage).
