// Agent Transparency & Explainability Types

export interface ValidationSession {
  id: string
  invoiceId: string
  userSession?: string
  createdAt: string
  updatedAt: string
  
  // Invoice data
  invoiceData: InvoiceData
  
  // Validation results
  validationResults: ValidationResults
  overallStatus: ValidationStatus
  
  // Execution metadata
  totalExecutionTime?: number // milliseconds
  langfuseTraceId?: string
  
  // Search optimization
  serviceLineName?: string
  notes?: string
}

export interface InvoiceData {
  scopeOfWork: string
  serviceLineId: number
  serviceTypeName: string
  laborHours: number
  items: LineItemInput[]
}

export interface LineItemInput {
  name: string
  quantity: number
  unit: string
  unitPrice: number
  type: 'material' | 'equipment' | 'labor'
}

export interface ValidationResults {
  summary: ValidationSummary
  lines: LineItemValidation[]
  overallDecision: ValidationStatus
  executionTime: number
}

export interface ValidationSummary {
  totalLines: number
  allow: number
  needsReview: number
  reject: number
}

export type ValidationStatus = 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT' | 'ERROR'

export interface LineItemValidation {
  id: string
  sessionId: string
  lineItemIndex: number
  
  // Item details
  itemName: string
  itemType: 'material' | 'equipment' | 'labor'
  quantity?: number
  unitPrice?: number
  unit?: string
  
  // Validation decision
  validationDecision: ValidationStatus
  confidenceScore?: number
  
  // Explanation data
  primaryReason?: string
  detailedExplanation?: string
  supportingFactors: string[]
  riskFactors: string[]
  
  // Matching information
  canonicalMatchId?: string
  canonicalMatchName?: string
  matchConfidence?: number
  
  // Pricing analysis
  pricingAnalysis?: PricingAnalysis
  
  createdAt: string
}

export interface PricingAnalysis {
  marketPrice?: {
    min: number
    max: number
    median: number
    source: string
  }
  userPrice: number
  variance?: number
  priceFlag?: 'within_range' | 'above_market' | 'below_market' | 'no_data'
  reasoning?: string
}

export interface AgentExecution {
  id: string
  sessionId: string
  
  // Agent identification
  agentName: string
  agentVersion?: string
  agentStage: AgentStage
  executionOrder: number
  
  // Execution metadata
  startTime: string
  endTime: string
  executionTime: number // milliseconds
  status: ExecutionStatus
  
  // Agent I/O
  inputData: Record<string, any>
  outputData: Record<string, any>
  
  // Reasoning and explanation
  reasoning?: AgentReasoning
  decisionRationale?: string
  confidenceScore?: number
  
  // Tools and data sources
  toolsUsed: string[]
  dataSourcesAccessed: string[]
  
  // Performance metrics
  tokenUsage?: TokenUsage
  apiCallsMade?: number
  
  createdAt: string
}

export type AgentStage = 
  | 'preprocessing' 
  | 'validation' 
  | 'pricing' 
  | 'compliance' 
  | 'final_decision'
  | 'item_matching'
  | 'policy_check'

export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'SKIPPED'

export interface AgentReasoning {
  hypothesis: string
  evidenceConsidered: Evidence[]
  rulesApplied: Rule[]
  dataPointsAnalyzed: DataPoint[]
  conclusion: string
  alternatives: Alternative[]
}

export interface Evidence {
  type: string
  source: string
  value: any
  confidence: number
  relevance: number
}

export interface Rule {
  ruleId: string
  ruleName: string
  ruleType: 'policy' | 'compliance' | 'business' | 'pricing'
  applied: boolean
  result: 'pass' | 'fail' | 'warning'
  description?: string
}

export interface DataPoint {
  name: string
  value: any
  source: string
  timestamp?: string
  importance: number
}

export interface Alternative {
  option: string
  reasoning: string
  confidence: number
  chosen: boolean
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
}

export interface ValidationExplanation {
  id: string
  lineItemValidationId: string
  
  // Explanation levels
  summaryExplanation: string // Level 1: Quick summary
  detailedExplanation?: string // Level 2: Detailed reasoning
  technicalExplanation?: string // Level 3: Full technical details
  
  // Explanation metadata
  explanationGeneratedAt: string
  explanationVersion: string
  
  // User interaction
  userHelpfulRating?: number // 1-5
  userFeedback?: string
  
  createdAt: string
}

export interface DecisionFactor {
  id: string
  lineItemValidationId: string
  
  factorType: 'policy_match' | 'price_check' | 'catalog_match' | 'compliance_check' | 'risk_assessment'
  factorName: string
  factorDescription?: string
  factorWeight?: number // 0-1
  factorResult: 'pass' | 'fail' | 'warning' | 'info'
  factorValue?: Record<string, any>
  
  createdAt: string
}

export interface ValidationTrace {
  session: ValidationSession
  lineItems: LineItemValidation[]
  agentExecutions: AgentExecution[]
  explanations: ValidationExplanation[]
  decisionFactors: DecisionFactor[]
}

// API Request/Response types
export interface EnhancedValidationRequest {
  scopeOfWork: string
  serviceLineId: number
  serviceTypeId: number
  laborHours: number
  items: LineItemInput[]
  
  // Transparency options
  includeAgentTraces?: boolean
  includeDetailedExplanations?: boolean
  explanationLevel?: 1 | 2 | 3 // Progressive disclosure level
}

export interface EnhancedValidationResponse {
  // Standard validation response
  invoiceId: string
  overallStatus: ValidationStatus
  summary: ValidationSummary
  lines: EnhancedLineItemResult[]
  
  // Enhanced transparency data
  agentTraces?: AgentExecution[]
  executionSummary: ExecutionSummary
  explanations: LineItemExplanation[]
  
  // Metadata
  traceId: string
  totalExecutionTime: number
  timestamp: string
}

export interface EnhancedLineItemResult {
  // Standard fields
  type: string
  input: LineItemInput
  status: ValidationStatus
  reasonCodes: string[]
  match?: {
    canonical: string
    confidence: number
  }
  pricing?: {
    min: number
    max: number
  }
  
  // Enhanced fields
  explanation: LineItemExplanation
  decisionFactors: DecisionFactor[]
  agentContributions: AgentContribution[]
  confidenceScore: number
}

export interface LineItemExplanation {
  summary: string // Level 1
  detailed?: string // Level 2
  technical?: string // Level 3
  reasoning: string[]
  confidence: number
  primaryFactors: string[]
  riskFactors: string[]
}

export interface AgentContribution {
  agentName: string
  stage: AgentStage
  decision: string
  confidence: number
  reasoning: string
  executionTime: number
}

export interface ExecutionSummary {
  totalAgents: number
  totalExecutionTime: number
  averageConfidence: number
  criticalPath: string[] // Most important agents in decision
  bottlenecks: string[] // Slowest agents
  errorCount: number
}

// Validation History types
export interface ValidationHistoryQuery {
  userId?: string
  startDate?: string
  endDate?: string
  status?: ValidationStatus
  serviceLine?: string
  itemName?: string
  limit?: number
  offset?: number
  sortBy?: 'date' | 'status' | 'executionTime'
  sortOrder?: 'asc' | 'desc'
}

export interface ValidationHistoryResponse {
  sessions: ValidationSessionSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ValidationSessionSummary {
  id: string
  invoiceId: string
  createdAt: string
  overallStatus: ValidationStatus
  totalExecutionTime?: number
  serviceLineName?: string
  invoiceData: InvoiceData
  validationResults?: ValidationResults
}

// Explanation generation types
export interface ExplanationTemplate {
  id: string
  scenario: string
  template: string
  variables: string[]
  level: 1 | 2 | 3
}

export interface ExplanationContext {
  lineItem: LineItemValidation
  agentExecutions: AgentExecution[]
  decisionFactors: DecisionFactor[]
  validationRules: Rule[]
}

// Error types
export interface ValidationError {
  code: string
  message: string
  details?: Record<string, any>
  agentName?: string
  stage?: AgentStage
}

// Configuration types
export interface TransparencyConfig {
  enableAgentTraces: boolean
  enableDetailedExplanations: boolean
  defaultExplanationLevel: 1 | 2 | 3
  maxTraceRetentionDays: number
  enablePerformanceMetrics: boolean
  enableUserFeedback: boolean
}