-- Agent Transparency Database Schema
-- This schema supports full traceability of validation decisions and agent executions

-- Validation sessions table - stores complete validation attempts
CREATE TABLE IF NOT EXISTS validation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id VARCHAR(255) UNIQUE NOT NULL,
  user_session VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Invoice data
  invoice_data JSONB NOT NULL,
  
  -- Overall validation results
  validation_results JSONB NOT NULL,
  overall_status VARCHAR(50) NOT NULL CHECK (overall_status IN ('ALLOW', 'NEEDS_REVIEW', 'REJECT', 'ERROR')),
  
  -- Execution metadata
  total_execution_time INTEGER, -- milliseconds
  agent_count INTEGER DEFAULT 0,
  langfuse_trace_id VARCHAR(255),
  
  -- Search optimization
  service_line_name VARCHAR(255),
  service_type_name VARCHAR(255),
  item_count INTEGER DEFAULT 0,
  
  CONSTRAINT valid_execution_time CHECK (total_execution_time >= 0),
  CONSTRAINT valid_agent_count CHECK (agent_count >= 0)
);

-- Line item validations table - detailed results per item
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

-- Agent execution logs table - complete agent pipeline trace
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES validation_sessions(id) ON DELETE CASCADE,
  
  -- Agent identification
  agent_name VARCHAR(255) NOT NULL,
  agent_version VARCHAR(50),
  agent_stage VARCHAR(100) NOT NULL, -- 'preprocessing', 'validation', 'pricing', 'compliance', 'final_decision'
  execution_order INTEGER NOT NULL,
  
  -- Execution metadata
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  execution_time INTEGER NOT NULL, -- milliseconds
  status VARCHAR(50) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'TIMEOUT', 'SKIPPED')),
  
  -- Agent I/O
  input_data JSONB NOT NULL,
  output_data JSONB NOT NULL,
  
  -- Reasoning and explanation
  reasoning JSONB,
  decision_rationale TEXT,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Tools and data sources
  tools_used JSONB DEFAULT '[]',
  data_sources_accessed JSONB DEFAULT '[]',
  
  -- Performance metrics
  token_usage JSONB,
  api_calls_made INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_execution_time CHECK (execution_time >= 0),
  CONSTRAINT valid_timing CHECK (end_time >= start_time),
  CONSTRAINT unique_session_agent_order UNIQUE (session_id, agent_name, execution_order)
);

-- Validation explanations table - human-readable explanations
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

-- Decision factors table - specific reasons for decisions
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_validation_sessions_invoice_id ON validation_sessions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_created_at ON validation_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_status ON validation_sessions(overall_status);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_service_line ON validation_sessions(service_line_name);

CREATE INDEX IF NOT EXISTS idx_line_item_validations_session_id ON line_item_validations(session_id);
CREATE INDEX IF NOT EXISTS idx_line_item_validations_decision ON line_item_validations(validation_decision);
CREATE INDEX IF NOT EXISTS idx_line_item_validations_item_name ON line_item_validations(item_name);

CREATE INDEX IF NOT EXISTS idx_agent_executions_session_id ON agent_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_name ON agent_executions(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_executions_execution_order ON agent_executions(session_id, execution_order);
CREATE INDEX IF NOT EXISTS idx_agent_executions_start_time ON agent_executions(start_time);

CREATE INDEX IF NOT EXISTS idx_validation_explanations_line_item ON validation_explanations(line_item_validation_id);
CREATE INDEX IF NOT EXISTS idx_decision_factors_line_item ON decision_factors(line_item_validation_id);

-- Views for common queries
CREATE OR REPLACE VIEW validation_session_summary AS
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

-- Function to update session metadata
CREATE OR REPLACE FUNCTION update_validation_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE validation_sessions 
  SET 
    item_count = (SELECT COUNT(*) FROM line_item_validations WHERE session_id = NEW.session_id),
    updated_at = NOW()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update session stats
DROP TRIGGER IF EXISTS trigger_update_session_stats ON line_item_validations;
CREATE TRIGGER trigger_update_session_stats
  AFTER INSERT OR UPDATE OR DELETE ON line_item_validations
  FOR EACH ROW EXECUTE FUNCTION update_validation_session_stats();

-- Cleanup function for old data
CREATE OR REPLACE FUNCTION cleanup_old_validation_data(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM validation_sessions 
  WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE validation_sessions IS 'Stores complete validation session data with results and metadata';
COMMENT ON TABLE line_item_validations IS 'Detailed validation results for each line item in an invoice';
COMMENT ON TABLE agent_executions IS 'Complete trace of all agents that processed a validation session';
COMMENT ON TABLE validation_explanations IS 'Human-readable explanations at different detail levels';
COMMENT ON TABLE decision_factors IS 'Specific factors that influenced validation decisions';

-- Grant permissions (adjust for your specific roles)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO validation_api;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO validation_api;