-- Fix database schema for transparency tables
-- This script ensures all required columns exist

-- Add missing column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'validation_sessions' 
        AND column_name = 'service_type_name'
    ) THEN
        ALTER TABLE validation_sessions ADD COLUMN service_type_name VARCHAR(255);
    END IF;
END $$;

-- Add missing column for notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'validation_sessions' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE validation_sessions ADD COLUMN notes TEXT;
    END IF;
END $$;

-- Recreate the view to ensure it works
DROP VIEW IF EXISTS validation_session_summary;
CREATE VIEW validation_session_summary AS
SELECT 
  vs.id,
  vs.invoice_id,
  vs.created_at,
  vs.overall_status,
  vs.total_execution_time,
  vs.service_line_name,
  vs.service_type_name,
  vs.item_count,
  COUNT(DISTINCT ae.id) as agent_count,
  COUNT(DISTINCT liv.id) as line_item_count,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'ALLOW' THEN liv.id END) as approved_items,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'NEEDS_REVIEW' THEN liv.id END) as review_items,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'REJECT' THEN liv.id END) as rejected_items
FROM validation_sessions vs
LEFT JOIN agent_executions ae ON vs.id = ae.session_id
LEFT JOIN line_item_validations liv ON vs.id = liv.session_id
GROUP BY vs.id, vs.invoice_id, vs.created_at, vs.overall_status, vs.total_execution_time, 
         vs.service_line_name, vs.service_type_name, vs.item_count;