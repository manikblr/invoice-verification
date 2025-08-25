/**
 * Centralized agent description mapping
 * Version-controlled agent information for tooltips and documentation
 */

export interface AgentDescription {
  name: string
  purpose: string
  description: string
  stage: string
  icon: string
  tools: string[]
  dataSources: string[]
  inputs: string[]
  outputs: string[]
  version: string
  lastUpdated: string
}

export const AGENT_DESCRIPTIONS: Record<string, AgentDescription> = {
  'Item Matcher Agent': {
    name: 'Item Matcher Agent',
    purpose: 'Matches invoice line items to canonical catalog items using hybrid search algorithms',
    description: 'Employs a multi-stage matching process: exact string matching, synonym expansion, and fuzzy matching with RapidFuzz. Maintains confidence scoring and creates synonym proposals for items with >75% confidence.',
    stage: 'validation',
    icon: '🎯',
    tools: [
      'RapidFuzz string matching',
      'Canonical item database',
      'Synonym cache management',
      'Confidence scoring algorithm'
    ],
    dataSources: [
      'canonical-items',
      'item-synonyms',
      'product-catalog',
      'matching-history'
    ],
    inputs: [
      'Line item descriptions',
      'Item quantities and units',
      'Service line context',
      'Previous matching results'
    ],
    outputs: [
      'Canonical item matches',
      'Confidence scores (0.0-1.0)',
      'Match types (exact/synonym/fuzzy)',
      'Synonym proposals for approval'
    ],
    version: '2.1.0',
    lastUpdated: '2024-01-15'
  },

  'Price Learner Agent': {
    name: 'Price Learner Agent', 
    purpose: 'Validates unit prices against expected ranges and learns from pricing patterns',
    description: 'Analyzes pricing data using statistical methods with 20% variance thresholds. Creates PRICE_RANGE_ADJUST proposals for out-of-band prices and continuously learns from market data to improve price ranges.',
    stage: 'pricing',
    icon: '💰',
    tools: [
      'Statistical price analysis',
      'Variance threshold detection',
      'Price range learning algorithms',
      'Market data comparison'
    ],
    dataSources: [
      'pricing-data',
      'market-prices',
      'historical-costs',
      'vendor-price-books'
    ],
    inputs: [
      'Canonical item IDs',
      'User-submitted unit prices',
      'Quantity and unit information',
      'Market pricing context'
    ],
    outputs: [
      'Price validation results',
      'Price range recommendations',
      'Variance flags and alerts',
      'Learning adjustments'
    ],
    version: '1.8.0',
    lastUpdated: '2024-01-10'
  },

  'Rule Applier Agent': {
    name: 'Rule Applier Agent',
    purpose: 'Applies deterministic business rules to determine line item approval status',
    description: 'Processes comprehensive business rule set including canonical matching requirements, price validation, vendor exclusions, quantity limits, and blacklist checks. Provides stable policy codes for consistent decision tracking.',
    stage: 'compliance',
    icon: '📋',
    tools: [
      'Rule engine processor',
      'Policy evaluation matrix',
      'Decision tree logic',
      'Compliance checker'
    ],
    dataSources: [
      'business-rules',
      'vendor-policies',
      'compliance-data',
      'blacklist-database'
    ],
    inputs: [
      'Item matching results',
      'Price validation outcomes',
      'Vendor information',
      'Quantity and limits'
    ],
    outputs: [
      'ALLOW/DENY/NEEDS_MORE_INFO decisions',
      'Policy violation codes',
      'Rule-based explanations',
      'Compliance scores'
    ],
    version: '3.2.0',
    lastUpdated: '2024-01-20'
  },

  'Item Validator Agent': {
    name: 'Item Validator Agent',
    purpose: 'Validates user submissions for inappropriate content and abuse detection',
    description: 'LLM-powered content classification system that detects spam, profanity, inappropriate submissions, and ensures items are legitimate facility management materials. Includes rule-based fallback for reliability.',
    stage: 'validation',
    icon: '✅',
    tools: [
      'LLM content classification',
      'Profanity detection algorithms',
      'Spam pattern recognition',
      'Content policy enforcement'
    ],
    dataSources: [
      'content-policies',
      'classification-models',
      'facility-categories',
      'abuse-patterns'
    ],
    inputs: [
      'User-submitted item names',
      'Item descriptions',
      'Submission metadata',
      'User behavior patterns'
    ],
    outputs: [
      'APPROVED/REJECTED/NEEDS_REVIEW verdicts',
      'Content classification scores',
      'Abuse detection flags',
      'Policy violation details'
    ],
    version: '2.0.0',
    lastUpdated: '2024-01-25'
  },

  'Pre-Validation Agent': {
    name: 'Pre-Validation Agent',
    purpose: 'Performs initial validation checks before main processing pipeline',
    description: 'Conducts blacklist checks, structural validation, and LLM-powered content classification as the first stage. Prevents invalid submissions from entering the main pipeline.',
    stage: 'preprocessing', 
    icon: '🔍',
    tools: [
      'Blacklist checker',
      'Structural validator',
      'LLM classifier integration',
      'Pre-filtering logic'
    ],
    dataSources: [
      'blacklist-items',
      'validation-rules',
      'content-policies',
      'structural-schemas'
    ],
    inputs: [
      'Raw item submissions',
      'Basic item metadata',
      'User context',
      'Submission source'
    ],
    outputs: [
      'Pre-validation status',
      'Blacklist match results',
      'Structural validation results',
      'Content classification scores'
    ],
    version: '1.5.0',
    lastUpdated: '2024-01-18'
  },

  'Web Search & Ingest Agent': {
    name: 'Web Search & Ingest Agent',
    purpose: 'Searches external vendor websites and ingests new product data',
    description: 'Queue-based system that searches multiple vendor sites (Grainger, Home Depot, Amazon Business) when canonical matches fail. Uses deterministic parsing with CSS selectors and creates canonical item links.',
    stage: 'ingestion',
    icon: '🌐',
    tools: [
      'Multi-vendor web scraping',
      'CSS selector parsing',
      'Queue-based processing',
      'Anti-bot measures'
    ],
    dataSources: [
      'vendor-websites',
      'product-catalogs',
      'pricing-feeds',
      'canonical-mappings'
    ],
    inputs: [
      'Unmatched item names',
      'Search priority levels',
      'Vendor preferences',
      'Category hints'
    ],
    outputs: [
      'New product discoveries',
      'Canonical item links',
      'Pricing data updates',
      'Vendor availability info'
    ],
    version: '1.3.0',
    lastUpdated: '2024-01-12'
  },

  'Explanation Agent': {
    name: 'Explanation Agent',
    purpose: 'Generates and verifies detailed explanations for validation decisions',
    description: 'Provides comprehensive explanations for validation decisions, verifies explanation quality, and handles user requests for additional information through an explanation loop system.',
    stage: 'explanation',
    icon: '💭',
    tools: [
      'Explanation generation',
      'Quality verification',
      'User interaction handling',
      'Context synthesis'
    ],
    dataSources: [
      'validation-results',
      'agent-decisions',
      'explanation-templates',
      'user-feedback'
    ],
    inputs: [
      'Validation decisions',
      'Agent execution traces',
      'User explanation requests',
      'Context information'
    ],
    outputs: [
      'Detailed explanations',
      'Explanation quality scores',
      'User interaction responses',
      'Clarification requests'
    ],
    version: '1.1.0',
    lastUpdated: '2024-01-08'
  },

  'CrewAI Agent Pipeline': {
    name: 'CrewAI Agent Pipeline',
    purpose: 'Orchestrates the complete multi-agent validation workflow',
    description: 'Coordinates all specialized agents in proper sequence, manages state transitions, handles errors and retries, and provides comprehensive tracing through Langfuse integration.',
    stage: 'orchestration',
    icon: '🤖',
    tools: [
      'Agent orchestration framework',
      'Workflow state management',
      'Error handling and retries',
      'Langfuse trace integration'
    ],
    dataSources: [
      'all-agent-outputs',
      'pipeline-configuration',
      'execution-metrics',
      'orchestration-rules'
    ],
    inputs: [
      'Invoice data',
      'Service line context',
      'User preferences',
      'Pipeline configuration'
    ],
    outputs: [
      'Comprehensive validation results',
      'Agent execution summaries',
      'Decision explanations',
      'Performance metrics'
    ],
    version: '2.5.0',
    lastUpdated: '2024-01-25'
  }
}

/**
 * Get agent description by name
 */
export function getAgentDescription(agentName: string): AgentDescription | null {
  return AGENT_DESCRIPTIONS[agentName] || null
}

/**
 * Get all agent descriptions for a specific stage
 */
export function getAgentsByStage(stage: string): AgentDescription[] {
  return Object.values(AGENT_DESCRIPTIONS).filter(agent => agent.stage === stage)
}

/**
 * Get agent names that match a search query
 */
export function searchAgents(query: string): AgentDescription[] {
  const lowercaseQuery = query.toLowerCase()
  return Object.values(AGENT_DESCRIPTIONS).filter(agent => 
    agent.name.toLowerCase().includes(lowercaseQuery) ||
    agent.purpose.toLowerCase().includes(lowercaseQuery) ||
    agent.description.toLowerCase().includes(lowercaseQuery)
  )
}

/**
 * Get agent execution order based on typical pipeline flow
 */
export function getAgentExecutionOrder(): string[] {
  return [
    'Pre-Validation Agent',
    'Item Validator Agent', 
    'Item Matcher Agent',
    'Web Search & Ingest Agent',
    'Price Learner Agent',
    'Rule Applier Agent',
    'Explanation Agent'
  ]
}