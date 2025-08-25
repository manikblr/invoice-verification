-- Create validation_explanations table
CREATE TABLE IF NOT EXISTS validation_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_validation_id UUID NOT NULL REFERENCES line_item_validations(id) ON DELETE CASCADE,
  
  -- Explanation levels
  summary_explanation TEXT NOT NULL, -- Level 1: Quick summary
  detailed_explanation TEXT, -- Level 2: Detailed reasoning
  technical_explanation TEXT, -- Level 3: Full technical details
  
  -- Explanation metadata
  explanation_generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  explanation_version VARCHAR(50) DEFAULT '1.0',
  
  -- User interaction
  user_helpful_rating INTEGER CHECK (user_helpful_rating >= 1 AND user_helpful_rating <= 5),
  user_feedback TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_validation_explanations_line_item ON validation_explanations(line_item_validation_id);