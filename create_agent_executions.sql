-- Create agent_executions table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agent_executions_session_id ON agent_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_name ON agent_executions(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_executions_execution_order ON agent_executions(session_id, execution_order);
CREATE INDEX IF NOT EXISTS idx_agent_executions_start_time ON agent_executions(start_time);