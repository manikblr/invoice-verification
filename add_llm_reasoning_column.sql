-- Migration to add llm_reasoning column to item_validation_events table
-- This supports the enhanced Pre-Validation agent with GPT-5 integration

-- Add llm_reasoning column to store GPT-5 validation explanations
ALTER TABLE item_validation_events 
ADD COLUMN IF NOT EXISTS llm_reasoning TEXT;

-- Add comment to document the column purpose
COMMENT ON COLUMN item_validation_events.llm_reasoning IS 'GPT-5 reasoning and explanation for validation decision from Pre-Validation agent';

-- Optionally add index for searching reasoning content (if you plan to query it often)
-- CREATE INDEX IF NOT EXISTS idx_item_validation_events_llm_reasoning ON item_validation_events USING gin (to_tsvector('english', llm_reasoning));