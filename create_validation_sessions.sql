-- Create validation_sessions table
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
  notes TEXT,
  
  CONSTRAINT valid_execution_time CHECK (total_execution_time >= 0),
  CONSTRAINT valid_agent_count CHECK (agent_count >= 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_validation_sessions_invoice_id ON validation_sessions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_created_at ON validation_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_status ON validation_sessions(overall_status);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_service_line ON validation_sessions(service_line_name);