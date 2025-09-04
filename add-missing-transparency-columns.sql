-- Add missing columns to line_item_validations table
-- Based on actual vs expected schema comparison

ALTER TABLE line_item_validations 
ADD COLUMN IF NOT EXISTS line_item_index INTEGER,
ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
ADD COLUMN IF NOT EXISTS primary_reason TEXT,
ADD COLUMN IF NOT EXISTS detailed_explanation TEXT,
ADD COLUMN IF NOT EXISTS supporting_factors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS canonical_match_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS canonical_match_name VARCHAR(500),
ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS pricing_analysis JSONB;

-- Add missing columns to agent_executions table if needed
ALTER TABLE agent_executions
ADD COLUMN IF NOT EXISTS data_sources_accessed JSONB DEFAULT '[]'::jsonb;

-- Create index on line_item_index for performance
CREATE INDEX IF NOT EXISTS idx_line_item_validations_line_item_index 
ON line_item_validations(line_item_index);

-- Add constraint for unique session + line item index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_session_line_item 
ON line_item_validations(session_id, line_item_index) 
WHERE line_item_index IS NOT NULL;