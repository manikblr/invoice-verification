-- Create line_item_validations table
CREATE TABLE IF NOT EXISTS line_item_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES validation_sessions(id) ON DELETE CASCADE,
  line_item_index INTEGER NOT NULL,
  
  -- Item details
  item_name VARCHAR(500) NOT NULL,
  item_type VARCHAR(50) NOT NULL, -- 'material', 'equipment', 'labor'
  quantity DECIMAL(10,2),
  unit_price DECIMAL(10,2),
  unit VARCHAR(50),
  
  -- Validation decision
  validation_decision VARCHAR(50) NOT NULL CHECK (validation_decision IN ('ALLOW', 'NEEDS_REVIEW', 'REJECT')),
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Explanation data
  primary_reason VARCHAR(500),
  detailed_explanation TEXT,
  supporting_factors JSONB DEFAULT '[]',
  risk_factors JSONB DEFAULT '[]',
  
  -- Matching information
  canonical_match_id VARCHAR(255),
  canonical_match_name VARCHAR(500),
  match_confidence DECIMAL(3,2),
  
  -- Pricing analysis
  pricing_analysis JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_session_item UNIQUE (session_id, line_item_index)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_line_item_validations_session_id ON line_item_validations(session_id);
CREATE INDEX IF NOT EXISTS idx_line_item_validations_decision ON line_item_validations(validation_decision);
CREATE INDEX IF NOT EXISTS idx_line_item_validations_item_name ON line_item_validations(item_name);