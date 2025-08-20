-- SQL queries for offline agent evaluation
-- Portable queries compatible with PostgreSQL and similar databases

-- get_latest_run_id(dataset)
-- Get the most recent completed agent evaluation run for a dataset
SELECT run_id 
FROM agent_eval_runs 
WHERE dataset = %s 
  AND status = 'completed'
ORDER BY created_at DESC 
LIMIT 1;

-- get_golden_labels(dataset) 
-- Load golden truth labels for evaluation dataset
SELECT 
    line_id,
    dataset,
    gold_policy,
    gold_canonical_item_id
FROM agent_golden_labels 
WHERE dataset = %s
ORDER BY line_id;

-- get_run_decisions(run_id)
-- Get agent decisions for a specific run with optional candidates
SELECT 
    ae.line_id,
    ae.payload->>'policy' as pred_policy,
    ae.payload->>'canonical_item_id' as pred_canonical_item_id,
    ae.payload->'candidates' as candidates_json,
    ae.created_at,
    ae.payload->'metadata' as metadata
FROM agent_events ae
WHERE ae.run_id = %s 
  AND ae.event_type = 'decision'
ORDER BY ae.line_id;

-- get_judge_scores(run_id)
-- Get judge evaluation scores for a run (optional join)
SELECT 
    aj.line_id,
    aj.run_id,
    aj.decision_correct,
    aj.policy_justified, 
    aj.price_check_valid,
    aj.explanation_quality,
    aj.overall_score,
    aj.created_at as judge_timestamp
FROM agent_judgements aj
WHERE aj.run_id = %s
ORDER BY aj.line_id;

-- get_run_metadata(run_id)
-- Get basic run information and metadata
SELECT 
    run_id,
    dataset,
    status,
    created_at,
    updated_at,
    metadata
FROM agent_eval_runs
WHERE run_id = %s;

-- verify_dataset_exists(dataset)
-- Check if dataset has any golden labels
SELECT COUNT(*) as label_count
FROM agent_golden_labels
WHERE dataset = %s;

-- get_run_summary_stats(run_id)
-- Get basic statistics about a run's decisions
SELECT 
    COUNT(*) as total_decisions,
    COUNT(CASE WHEN ae.payload->>'policy' = 'ALLOW' THEN 1 END) as allow_count,
    COUNT(CASE WHEN ae.payload->>'policy' = 'DENY' THEN 1 END) as deny_count,
    COUNT(CASE WHEN ae.payload->>'policy' = 'NEEDS_MORE_INFO' THEN 1 END) as needs_info_count,
    COUNT(CASE WHEN ae.payload->>'canonical_item_id' IS NOT NULL THEN 1 END) as matched_items
FROM agent_events ae
WHERE ae.run_id = %s 
  AND ae.event_type = 'decision';