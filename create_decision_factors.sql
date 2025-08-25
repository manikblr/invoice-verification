-- Create decision_factors table
CREATE TABLE IF NOT EXISTS decision_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_validation_id UUID NOT NULL REFERENCES line_item_validations(id) ON DELETE CASCADE,
  
  factor_type VARCHAR(100) NOT NULL, -- 'policy_match', 'price_check', 'catalog_match', 'compliance_check'
  factor_name VARCHAR(255) NOT NULL,
  factor_description TEXT,
  factor_weight DECIMAL(3,2), -- importance weight 0-1
  factor_result VARCHAR(50) NOT NULL, -- 'pass', 'fail', 'warning', 'info'
  factor_value JSONB, -- actual values that influenced decision
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_decision_factors_line_item ON decision_factors(line_item_validation_id);