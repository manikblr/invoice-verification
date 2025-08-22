-- Add tables for validation-first pipeline implementation
-- Migration: 20250822040000_add_validation_pipeline_tables.sql

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

-- F. Add status and orchestrator_lock columns to invoice_line_items if they don't exist
-- Note: We'll add these conditionally since the table structure may already exist
do $$
begin
  -- Add status column if not exists
  if not exists (select 1 from information_schema.columns 
                where table_name = 'invoice_line_items' and column_name = 'status') then
    alter table invoice_line_items add column status line_item_status default 'NEW';
  end if;
  
  -- Add orchestrator_lock column if not exists
  if not exists (select 1 from information_schema.columns 
                where table_name = 'invoice_line_items' and column_name = 'orchestrator_lock') then
    alter table invoice_line_items add column orchestrator_lock text;
  end if;
end
$$;

-- Indexes for performance
create index if not exists idx_item_validation_events_line on item_validation_events(line_item_id);
create index if not exists idx_external_item_sources_vendor on external_item_sources(source_vendor);
create index if not exists idx_external_item_sources_name on external_item_sources using gin (to_tsvector('english', item_name));
create index if not exists idx_canonical_item_links_canonical on canonical_item_links(canonical_item_id);
create index if not exists idx_invoice_line_items_status on invoice_line_items(status) where status is not null;
create index if not exists idx_line_item_explanations_line on line_item_explanations(line_item_id);
create index if not exists idx_external_item_sources_created on external_item_sources(created_at);

-- Additional indexes for performance optimization
create index if not exists idx_item_validation_events_verdict on item_validation_events(verdict);
create index if not exists idx_item_validation_events_created on item_validation_events(created_at);
create index if not exists idx_line_item_explanations_accepted on line_item_explanations(accepted) where accepted is not null;