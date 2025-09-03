'use client'

import { AgentExecution, ExecutionSummary } from '@/lib/types/transparency'

interface AgentPipelineVisualizationProps {
  agentExecutions: AgentExecution[]
  executionSummary: ExecutionSummary
  className?: string
}

export default function AgentPipelineVisualization({
  agentExecutions,
  executionSummary,
  className = ''
}: AgentPipelineVisualizationProps) {
  const getStageColor = (stage: string) => {
    const colors = {
      'preprocessing': 'bg-blue-100 border-blue-300 text-blue-800',
      'validation': 'bg-green-100 border-green-300 text-green-800',
      'pricing': 'bg-purple-100 border-purple-300 text-purple-800',
      'compliance': 'bg-orange-100 border-orange-300 text-orange-800',
      'final_decision': 'bg-red-100 border-red-300 text-red-800',
      'item_matching': 'bg-indigo-100 border-indigo-300 text-indigo-800',
      'policy_check': 'bg-pink-100 border-pink-300 text-pink-800'
    }
    return colors[stage as keyof typeof colors] || 'bg-gray-100 border-gray-300 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '✅'
      case 'FAILED': return '❌'
      case 'TIMEOUT': return '⏱️'
      case 'SKIPPED': return '⏭️'
      default: return '❓'
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatAgentInput = (agent: AgentExecution): string => {
    const input = agent.inputData
    if (!input) return 'No input data'
    
    // Pre-Validation Agent - Show complete service context
    if (agent.agentName === 'Pre-Validation Agent' && input.itemName) {
      const parts = [`Item: "${input.itemName}" (${input.itemType || 'material'})`]
      if (input.serviceLine) parts.push(`Service Line: ${input.serviceLine}`)
      if (input.serviceType) parts.push(`Service Type: ${input.serviceType}`)
      if (input.scopeOfWork) parts.push(`Scope: ${input.scopeOfWork.length > 40 ? input.scopeOfWork.substring(0, 40) + '...' : input.scopeOfWork}`)
      return parts.join(', ')
    }
    
    // Rule Applier Agent - Show comprehensive rule context
    if (agent.agentName === 'Rule Applier Agent' && input.itemName) {
      const parts = [`Item: "${input.itemName}"`]
      if (input.unitPrice !== undefined) parts.push(`Price: $${input.unitPrice}`)
      if (input.quantity !== undefined) parts.push(`Qty: ${input.quantity}`)
      if (input.serviceLine) parts.push(`Service: ${input.serviceLine}`)
      if (input.matchConfidence !== undefined) parts.push(`Match: ${Math.round(input.matchConfidence * 100)}%`)
      return parts.join(', ')
    }
    
    // Other agents - Enhanced format
    if (input.itemName) {
      const parts = [`Item: "${input.itemName}"`]
      if (input.itemType && input.itemType !== 'material') parts.push(`Type: ${input.itemType}`)
      if (input.unitPrice !== undefined) parts.push(`Price: $${input.unitPrice}`)
      if (input.quantity !== undefined && input.quantity !== 1) parts.push(`Qty: ${input.quantity}`)
      if (input.matchConfidence !== undefined) parts.push(`Confidence: ${Math.round(input.matchConfidence * 100)}%`)
      if (input.canonicalItemId) parts.push(`Canonical: ${input.canonicalItemId}`)
      return parts.join(', ')
    }
    
    // Legacy format for other data
    if (input.scopeOfWork) {
      return `Scope: "${input.scopeOfWork}"`
    }
    if (input.line_item_id || input.lineItemId) {
      return `Processing item #${input.line_item_id || input.lineItemId}`
    }
    
    // Format common properties as fallback
    const keys = Object.keys(input).slice(0, 3)
    return keys.map(key => `${key}: ${JSON.stringify(input[key]).substring(0, 30)}${JSON.stringify(input[key]).length > 30 ? '...' : ''}`).join(', ')
  }

  const formatAgentOutput = (agent: AgentExecution): string => {
    const output = agent.outputData
    if (!output) return 'No output data'
    
    if (output.status) {
      return `Status: ${output.status}${output.message ? ` - ${output.message}` : ''}`
    }
    if (output.decision) {
      return `Decision: ${output.decision}${output.confidence ? ` (${Math.round(output.confidence * 100)}% confidence)` : ''}`
    }
    if (output.canonicalItemId) {
      return `Matched: ${output.canonicalItemId} (${Math.round((output.confidence || 0) * 100)}% confidence)`
    }
    if (output.processedItems !== undefined) {
      return `Processed ${output.processedItems} items successfully`
    }
    
    // Format common properties
    const keys = Object.keys(output).slice(0, 2)
    return keys.map(key => `${key}: ${JSON.stringify(output[key]).substring(0, 40)}${JSON.stringify(output[key]).length > 40 ? '...' : ''}`).join(', ')
  }

  const getAgentInfo = (agentName: string) => {
    const agentDescriptions: Record<string, any> = {
      'Pre-Validation Agent': {
        description: 'Enhanced GPT-5 relevance validation with smart explanation prompting for items with uncertain relevance',
        role: 'Advanced Service Context Validation & Smart Explanation Generation',
        prompt: 'Use enhanced GPT-5 to distinguish between invalid items vs valid FM items with unclear relevance, generating specific user questions.',
        fullPrompt: 'You are an Enhanced Pre-Validation Agent powered by GPT-5 via OpenRouter with advanced relevance assessment. Your enhanced responsibilities:\n\n1. Smart Relevance Validation: Use GPT-5 to assess if items are relevant to the service context with nuanced confidence scoring\n2. Intelligent Thresholds: Apply smart thresholds (0.7+ approve, 0.4-0.6 explain, 0.3- reject)\n3. Explanation Prompt Generation: Create specific questions for users when items appear valid but relevance is unclear\n4. Content Safety: Check for blacklisted terms and inappropriate content\n5. Structure Validation: Ensure proper formatting and legitimate facility management items\n\nEnhanced Decision Logic:\n- High confidence (0.7+): Direct approval for clearly relevant items\n- Medium confidence (0.4-0.6): Valid FM items but unclear relevance → Generate specific user explanation prompts\n- Low confidence (0.3-): Reject clearly irrelevant items\n\nThe system now intelligently handles the gap between "valid FM item" and "relevant to this specific service context".\n\nReturn APPROVED/REJECTED/NEEDS_REVIEW with confidence scores, detailed reasoning, and contextual explanation prompts.',
        model: 'GPT-5 (openai/gpt-5) via OpenRouter',
        icon: '🛡️'
      },
      'Item Validator Agent': {
        description: 'Uses LLM to classify content and detect inappropriate facility management items with fallback rules',
        role: 'Content Classification & Appropriateness',
        prompt: 'Classify this item for appropriateness in facility management context. Detect spam, profanity, or non-facility items.',
        fullPrompt: 'You are an Item Validator Agent using advanced NLP to classify invoice items. Your responsibilities:\n\n1. Content Classification: Determine if this is a legitimate facility management item\n2. Spam Detection: Identify spam, gibberish, or test entries\n3. Profanity Filter: Flag inappropriate language or content\n4. Context Validation: Ensure item makes sense for commercial/facility use\n\nAnalyze the item name and description. Consider:\n- Is this a real product/service?\n- Does it belong in facility management?\n- Is the language appropriate?\n- Could this be spam or abuse?\n\nReturn VALID with confidence score, or INVALID with detailed reasoning.',
        model: 'LLM Classifier (OpenRouter) with Rule-based Fallback',
        icon: '✅'
      },
      'Item Matcher Agent': {
        description: 'Matches invoice items to canonical catalog using hybrid search algorithms',
        role: 'Catalog Matching & Item Identification',
        prompt: 'Find the best matching canonical item using exact, synonym, and fuzzy matching. Provide confidence score.',
        fullPrompt: 'You are an Item Matcher Agent using hybrid search algorithms to find canonical matches. Your process:\n\n1. Exact Match: Look for direct matches in canonical catalog\n2. Synonym Matching: Use domain-specific synonyms and variations\n3. Fuzzy Matching: Apply string similarity algorithms for partial matches\n4. Embedding Search: Use semantic similarity for conceptual matches\n\nFor the given item, search through our canonical catalog using:\n- Direct string matching\n- Industry terminology synonyms\n- Fuzzy string algorithms (Levenshtein, Jaro-Winkler)\n- Vector embeddings for semantic similarity\n\nReturn the best matching canonical_item_id with confidence score (0-1). If confidence < 0.7, recommend web search.',
        model: 'RapidFuzz + Synonym Cache (No LLM)',
        icon: '🎯'
      },
      'Web Search & Ingest Agent': {
        description: 'Enhanced web search with GPT-5 material/equipment classification and automatic canonical item creation',
        role: 'External Data Discovery & GPT-5 Classification',
        prompt: 'Search vendor sites for items and use GPT-5 to classify as material/equipment, then create canonical entries with proper classification.',
        fullPrompt: 'You are an Enhanced Web Search & Ingest Agent with price collection and GPT-5 classification. Your workflow:\n\n1. Multi-Vendor Price Collection:\n   - Search Grainger, Home Depot, Amazon Business simultaneously\n   - Extract prices, SKUs, and availability from each vendor\n   - Store all prices in external_item_sources table\n   - Create price ranges from aggregated vendor prices\n\n2. GPT-5 Material/Equipment Classification:\n   - Use OpenRouter API to classify items with 99% accuracy\n   - Determine if item is material (consumable) or equipment (durable)\n   - Provide detailed reasoning for classification\n   - Fall back to rule-based classification if API unavailable\n\n3. Canonical Item & Price Range Creation:\n   - Auto-create canonical items with proper kind field\n   - Generate price ranges from collected vendor prices\n   - Store in item_price_ranges for Price Learner Agent\n   - Apply statistical analysis (IQR method) for robust ranges\n\n4. Data Enrichment:\n   - Generate intelligent tags for searchability\n   - Create canonical_item_links for price tracking\n   - Update prices with each new search\n\nThe system collects real market prices for accurate price validation!',
        model: 'GPT-5 (openai/gpt-5) via OpenRouter',
        icon: '🌐'
      },
      'Price Learner Agent': {
        description: 'Validates prices against web-collected multi-vendor price ranges and market data',
        role: 'Price Validation using Web-Sourced Ranges',
        prompt: 'Validate price against aggregated web search prices from multiple vendors (Grainger, Home Depot, Amazon Business).',
        fullPrompt: 'You are an Enhanced Price Learner Agent that validates prices using web-sourced data. Your process:\n\n1. Primary Source - Web-Collected Prices:\n   - Use prices collected by Web Search agent from multiple vendors\n   - Aggregate prices into statistical ranges (min, max, median, average)\n   - Apply IQR method for outlier-resistant ranges\n   - Weight by vendor reliability and sample size\n\n2. Price Range Creation:\n   - Automatically created when Web Search finds items\n   - Stored in item_price_ranges table\n   - Updated with each new web search\n   - Confidence based on sample size and variance\n\n3. Validation Methods:\n   - Strategy 1: Canonical ranges from item_price_ranges (0.9 confidence)\n   - Strategy 2: External provisional ranges from recent searches (0.3-0.7 confidence)\n   - Strategy 3: No reference (0.1 confidence)\n\n4. Intelligent Adjustments:\n   - Single price: ±20-30% buffer\n   - Multiple prices: IQR statistical method\n   - Variance threshold: 20% triggers PRICE_RANGE_ADJUST proposals\n\nData Sources: Web-scraped prices from Grainger, Home Depot, Amazon Business\nNo LLM needed - uses statistical analysis on real market prices!',
        model: 'Statistical Analysis on Web-Collected Prices',
        icon: '💰'
      },
      'Rule Applier Agent': {
        description: 'Applies deterministic business rules to determine final approval status',
        role: 'Business Policy & Compliance Enforcement',
        prompt: 'Apply all business rules including vendor policies, quantity limits, and compliance requirements to make final decision.',
        fullPrompt: 'You are a Rule Applier Agent enforcing business policies through deterministic rules. Your rule engine evaluates:\n\n1. Price Rules:\n   - PRICE_EXCEEDS_MAX_150: Reject prices >150% of market max\n   - PRICE_COSTLIER_THAN_MARKET: Flag costlier items for explanation\n   - Accept cheaper prices as beneficial\n\n2. Catalog Rules:\n   - NO_CANONICAL_MATCH: Require explanation for unknown items\n   - NO_PRICE_BAND: Manual review when no price data available\n\n3. Business Rules:\n   - QUANTITY_OVER_LIMIT: Flag quantities >1000 units\n   - VENDOR_EXCLUDED_BY_RULE: Block blacklisted vendors\n   - BLACKLISTED_ITEM: Reject prohibited item categories\n\n4. Context Rules:\n   - MATERIAL_INCONSISTENT_WITH_CONTEXT: Flag mismatched items\n   - SERVICE_CONTEXT_INCONSISTENT: Check service type alignment\n\nReturn ALLOW, DENY, or NEEDS_EXPLANATION with policy codes and detailed reasoning.',
        model: 'Rule Engine v2.1 (No LLM - Pure Business Logic)',
        icon: '📋'
      },
      'Explanation Agent': {
        description: 'Generates human-readable explanations for validation decisions',
        role: 'Decision Explanation & User Communication',
        prompt: 'Generate clear explanation for why this item requires additional information or was rejected.',
        fullPrompt: 'You are an Explanation Agent that creates clear, user-friendly explanations for validation decisions. Your task:\n\n1. Decision Synthesis: Combine all agent outputs into coherent explanation\n2. User Communication: Translate technical decisions into business language\n3. Action Guidance: Provide clear next steps for users\n4. Context Awareness: Consider user expertise level and business context\n\nFor each explanation:\n- Summarize why the item needs review or was rejected\n- Explain specific concerns in business terms\n- Provide actionable steps for resolution\n- Include relevant policy context when helpful\n- Maintain professional but friendly tone\n\nAvoid technical jargon. Focus on helping users understand and resolve issues efficiently.',
        model: 'OpenRouter LLM (Configurable Model)',
        icon: '💬'
      },
      'Full Agent Pipeline': {
        description: 'Orchestrates the complete multi-agent validation workflow',
        role: 'Workflow Coordination & Result Synthesis',
        prompt: 'Coordinate all validation agents and synthesize results into final decision with complete audit trail.',
        fullPrompt: 'You are the Full Agent Pipeline orchestrator managing the complete validation workflow. Your responsibilities:\n\n1. Agent Coordination: Execute agents in proper sequence with dependency management\n2. Data Flow: Ensure outputs from each agent feed correctly into subsequent agents\n3. Result Synthesis: Combine all agent decisions into final recommendation\n4. Audit Trail: Maintain complete execution logs and decision reasoning\n\nWorkflow stages:\n1. Pre-validation → Item Validation → Item Matching\n2. Web Search (if low confidence match)\n3. Price Learning → Rule Application → Explanation (if needed)\n\nEach stage builds on previous results. Ensure proper error handling, timeout management, and comprehensive logging for audit purposes.',
        model: 'TypeScript Pipeline Orchestrator',
        icon: '🤖'
      }
    }
    
    return agentDescriptions[agentName] || {
      description: 'Specialized processing agent for invoice validation',
      role: 'Custom Processing & Analysis',
      prompt: 'Perform specialized validation or processing tasks within the invoice verification pipeline.',
      fullPrompt: 'You are a specialized agent within the invoice validation pipeline. Your specific role and configuration depend on your agent type and the validation requirements of the current context. You should follow the established patterns of input processing, decision making, and output generation that integrate seamlessly with the overall pipeline workflow.',
      model: 'Custom Agent Configuration',
      icon: '⚙️'
    }
  }


  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-visible ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Agent Pipeline Execution</h3>
            <p className="text-sm text-gray-600 mt-1">
              {agentExecutions.length} agents • {formatDuration(executionSummary.totalExecutionTime)} total
            </p>
          </div>
          
          <div className="flex space-x-2">
            <span className="px-3 py-1 text-sm rounded bg-blue-100 text-blue-800">
              Agent Details
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Agent Execution Details</h4>
          <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-visible">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role & Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prompt/Configuration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Input Data
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Output Data
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agentExecutions.map((agent, index) => {
                  const agentInfo = getAgentInfo(agent.agentName)
                  const isLastRows = index >= agentExecutions.length - 2 // Last 2 rows
                  
                  return (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{agentInfo.icon}</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {agent.agentName}
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className="text-sm">{getStatusIcon(agent.status)}</span>
                              <span className={`px-2 py-1 text-xs rounded border ${getStageColor(agent.agentStage)}`}>
                                {agent.agentStage.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className="text-sm font-medium text-blue-900 mb-1">
                            {agentInfo.role}
                          </div>
                          <div className="text-xs text-gray-600 leading-relaxed">
                            {agentInfo.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="relative group cursor-help">
                          <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded border max-w-xs hover:bg-blue-50 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="truncate">{agentInfo.prompt}</span>
                              <span className="ml-2 text-blue-500">👁️</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Model: {agentInfo.model}
                            </div>
                          </div>
                          
                          {/* Hover Tooltip - Smart positioning: above for last rows, below for others */}
                          <div className={`absolute right-0 hidden group-hover:block z-[9999] w-96 max-w-screen-sm ${
                            isLastRows ? 'bottom-full mb-2' : 'top-full mt-2'
                          }`}>
                            <div className="bg-white border border-gray-300 rounded-lg shadow-xl p-4">
                              {/* Arrow - points down for tooltips above, up for tooltips below */}
                              <div className={`absolute right-4 w-4 h-4 bg-white border-gray-300 transform rotate-45 ${
                                isLastRows 
                                  ? '-bottom-2 border-b border-r' // Arrow pointing down
                                  : '-top-2 border-l border-t'    // Arrow pointing up
                              }`}></div>
                              
                              <div className="mb-3">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="text-lg">{agentInfo.icon}</span>
                                  <h4 className="font-semibold text-gray-900">{agent.agentName}</h4>
                                </div>
                                <div className="text-sm text-blue-600 font-medium mb-2">{agentInfo.role}</div>
                              </div>
                              
                              <div className="mb-3">
                                <h5 className="font-medium text-gray-900 mb-1">Full Prompt:</h5>
                                <div className="text-xs text-gray-700 bg-gray-50 p-3 rounded border max-h-48 overflow-y-auto whitespace-pre-wrap">
                                  {agentInfo.fullPrompt}
                                </div>
                              </div>
                              
                              <div className="mb-3">
                                <h5 className="font-medium text-gray-900 mb-1">LLM Model:</h5>
                                <div className="text-sm text-green-700 bg-green-50 p-2 rounded border">
                                  {agentInfo.model}
                                </div>
                              </div>
                              
                              <div>
                                <h5 className="font-medium text-gray-900 mb-1">Description:</h5>
                                <div className="text-xs text-gray-600">
                                  {agentInfo.description}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs">
                          <div className="bg-blue-50 p-2 rounded border border-blue-200 max-w-xs">
                            <div className="text-blue-900 font-medium mb-1">Input:</div>
                            <div className="text-blue-800">{formatAgentInput(agent)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs">
                          <div className="bg-green-50 p-2 rounded border border-green-200 max-w-xs">
                            <div className="text-green-900 font-medium mb-1">Output:</div>
                            <div className="text-green-800">{formatAgentOutput(agent)}</div>
                          </div>
                          {agent.decisionRationale && (
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded max-w-xs">
                              <div className="text-yellow-900 font-medium mb-1">Decision:</div>
                              <div className="text-yellow-800 text-xs">
                                {agent.decisionRationale.length > 100 
                                  ? agent.decisionRationale.substring(0, 100) + '...'
                                  : agent.decisionRationale}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}