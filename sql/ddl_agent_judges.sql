-- Agent Judges DDL - Idempotent SQL for judge evaluations and golden labels
-- Safe to run multiple times - no destructive changes

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1. Agent Judgements - per-line, per-run judge scores (online & offline)
create table if not exists agent_judgements (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null,
    line_item_id text,
    stage text not null check (stage in ('post_decision', 'offline_eval')),
    scores jsonb not null,
    verdict text not null check (verdict in ('PASS', 'WARN', 'FAIL')),
    comments text,
    expected jsonb,
    created_at timestamptz not null default now()
);

-- Expected JSON shapes:
-- scores: {"decision_correct": 1, "policy_justified": 0.9, "reason_quality": 0.85, "match_correct": 1, "price_check_correct": 1}
-- expected: {"decision": "DENY", "canonical_item_id": "uuid", "policy_codes": ["PRICE_EXCEEDS_MAX_150"]}

-- Indexes for common queries
create index if not exists idx_agent_judgements_created_at on agent_judgements (created_at desc);
create index if not exists idx_agent_judgements_stage on agent_judgements (stage);
create index if not exists idx_agent_judgements_invoice_id on agent_judgements (invoice_id);
create index if not exists idx_agent_judgements_line_item_id on agent_judgements (line_item_id) where line_item_id is not null;
create index if not exists idx_agent_judgements_verdict on agent_judgements (verdict);

-- 2. Agent Eval Runs - metadata for eval batches
create table if not exists agent_eval_runs (
    id uuid primary key default gen_random_uuid(),
    run_type text not null check (run_type in ('online', 'offline')),
    params jsonb not null,
    created_at timestamptz not null default now()
);

-- Expected params JSON shape:
-- {"since": "2025-08-01", "until": "2025-08-20", "k": 5, "judge_model": "gpt-4", "criteria": ["decision_correct", "policy_justified"]}

-- Indexes for eval run queries
create index if not exists idx_agent_eval_runs_created_at on agent_eval_runs (created_at desc);
create index if not exists idx_agent_eval_runs_run_type on agent_eval_runs (run_type);

-- 3. Agent Golden Labels - stable lookup by fingerprint for gold labels
create table if not exists agent_golden_labels (
    id uuid primary key default gen_random_uuid(),
    line_item_fingerprint text not null,
    expected_decision text not null check (expected_decision in ('ALLOW', 'DENY', 'NEEDS_MORE_INFO')),
    expected_canonical_id uuid,
    expected_policy_codes text[],
    note text,
    created_at timestamptz not null default now()
);

-- Unique constraint on fingerprint (stable hash of normalized_description + vendor_id)
create unique index if not exists idx_agent_golden_labels_fingerprint on agent_golden_labels (line_item_fingerprint);

-- Index for queries
create index if not exists idx_agent_golden_labels_created_at on agent_golden_labels (created_at desc);
create index if not exists idx_agent_golden_labels_expected_decision on agent_golden_labels (expected_decision);