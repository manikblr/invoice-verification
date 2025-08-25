const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const transparencySchema = `
-- Validation Sessions Table
CREATE TABLE IF NOT EXISTS validation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id VARCHAR(255) UNIQUE NOT NULL,
  user_session VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  invoice_data JSONB NOT NULL,
  validation_results JSONB,
  overall_status VARCHAR(50) DEFAULT 'NEEDS_REVIEW',
  total_execution_time INTEGER,
  langfuse_trace_id VARCHAR(255),
  service_line_name VARCHAR(255),
  notes TEXT
);

-- Agent Executions Table
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES validation_sessions(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL,
  agent_version VARCHAR(50) DEFAULT 'v1.0',
  agent_stage VARCHAR(100) NOT NULL,
  execution_order INTEGER NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  execution_time INTEGER NOT NULL,
  input_data JSONB,
  output_data JSONB,
  reasoning JSONB,
  confidence_score DECIMAL(3,2),
  status VARCHAR(50) DEFAULT 'SUCCESS',
  tools_used TEXT[],
  decision_rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Line Item Validations Table  
CREATE TABLE IF NOT EXISTS line_item_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES validation_sessions(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  item_name VARCHAR(500) NOT NULL,
  item_type VARCHAR(100),
  quantity DECIMAL(10,2),
  unit_price DECIMAL(10,2),
  validation_decision VARCHAR(50) NOT NULL,
  confidence_score DECIMAL(3,2),
  risk_factors TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation Explanations Table
CREATE TABLE IF NOT EXISTS validation_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_validation_id UUID REFERENCES line_item_validations(id) ON DELETE CASCADE,
  explanation_type VARCHAR(50) NOT NULL, -- 'summary', 'detailed', 'technical'
  content TEXT NOT NULL,
  primary_factors TEXT[],
  risk_factors TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Decision Factors Table
CREATE TABLE IF NOT EXISTS decision_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_validation_id UUID REFERENCES line_item_validations(id) ON DELETE CASCADE,
  factor_type VARCHAR(100) NOT NULL,
  factor_name VARCHAR(255) NOT NULL,
  factor_value TEXT,
  weight DECIMAL(3,2),
  impact_score DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_validation_sessions_invoice_id ON validation_sessions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_validation_sessions_created_at ON validation_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_executions_session_id ON agent_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_execution_order ON agent_executions(session_id, execution_order);
CREATE INDEX IF NOT EXISTS idx_line_item_validations_session_id ON line_item_validations(session_id);
CREATE INDEX IF NOT EXISTS idx_validation_explanations_line_item ON validation_explanations(line_item_validation_id);
CREATE INDEX IF NOT EXISTS idx_decision_factors_line_item ON decision_factors(line_item_validation_id);
`

async function setupTables() {
  try {
    console.log('Creating transparency tables...')
    
    const { error } = await supabase.rpc('exec', {
      query: transparencySchema
    })
    
    if (error) {
      console.error('Error creating tables:', error)
      process.exit(1)
    }
    
    console.log('✅ Transparency tables created successfully!')
    
    // Verify tables were created
    const { data, error: listError } = await supabase
      .rpc('exec', {
        query: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%validation%';`
      })
    
    if (listError) {
      console.error('Error listing tables:', listError)
    } else {
      console.log('Created tables:', data)
    }
    
  } catch (error) {
    console.error('Setup failed:', error)
    process.exit(1)
  }
}

setupTables()