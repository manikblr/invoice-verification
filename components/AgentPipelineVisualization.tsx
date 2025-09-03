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
    
    if (input.itemName) {
      return `Item: "${input.itemName}" (${input.itemType || 'material'})`
    }
    if (input.scopeOfWork) {
      return `Scope: "${input.scopeOfWork}"`
    }
    if (input.line_item_id || input.lineItemId) {
      return `Processing item #${input.line_item_id || input.lineItemId}`
    }
    
    // Format common properties
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
        description: 'Checks for blacklisted terms and validates item structure before main processing',
        role: 'Content Safety & Structure Validation',
        prompt: 'Validate item names against blacklist and check for proper formatting. Reject items with inappropriate terms or invalid structure.',
        fullPrompt: 'You are a Pre-Validation Agent responsible for content safety and structure validation. Your task is to:\n\n1. Check if the item name contains any blacklisted terms (labor, fees, personal items, etc.)\n2. Validate that the item name has proper structure (minimum length, no placeholder text)\n3. Ensure the item appears to be a legitimate facility management item\n\nBlacklisted terms include: helper, labour, labor, technician, worker, employee, fees, fee, charges, charge, visit, trip, mileage, tax, gst, vat, misc, miscellaneous, food, beverage\n\nReturn APPROVED for valid items or REJECTED with reason for invalid items.',
        model: 'Deterministic Rules Engine',
        icon: '🛡️'
      },
      'Item Validator Agent': {
        description: 'Uses AI to classify content and detect inappropriate facility management items',
        role: 'Content Classification & Appropriateness',
        prompt: 'Classify this item for appropriateness in facility management context. Detect spam, profanity, or non-facility items.',
        fullPrompt: 'You are an Item Validator Agent using advanced NLP to classify invoice items. Your responsibilities:\n\n1. Content Classification: Determine if this is a legitimate facility management item\n2. Spam Detection: Identify spam, gibberish, or test entries\n3. Profanity Filter: Flag inappropriate language or content\n4. Context Validation: Ensure item makes sense for commercial/facility use\n\nAnalyze the item name and description. Consider:\n- Is this a real product/service?\n- Does it belong in facility management?\n- Is the language appropriate?\n- Could this be spam or abuse?\n\nReturn VALID with confidence score, or INVALID with detailed reasoning.',
        model: 'OpenAI GPT-4o Mini',
        icon: '✅'
      },
      'Item Matcher Agent': {
        description: 'Matches invoice items to canonical catalog using hybrid search algorithms',
        role: 'Catalog Matching & Item Identification',
        prompt: 'Find the best matching canonical item using exact, synonym, and fuzzy matching. Provide confidence score.',
        fullPrompt: 'You are an Item Matcher Agent using hybrid search algorithms to find canonical matches. Your process:\n\n1. Exact Match: Look for direct matches in canonical catalog\n2. Synonym Matching: Use domain-specific synonyms and variations\n3. Fuzzy Matching: Apply string similarity algorithms for partial matches\n4. Embedding Search: Use semantic similarity for conceptual matches\n\nFor the given item, search through our canonical catalog using:\n- Direct string matching\n- Industry terminology synonyms\n- Fuzzy string algorithms (Levenshtein, Jaro-Winkler)\n- Vector embeddings for semantic similarity\n\nReturn the best matching canonical_item_id with confidence score (0-1). If confidence < 0.7, recommend web search.',
        model: 'Hybrid Algorithm + Embeddings',
        icon: '🎯'
      },
      'Web Search & Ingest Agent': {
        description: 'Searches vendor websites for items not found in canonical catalog',
        role: 'External Data Discovery & Enrichment',
        prompt: 'Search vendor sites for this item and create new canonical entries if legitimate matches found.',
        fullPrompt: 'You are a Web Search & Ingest Agent that discovers new items from trusted vendor sites. Your workflow:\n\n1. Vendor Site Search: Query whitelisted vendor websites (Grainger, Home Depot, Amazon Business)\n2. Product Validation: Verify found items are legitimate facility management products\n3. Data Extraction: Extract key product details (name, price range, specifications)\n4. Canonical Creation: Generate new canonical items for discovered products\n\nWhen an item has low catalog confidence (<0.7):\n- Search trusted vendor APIs/sites\n- Validate product legitimacy and relevance\n- Extract standardized product information\n- Create canonical_item_id with market price ranges\n- Return match results with web-sourced data\n\nOnly create canonical items for legitimate, commercially available products.',
        model: 'Web Search APIs + GPT-4o Mini',
        icon: '🌐'
      },
      'Price Learner Agent': {
        description: 'Validates unit prices against market ranges and historical data',
        role: 'Price Validation & Market Analysis',
        prompt: 'Analyze this price against market ranges and historical data. Flag significant variances for review.',
        fullPrompt: 'You are a Price Learner Agent that validates unit prices against market data. Your analysis includes:\n\n1. Market Range Comparison: Compare price to established market ranges\n2. Historical Analysis: Check against historical pricing trends\n3. Variance Detection: Flag significant deviations from expected ranges\n4. Source Integration: Use both catalog and web-discovered price data\n\nFor each price validation:\n- Compare unit_price to canonical item price range (min/max)\n- Calculate variance percentage from expected range\n- Classify as: within-range, cheaper, or costlier\n- Use web-search data when available for more accurate ranges\n- Flag prices >150% of max range for rejection\n- Accept cheaper prices as beneficial to customer\n\nReturn validation result with detailed price comparison reasoning.',
        model: 'Statistical Analysis + Business Rules',
        icon: '💰'
      },
      'Rule Applier Agent': {
        description: 'Applies deterministic business rules to determine final approval status',
        role: 'Business Policy & Compliance Enforcement',
        prompt: 'Apply all business rules including vendor policies, quantity limits, and compliance requirements to make final decision.',
        fullPrompt: 'You are a Rule Applier Agent enforcing business policies through deterministic rules. Your rule engine evaluates:\n\n1. Price Rules:\n   - PRICE_EXCEEDS_MAX_150: Reject prices >150% of market max\n   - PRICE_COSTLIER_THAN_MARKET: Flag costlier items for explanation\n   - Accept cheaper prices as beneficial\n\n2. Catalog Rules:\n   - NO_CANONICAL_MATCH: Require explanation for unknown items\n   - NO_PRICE_BAND: Manual review when no price data available\n\n3. Business Rules:\n   - QUANTITY_OVER_LIMIT: Flag quantities >1000 units\n   - VENDOR_EXCLUDED_BY_RULE: Block blacklisted vendors\n   - BLACKLISTED_ITEM: Reject prohibited item categories\n\n4. Context Rules:\n   - MATERIAL_INCONSISTENT_WITH_CONTEXT: Flag mismatched items\n   - SERVICE_CONTEXT_INCONSISTENT: Check service type alignment\n\nReturn ALLOW, DENY, or NEEDS_EXPLANATION with policy codes and detailed reasoning.',
        model: 'Deterministic Rules Engine v2.1',
        icon: '📋'
      },
      'Explanation Agent': {
        description: 'Generates human-readable explanations for validation decisions',
        role: 'Decision Explanation & User Communication',
        prompt: 'Generate clear explanation for why this item requires additional information or was rejected.',
        fullPrompt: 'You are an Explanation Agent that creates clear, user-friendly explanations for validation decisions. Your task:\n\n1. Decision Synthesis: Combine all agent outputs into coherent explanation\n2. User Communication: Translate technical decisions into business language\n3. Action Guidance: Provide clear next steps for users\n4. Context Awareness: Consider user expertise level and business context\n\nFor each explanation:\n- Summarize why the item needs review or was rejected\n- Explain specific concerns in business terms\n- Provide actionable steps for resolution\n- Include relevant policy context when helpful\n- Maintain professional but friendly tone\n\nAvoid technical jargon. Focus on helping users understand and resolve issues efficiently.',
        model: 'OpenAI GPT-4o',
        icon: '💬'
      },
      'Full Agent Pipeline': {
        description: 'Orchestrates the complete multi-agent validation workflow',
        role: 'Workflow Coordination & Result Synthesis',
        prompt: 'Coordinate all validation agents and synthesize results into final decision with complete audit trail.',
        fullPrompt: 'You are the Full Agent Pipeline orchestrator managing the complete validation workflow. Your responsibilities:\n\n1. Agent Coordination: Execute agents in proper sequence with dependency management\n2. Data Flow: Ensure outputs from each agent feed correctly into subsequent agents\n3. Result Synthesis: Combine all agent decisions into final recommendation\n4. Audit Trail: Maintain complete execution logs and decision reasoning\n\nWorkflow stages:\n1. Pre-validation → Item Validation → Item Matching\n2. Web Search (if low confidence match)\n3. Price Learning → Rule Application → Explanation (if needed)\n\nEach stage builds on previous results. Ensure proper error handling, timeout management, and comprehensive logging for audit purposes.',
        model: 'TypeScript Orchestration Engine',
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

      {/* Execution Summary */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="font-medium text-gray-900">{executionSummary.totalAgents}</div>
            <div className="text-gray-600">Total Agents</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">{Math.round(executionSummary.averageConfidence * 100)}%</div>
            <div className="text-gray-600">Avg Confidence</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">{executionSummary.errorCount}</div>
            <div className="text-gray-600">Errors</div>
          </div>
          <div>
            <div className="font-medium text-gray-900">
              {Math.round(((executionSummary.totalAgents - executionSummary.errorCount) / executionSummary.totalAgents) * 100)}%
            </div>
            <div className="text-gray-600">Success Rate</div>
          </div>
        </div>
        
        {executionSummary.bottlenecks.length > 0 && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded">
            <div className="text-xs font-medium text-amber-800">Performance Bottlenecks:</div>
            <div className="text-xs text-amber-700 mt-1">
              {executionSummary.bottlenecks.join(', ')}
            </div>
          </div>
        )}
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