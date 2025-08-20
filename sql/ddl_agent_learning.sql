-- Agent Learning DDL - Idempotent SQL for agent traces, proposals, human feedback, and vendor catalog
-- Safe to run multiple times - no destructive changes

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1. Agent Events - Append-only event log for agent traces
create table if not exists agent_events (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid,
    line_item_id uuid,
    stage text not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
);

-- Index for common queries on stage and timestamps
create index if not exists idx_agent_events_stage on agent_events (stage);
create index if not exists idx_agent_events_created_at on agent_events (created_at desc);
create index if not exists idx_agent_events_invoice_id on agent_events (invoice_id) where invoice_id is not null;

-- 2. Agent Proposals - Proposed mutations (never auto-apply in dry-run)
create table if not exists agent_proposals (
    id uuid primary key default gen_random_uuid(),
    proposal_type text not null check (proposal_type in ('NEW_CANONICAL', 'NEW_SYNONYM', 'PRICE_RANGE_ADJUST', 'NEW_RULE')),
    payload jsonb not null,
    status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED')) default 'PENDING',
    created_by text not null default 'agent',
    created_at timestamptz not null default now(),
    approved_by text,
    approved_at timestamptz
);

-- Expected payload shapes per proposal type:
-- NEW_CANONICAL: {"name": "string", "category": "string", "description": "string"}
-- NEW_SYNONYM: {"canonical_item_id": "uuid", "synonym": "string", "confidence": 0.95}
-- PRICE_RANGE_ADJUST: {"canonical_item_id": "uuid", "old_range": [min, max], "new_range": [min, max], "reason": "string"}
-- NEW_RULE: {"rule_type": "string", "conditions": {}, "actions": {}, "description": "string"}

-- Index for common queries on status and type
create index if not exists idx_agent_proposals_status on agent_proposals (status);
create index if not exists idx_agent_proposals_type on agent_proposals (proposal_type);
create index if not exists idx_agent_proposals_created_at on agent_proposals (created_at desc);

-- 3. Human Feedback - HIL decisions & rationale
create table if not exists human_feedback (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null,
    line_item_id uuid,
    decision text not null check (decision in ('ALLOW', 'DENY', 'NEEDS_MORE_INFO')),
    reason text,
    by_user text not null,
    related_proposal_id uuid,
    created_at timestamptz not null default now()
);

-- Index for common queries on decisions and users
create index if not exists idx_human_feedback_decision on human_feedback (decision);
create index if not exists idx_human_feedback_by_user on human_feedback (by_user);
create index if not exists idx_human_feedback_invoice_id on human_feedback (invoice_id);
create index if not exists idx_human_feedback_created_at on human_feedback (created_at desc);

-- 4. Vendor Catalog Items - Cache of vendor SKUs to canonical IDs
create table if not exists vendor_catalog_items (
    id uuid primary key default gen_random_uuid(),
    vendor_id text not null,
    vendor_sku text not null,
    name text not null,
    normalized_name text generated always as (lower(regexp_replace(name, '\s+', ' ', 'g'))) stored,
    canonical_item_id uuid,
    updated_at timestamptz not null default now()
);

-- Unique constraint on vendor + SKU combination
create unique index if not exists idx_vendor_catalog_unique on vendor_catalog_items (vendor_id, vendor_sku);

-- Index for search on normalized names
create index if not exists idx_vendor_catalog_normalized_name on vendor_catalog_items (normalized_name);
create index if not exists idx_vendor_catalog_vendor_id on vendor_catalog_items (vendor_id);
create index if not exists idx_vendor_catalog_canonical_item_id on vendor_catalog_items (canonical_item_id) where canonical_item_id is not null;