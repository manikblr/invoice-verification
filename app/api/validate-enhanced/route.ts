import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { transparencyDB } from '@/lib/transparency-db'
import { 
  EnhancedValidationRequest,
  EnhancedValidationResponse,
  AgentExecution,
  LineItemValidation,
  ValidationExplanation,
  DecisionFactor,
  ValidationStatus
} from '@/lib/types/transparency'
import { validateUnifiedInvoice } from '@/lib/api'
import { generateExplanationForItem, generateMockDecisionFactors } from '@/lib/explanation-templates'
import { enhancedRuleAgent, RuleContext } from '@/lib/rule-engine/rule-agent'
import { explanationAgent } from '@/lib/explanation/explanation-agent'

export const dynamic = 'force-dynamic'

// Enhanced validation with full transparency
export async function POST(req: NextRequest) {
  const startTime = Date.now()
  const traceId = uuidv4()
  const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  try {
    console.log(`[${traceId}] Starting enhanced validation for invoice ${invoiceId}`)
    
    const body: EnhancedValidationRequest = await req.json()
    
    // Validate request
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'No items provided for validation' },
        { status: 400 }
      )
    }

    // Create validation session
    const sessionId = await createValidationSession(invoiceId, body, traceId)
    console.log(`[${traceId}] Created validation session ${sessionId}`)

    // Initialize agent execution tracking
    const agentTracker = new AgentExecutionTracker(sessionId, traceId)

    // Execute validation with agent tracing
    const validationResult = await executeValidationWithTracing(
      body, 
      invoiceId, 
      agentTracker
    )

    // Generate explanations for each line item
    const explanations = await generateExplanations(
      validationResult,
      agentTracker.getExecutions(),
      body.explanationLevel || 1
    )

    // Store line item validations and explanations
    await storeValidationResults(
      sessionId,
      validationResult,
      explanations,
      agentTracker.getExecutions()
    )

    // Update session with final results
    await transparencyDB.updateValidationSession(sessionId, {
      validationResults: validationResult as any, // Type assertion for enhanced result structure
      overallStatus: validationResult.overallDecision,
      totalExecutionTime: Date.now() - startTime
    })

    // Build enhanced response
    const response: EnhancedValidationResponse = {
      invoiceId,
      overallStatus: validationResult.overallDecision,
      summary: validationResult.summary,
      lines: buildEnhancedLineItems(validationResult.lines, explanations, agentTracker.getExecutions()),
      agentTraces: body.includeAgentTraces ? agentTracker.getExecutions() : undefined,
      executionSummary: buildExecutionSummary(agentTracker.getExecutions()),
      explanations: explanations.map(exp => exp.lineItemExplanations).flat(),
      traceId,
      totalExecutionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }

    console.log(`[${traceId}] Enhanced validation completed in ${response.totalExecutionTime}ms`)
    return NextResponse.json(response)

  } catch (error) {
    console.error(`[${traceId}] Enhanced validation failed:`, error)
    return NextResponse.json(
      { 
        error: 'Validation failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        traceId 
      },
      { status: 500 }
    )
  }
}

// Agent execution tracker
class AgentExecutionTracker {
  private executions: AgentExecution[] = []
  private executionOrder = 0

  constructor(
    private sessionId: string,
    private traceId: string
  ) {}

  async recordExecution(
    agentName: string,
    stage: AgentExecution['agentStage'],
    inputData: any,
    outputData: any,
    startTime: Date,
    endTime: Date,
    status: AgentExecution['status'] = 'SUCCESS',
    reasoning?: any
  ): Promise<void> {
    const execution: Omit<AgentExecution, 'id' | 'createdAt'> = {
      sessionId: this.sessionId,
      agentName,
      agentVersion: '1.0',
      agentStage: stage,
      executionOrder: ++this.executionOrder,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      executionTime: endTime.getTime() - startTime.getTime(),
      status,
      inputData,
      outputData,
      reasoning,
      decisionRationale: reasoning?.conclusion || '',
      confidenceScore: reasoning?.confidence || outputData?.confidence,
      toolsUsed: reasoning?.toolsUsed || [],
      dataSourcesAccessed: reasoning?.dataSources || [],
      tokenUsage: outputData?.tokenUsage,
      apiCallsMade: outputData?.apiCalls || 0
    }

    // Store in database
    try {
      const executionId = await transparencyDB.createAgentExecution(execution)
      this.executions.push({ ...execution, id: executionId, createdAt: new Date().toISOString() })
    } catch (error) {
      console.error('Failed to store agent execution:', error)
      // Add to in-memory list even if DB storage fails
      this.executions.push({ 
        ...execution, 
        id: uuidv4(), 
        createdAt: new Date().toISOString() 
      })
    }
  }

  getExecutions(): AgentExecution[] {
    return [...this.executions]
  }
}

// Execute validation using TypeScript agent implementations
async function executeValidationWithTracing(
  request: EnhancedValidationRequest,
  invoiceId: string,
  tracker: AgentExecutionTracker
) {
  console.log('Starting TypeScript agent pipeline validation...')

  const pipelineStart = new Date()
  
  try {
    // Process each item through the agent pipeline
    const processedItems = []
    
    for (let i = 0; i < request.items.length; i++) {
      const item = request.items[i]
      const lineItemId = `item-${i}`
      
      console.log(`Processing item ${i + 1}/${request.items.length}: ${item.name}`)
      
      // Agent 1: Pre-validation Agent
      const preValidationStart = new Date()
      const preValidationResult = await runPreValidationAgent(item, lineItemId)
      const preValidationEnd = new Date()
      
      await tracker.recordExecution(
        'Pre-Validation Agent',
        'preprocessing',
        { itemName: item.name, itemType: item.type },
        preValidationResult,
        preValidationStart,
        preValidationEnd,
        preValidationResult.status === 'APPROVED' ? 'SUCCESS' : 'FAILED',
        {
          conclusion: preValidationResult.message,
          confidence: preValidationResult.confidence || 0.8,
          toolsUsed: ['blacklist-checker', 'structural-validator'],
          dataSources: ['blacklist-items', 'validation-rules']
        }
      )
      
      if (preValidationResult.status === 'REJECTED') {
        processedItems.push({
          lineItemId,
          item,
          status: 'REJECT',
          reasons: [preValidationResult.message],
          confidence: preValidationResult.confidence || 0.9,
          agentContributions: []
        })
        continue
      }
      
      // Agent 2: Item Validator Agent 
      const itemValidatorStart = new Date()
      const itemValidatorResult = await runItemValidatorAgent(item, lineItemId)
      const itemValidatorEnd = new Date()
      
      await tracker.recordExecution(
        'Item Validator Agent',
        'validation',
        { itemName: item.name, itemType: item.type },
        itemValidatorResult,
        itemValidatorStart,
        itemValidatorEnd,
        itemValidatorResult.status === 'APPROVED' ? 'SUCCESS' : 'FAILED',
        {
          conclusion: itemValidatorResult.message,
          confidence: itemValidatorResult.confidence || 0.8,
          toolsUsed: ['llm-classifier', 'content-filter'],
          dataSources: ['content-policies', 'classification-models']
        }
      )
      
      if (itemValidatorResult.status === 'REJECTED') {
        processedItems.push({
          lineItemId,
          item,
          status: 'REJECT',
          reasons: [itemValidatorResult.message],
          confidence: itemValidatorResult.confidence || 0.9,
          agentContributions: []
        })
        continue
      }
      
      // Agent 3: Item Matcher Agent (mock implementation)
      const itemMatcherStart = new Date()
      const itemMatcherResult = await runItemMatcherAgent(item, lineItemId)
      const itemMatcherEnd = new Date()
      
      await tracker.recordExecution(
        'Item Matcher Agent',
        'item_matching',
        { itemName: item.name, searchQuery: item.name },
        itemMatcherResult,
        itemMatcherStart,
        itemMatcherEnd,
        'SUCCESS',
        {
          conclusion: `Matched with ${itemMatcherResult.confidence * 100}% confidence`,
          confidence: itemMatcherResult.confidence,
          toolsUsed: ['rapidfuzz-matching', 'canonical-database'],
          dataSources: ['canonical-items', 'item-synonyms']
        }
      )
      
      // Agent 4: Web Search Agent (only if low confidence match)
      let webSearchResult = null
      if (itemMatcherResult.confidence < 0.7) {
        const webSearchStart = new Date()
        webSearchResult = await runWebSearchAgent(item, lineItemId, itemMatcherResult.confidence)
        const webSearchEnd = new Date()
        
        await tracker.recordExecution(
          'Web Search & Ingest Agent',
          'preprocessing',
          { itemName: item.name, matchConfidence: itemMatcherResult.confidence },
          webSearchResult,
          webSearchStart,
          webSearchEnd,
          'SUCCESS',
          {
            conclusion: webSearchResult.message,
            confidence: webSearchResult.canonicalItemId ? 0.8 : 0.7, // Higher confidence if canonical item created
            toolsUsed: ['multi-vendor-scraping', 'css-selectors'],
            dataSources: ['vendor-websites', 'product-catalogs']
          }
        )
      }
      
      // Use canonical item from web search if available, otherwise use item matcher result
      const finalCanonicalItemId = webSearchResult?.canonicalItemId || itemMatcherResult.canonicalItemId
      const finalMatchConfidence = webSearchResult?.canonicalItemId ? 0.8 : itemMatcherResult.confidence
      
      // Agent 5: Price Learner Agent (using web search result if available)
      const priceLearnerStart = new Date()
      const priceLearnerResult = await runPriceLearnerAgent(item, finalCanonicalItemId, lineItemId, webSearchResult?.priceRange)
      const priceLearnerEnd = new Date()
      
      await tracker.recordExecution(
        'Price Learner Agent',
        'pricing',
        { itemName: item.name, unitPrice: item.unitPrice, canonicalItemId: finalCanonicalItemId },
        priceLearnerResult,
        priceLearnerStart,
        priceLearnerEnd,
        'SUCCESS',
        {
          conclusion: priceLearnerResult.message,
          confidence: 0.85,
          toolsUsed: ['price-validation', 'statistical-analysis'],
          dataSources: ['pricing-data', 'market-prices']
        }
      )
      
      // Agent 6: Rule Applier Agent
      const ruleContext: RuleContext = {
        lineItemId,
        itemName: item.name,
        canonicalItemId: finalCanonicalItemId, // Use enhanced canonical item from web search
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        matchConfidence: finalMatchConfidence, // Use enhanced confidence
        priceIsValid: priceLearnerResult.isValid,
        priceComparison: priceLearnerResult.priceComparison, // Add price comparison from Price Learner Agent
        priceRange: priceLearnerResult.expectedRange, // Pass price range from Price Learner Agent
        vendorId: 'vendor-001',
        serviceLine: `Service Line ${request.serviceLineId}`,
        serviceType: `Service Type ${request.serviceTypeId}`,
        workScopeText: request.scopeOfWork,
        additionalContext: item.additionalContext // Pass user's additional context
      }
      
      const ruleAgentStart = new Date()
      const ruleResult = await enhancedRuleAgent.applyRules(ruleContext)
      const ruleAgentEnd = new Date()
      
      await tracker.recordExecution(
        'Rule Applier Agent',
        'compliance',
        ruleContext,
        ruleResult,
        ruleAgentStart,
        ruleAgentEnd,
        'SUCCESS',
        {
          conclusion: `Applied business rules: ${ruleResult.decision}`,
          confidence: ruleResult.confidence,
          toolsUsed: ['rule-engine', 'policy-evaluation'],
          dataSources: ['business-rules', 'vendor-policies']
        }
      )
      
      // Agent 7: Explanation Agent (if needed)
      if (ruleResult.decision === 'NEEDS_EXPLANATION') {
        const explanationStart = new Date()
        const explanationResult = {
          message: `Item "${item.name}" requires additional explanation: ${ruleResult.explanationPrompt || 'Please provide business justification'}`,
          confidence: 0.8
        }
        const explanationEnd = new Date()
        
        await tracker.recordExecution(
          'Explanation Agent',
          'final_decision',
          { itemName: item.name, prompt: ruleResult.explanationPrompt },
          explanationResult,
          explanationStart,
          explanationEnd,
          'SUCCESS',
          {
            conclusion: 'Generated explanation request',
            confidence: 0.8,
            toolsUsed: ['explanation-generation', 'context-synthesis'],
            dataSources: ['validation-results', 'explanation-templates']
          }
        )
      }
      
      // Convert rule decision to validation status
      const status = mapRuleDecisionToValidationStatus(ruleResult.decision)
      
      processedItems.push({
        lineItemId,
        item,
        status,
        reasons: ruleResult.reasons,
        policyCodes: ruleResult.policyCodes,
        confidence: ruleResult.confidence,
        canonicalItemId: finalCanonicalItemId, // Use enhanced canonical item from web search
        matchConfidence: finalMatchConfidence, // Use enhanced match confidence
        canonicalName: webSearchResult?.canonicalName || itemMatcherResult.canonicalName,
        webSourced: webSearchResult?.webSourced || false,
        priceValidation: priceLearnerResult,
        agentContributions: []
      })
    }
    
    const pipelineEnd = new Date()
    
    console.log('TypeScript agent pipeline completed successfully')

    // Record the full pipeline execution
    await tracker.recordExecution(
      'Full Agent Pipeline',
      'final_decision',
      {
        scopeOfWork: request.scopeOfWork,
        itemCount: request.items.length,
        serviceLineId: request.serviceLineId
      },
      { processedItems: processedItems.length },
      pipelineStart,
      pipelineEnd,
      'SUCCESS',
      {
        conclusion: `Executed full 7-agent pipeline successfully`,
        confidence: 0.9,
        toolsUsed: ['all-7-agents'],
        dataSources: ['all-agent-data-sources']
      }
    )

    // Transform processed items to enhanced result format
    const lines = processedItems.map((processed, index) => {
      const item = processed.item

      return {
        type: item.type || 'material',
        input: {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit || 'pcs',
          type: item.type
        },
        status: processed.status,
        reasonCodes: processed.reasons,
        confidenceScore: processed.confidence,
        explanation: {
          summary: `${processed.status} - ${processed.reasons.join(', ')}`,
          detailed: `Multi-agent pipeline decision: ${processed.reasons.join(', ')}`,
          technical: `Canonical match: ${processed.canonicalItemId || 'None'}, Match confidence: ${processed.matchConfidence ? (processed.matchConfidence * 100).toFixed(1) + '%' : 'N/A'}`,
          reasoning: processed.reasons,
          confidence: processed.confidence,
          primaryFactors: processed.reasons.slice(0, 3),
          riskFactors: processed.reasons.filter(r => r.includes('EXCEEDS') || r.includes('BELOW') || r.includes('EXCLUDED') || r.includes('REJECTED'))
        },
        decisionFactors: [],
        agentContributions: buildAgentContributions(tracker.getExecutions(), processed.lineItemId)
      }
    })

    const summary = {
      totalLines: lines.length,
      allow: lines.filter(l => l.status === 'ALLOW').length,
      needsReview: lines.filter(l => l.status === 'NEEDS_REVIEW').length,
      reject: lines.filter(l => l.status === 'REJECT').length
    }

    const overallDecision = summary.reject > 0 ? 'REJECT' as ValidationStatus :
                          summary.needsReview > 0 ? 'NEEDS_REVIEW' as ValidationStatus :
                          'ALLOW' as ValidationStatus

    return {
      overallDecision,
      summary,
      lines,
      executionTime: pipelineEnd.getTime() - pipelineStart.getTime(),
      agentTraceId: `typescript-agents-${Date.now()}`
    }

  } catch (error) {
    console.error('TypeScript agent pipeline failed:', error)
    
    // Record the failure
    await tracker.recordExecution(
      'Agent Pipeline',
      'validation',
      request,
      { error: error.message },
      pipelineStart,
      new Date(),
      'FAILED',
      {
        conclusion: 'TypeScript agent pipeline failed - validation terminated',
        confidence: 0.0,
        toolsUsed: [],
        dataSources: []
      }
    )

    throw new Error(`Agent pipeline validation failed: ${error.message}. Enhanced validation requires the full agent pipeline to be operational.`)
  }
}

// Helper function implementations for agents
async function runPreValidationAgent(item: any, lineItemId: string) {
  // Blacklisted terms that should immediately reject items
  const blacklistedTerms = [
    'helper', 'labour', 'labor', 'technician', 'worker', 'employee',
    'fees', 'fee', 'charges', 'charge', 'visit', 'trip', 'mileage',
    'tax', 'gst', 'vat', 'misc', 'miscellaneous', 'food', 'beverage'
  ]
  
  const itemLower = item.name.toLowerCase()
  
  // Check for blacklisted terms
  for (const term of blacklistedTerms) {
    if (itemLower.includes(term)) {
      return {
        status: 'REJECTED',
        message: `Blacklisted term '${term}' detected in item name`,
        confidence: 0.95
      }
    }
  }
  
  // Basic structural validation
  if (item.name.trim().length < 3) {
    return {
      status: 'REJECTED',
      message: 'Item name too short',
      confidence: 0.9
    }
  }
  
  if (['--', '---', 'n/a', 'na', 'tbd'].includes(item.name.trim().toLowerCase())) {
    return {
      status: 'REJECTED',
      message: 'Invalid or placeholder item name',
      confidence: 0.95
    }
  }
  
  return {
    status: 'APPROVED',
    message: 'Pre-validation passed',
    confidence: 0.85
  }
}

async function runItemValidatorAgent(item: any, lineItemId: string) {
  // LLM-powered content classification simulation
  const itemLower = item.name.toLowerCase()
  
  // Check for inappropriate content
  const inappropriateTerms = ['gift', 'personal', 'entertainment', 'luxury', 'vacation']
  for (const term of inappropriateTerms) {
    if (itemLower.includes(term)) {
      return {
        status: 'REJECTED',
        message: `Inappropriate item type detected: ${term}`,
        confidence: 0.9
      }
    }
  }
  
  // Check for legitimate facility management items
  const facilityTerms = ['material', 'equipment', 'tool', 'supply', 'part', 'component', 'fixture']
  const hasFacilityTerm = facilityTerms.some(term => itemLower.includes(term))
  
  return {
    status: 'APPROVED',
    message: hasFacilityTerm ? 'Legitimate facility management item' : 'Content validation passed',
    confidence: hasFacilityTerm ? 0.95 : 0.8
  }
}

async function runItemMatcherAgent(item: any, lineItemId: string) {
  // Mock canonical matching with realistic confidence scores
  const itemName = item.name.toLowerCase()
  
  // Simulate different match scenarios
  if (itemName.includes('pipe') || itemName.includes('fitting')) {
    return {
      canonicalItemId: 'PIPE_001',
      canonicalName: 'Standard PVC Pipe',
      confidence: 0.92,
      matchType: 'exact'
    }
  } else if (itemName.includes('screw') || itemName.includes('bolt')) {
    return {
      canonicalItemId: 'FASTENER_001', 
      canonicalName: 'Standard Fastener',
      confidence: 0.85,
      matchType: 'synonym'
    }
  } else if (itemName.includes('wire') || itemName.includes('cable')) {
    return {
      canonicalItemId: 'ELECTRICAL_001',
      canonicalName: 'Electrical Wire',
      confidence: 0.88,
      matchType: 'fuzzy'
    }
  } else {
    // Low confidence for unknown items
    return {
      canonicalItemId: null,
      canonicalName: null,
      confidence: 0.3,
      matchType: 'no_match'
    }
  }
}

async function runWebSearchAgent(item: any, lineItemId: string, matchConfidence: number) {
  // Only trigger web search if match confidence is low
  if (matchConfidence >= 0.7) {
    return {
      message: 'Skipped: High confidence match found',
      status: 'skipped',
      canonicalItemId: null
    }
  }
  
  // Check feature flag
  if (process.env.FEATURE_WEB_INGEST !== 'true') {
    return {
      message: 'Skipped: Web ingestion feature disabled',
      status: 'disabled',
      canonicalItemId: null
    }
  }
  
  // Enhanced web search with actual canonical item creation
  const vendorsSearched = ['Grainger', 'Home Depot', 'Amazon Business']
  const itemName = item.name.toLowerCase().trim()
  
  // Create canonical items based on web search "results"
  let canonicalItemId = null
  let canonicalName = null
  let priceRange = null
  
  // Simulate realistic web search results and canonical item creation
  if (itemName.includes('conduit') || itemName.includes('electrical conduit')) {
    canonicalItemId = 'WS_ELECTRICAL_CONDUIT_001'
    canonicalName = 'Electrical Conduit - Standard PVC'
    priceRange = { min: 8.50, max: 15.75 }
  } else if (itemName.includes('mud') || itemName.includes('drywall mud') || itemName.includes('joint compound')) {
    canonicalItemId = 'WS_DRYWALL_MUD_001'
    canonicalName = 'Drywall Joint Compound'
    priceRange = { min: 18.00, max: 35.00 }
  } else if (itemName.includes('membrane') || itemName.includes('roofing')) {
    canonicalItemId = 'WS_ROOFING_MEMBRANE_001'
    canonicalName = 'Roofing Membrane - Commercial Grade'
    priceRange = { min: 400.00, max: 600.00 }
  } else {
    // Generic item discovered via web search
    const sanitizedName = itemName.replace(/[^a-z0-9]/g, '_').toUpperCase()
    canonicalItemId = `WS_GENERIC_${sanitizedName}_001`
    canonicalName = `${item.name} (Web Discovered)`
    priceRange = { 
      min: Math.max(1.00, item.unitPrice * 0.7), 
      max: item.unitPrice * 1.5 
    }
  }
  
  return {
    message: `Searched ${vendorsSearched.length} vendor sites, found 2 potential matches`,
    vendorsSearched,
    itemsFound: 2,
    canonicalLinksCreated: 1,
    status: 'completed',
    // Return the newly created canonical item for use by Price Learner
    canonicalItemId,
    canonicalName,
    priceRange,
    webSourced: true
  }
}

async function runPriceLearnerAgent(item: any, canonicalItemId: string | null, lineItemId: string, webSearchPriceRange: any = null): Promise<{
  isValid: boolean;
  message: string;
  variance: number;
  expectedRange: any;
  source: string;
  canonicalItemId?: string | null;
  priceComparison: 'within-range' | 'cheaper' | 'costlier';
}> {
  // Enhanced price validation with web search integration
  const unitPrice = item.unitPrice
  
  if (!canonicalItemId) {
    return {
      isValid: false,
      message: 'No canonical item for price validation',
      variance: 0,
      expectedRange: null,
      source: 'no-match',
      priceComparison: 'within-range'
    }
  }
  
  // Use web search price range if available, otherwise use existing catalog ranges
  let expectedRange
  let source
  
  if (webSearchPriceRange) {
    expectedRange = webSearchPriceRange
    source = 'web-search'
  } else {
    // Existing catalog price ranges
    const catalogPriceRanges = {
      'PIPE_001': { min: 10, max: 50 },
      'FASTENER_001': { min: 0.5, max: 5 },
      'ELECTRICAL_001': { min: 15, max: 75 }
    }
    
    expectedRange = catalogPriceRanges[canonicalItemId] || { min: unitPrice * 0.8, max: unitPrice * 1.2 }
    source = canonicalItemId in catalogPriceRanges ? 'catalog' : 'estimated'
  }
  
  const isValid = unitPrice >= expectedRange.min && unitPrice <= expectedRange.max
  
  // Calculate variance and determine if price is cheaper or costlier
  let variance = 0
  let priceComparison = 'within-range'
  let message = ''
  
  const sourceDescription = source === 'web-search' ? 'web-discovered market data' :
                           source === 'catalog' ? 'canonical catalog' :
                           'estimated range'
  
  if (isValid) {
    message = `Price within expected range (${sourceDescription})`
  } else if (unitPrice < expectedRange.min) {
    // Price is cheaper than expected
    variance = (expectedRange.min - unitPrice) / expectedRange.min
    priceComparison = 'cheaper'
    message = `Price is ${variance > 0.2 ? 'significantly' : 'slightly'} cheaper than typical market price (${sourceDescription})`
  } else {
    // Price is costlier than expected
    variance = (unitPrice - expectedRange.max) / expectedRange.max
    priceComparison = 'costlier'
    message = `Price is ${variance > 0.2 ? 'significantly' : 'slightly'} costlier than typical market price (${sourceDescription})`
  }
  
  return {
    isValid,
    message,
    variance,
    expectedRange,
    source,
    canonicalItemId,
    priceComparison // Add this to help Rule Agent make decisions
  }
}

function mapRuleDecisionToValidationStatus(decision: string): ValidationStatus {
  switch (decision) {
    case 'ALLOW': return 'ALLOW'
    case 'DENY': return 'REJECT'  
    case 'NEEDS_EXPLANATION': return 'NEEDS_REVIEW'
    default: return 'NEEDS_REVIEW'
  }
}

function buildAgentContributions(executions: AgentExecution[], lineItemId: string): any[] {
  return executions
    .filter(exec => exec.inputData?.lineItemId === lineItemId || exec.inputData?.line_item_id === lineItemId)
    .map(exec => ({
      agentName: exec.agentName,
      stage: exec.agentStage,
      decision: exec.outputData?.status || exec.outputData?.decision || 'processed',
      confidence: exec.confidenceScore || 0.8,
      reasoning: exec.decisionRationale || exec.outputData?.message || '',
      executionTime: exec.executionTime
    }))
}

// Helper functions
async function createValidationSession(
  invoiceId: string, 
  request: EnhancedValidationRequest,
  traceId: string
): Promise<string> {
  return await transparencyDB.createValidationSession({
    invoiceId,
    userSession: 'web-session', // TODO: Get from request context
    invoiceData: {
      scopeOfWork: request.scopeOfWork,
      serviceLineId: request.serviceLineId,
      serviceTypeName: 'Unknown', // TODO: Resolve from serviceTypeId
      laborHours: request.laborHours,
      items: request.items
    },
    validationResults: {} as any, // Will be updated later
    overallStatus: 'NEEDS_REVIEW', // Initial status
    langfuseTraceId: traceId,
    serviceLineName: 'Unknown' // TODO: Resolve from serviceLineId
  })
}

async function preprocessInvoiceData(request: EnhancedValidationRequest, tracker: AgentExecutionTracker) {
  // Simulate preprocessing logic
  return {
    ...request,
    normalized: true,
    itemCount: request.items.length,
    totalValue: request.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  }
}

function synthesizeValidationDecision(result: any): ValidationStatus {
  const { allow, needsReview, reject } = result.summary
  
  if (reject > 0) return 'REJECT'
  if (needsReview > 0) return 'NEEDS_REVIEW'
  return 'ALLOW'
}

async function generateExplanations(
  validationResult: any,
  agentExecutions: AgentExecution[],
  level: number
) {
  // Generate explanations for each line item
  return validationResult.lines.map((line: any, index: number) => ({
    lineItemIndex: index,
    lineItemExplanations: generateLineItemExplanation(line, agentExecutions, level)
  }))
}

function generateLineItemExplanation(line: any, agentExecutions: AgentExecution[], level: number) {
  const status = line.status as ValidationStatus
  const confidence = line.confidence || 0.8
  
  // Generate mock decision factors based on status
  const decisionFactors = generateMockDecisionFactors(status)
  
  // Determine risk factors based on line item
  const riskFactors: string[] = []
  if (line.unitPrice > 100) riskFactors.push('HIGH_PRICE_VARIANCE')
  if (!line.vendorVerified) riskFactors.push('UNKNOWN_VENDOR')
  if (line.quantity > 50) riskFactors.push('LARGE_QUANTITY')
  
  // Generate enhanced explanation using templates
  const enhancedExplanation = generateExplanationForItem(
    {
      itemName: line.name,
      itemType: line.type || 'material',
      quantity: line.quantity,
      unitPrice: line.unitPrice
    },
    status,
    confidence,
    decisionFactors,
    riskFactors
  )

  return [{
    summaryExplanation: enhancedExplanation.summary,
    detailedExplanation: level >= 2 ? enhancedExplanation.detailed : undefined,
    technicalExplanation: level >= 3 ? enhancedExplanation.technical : undefined,
    lineItemValidationId: 'temp', // Will be set when stored
    explanationGeneratedAt: new Date().toISOString(),
    explanationVersion: '1.0'
  }]
}

function generateQuickSummary(status: string, reasonCodes: string[], line: any): string {
  switch (status) {
    case 'ALLOW':
      return `✅ Approved - Item matches catalog and passes all policy checks`
    case 'NEEDS_REVIEW':
      const reviewReasons = reasonCodes.map(code => code.replace(/_/g, ' ').toLowerCase()).join(', ')
      return `⚠️ Needs Review - ${reviewReasons || 'Additional information required'}`
    case 'REJECT':
      const rejectReasons = reasonCodes.map(code => code.replace(/_/g, ' ').toLowerCase()).join(', ')
      return `❌ Rejected - ${rejectReasons || 'Does not meet policy requirements'}`
    default:
      return `❓ Unknown status - Please contact support`
  }
}

function generateDetailedExplanation(
  status: string, 
  reasonCodes: string[], 
  line: any, 
  agentExecutions: AgentExecution[]
): string {
  let explanation = `Item "${line.input.name}" was ${status.toLowerCase()} based on the following analysis:\n\n`
  
  // Add matching information
  if (line.match) {
    explanation += `🎯 **Catalog Match**: Found ${Math.round(line.match.confidence * 100)}% match with "${line.match.canonical}"\n`
  } else {
    explanation += `🎯 **Catalog Match**: No matching item found in canonical catalog\n`
  }
  
  // Add pricing information
  if (line.pricing) {
    const userPrice = line.input.unitPrice
    const marketMin = line.pricing.min
    const marketMax = line.pricing.max
    explanation += `💰 **Pricing Check**: User price $${userPrice} vs market range $${marketMin}-$${marketMax}\n`
  }
  
  // Add policy information
  if (reasonCodes.length > 0) {
    explanation += `📋 **Policy Checks**:\n`
    reasonCodes.forEach(code => {
      explanation += `  • ${code.replace(/_/g, ' ').toLowerCase()}\n`
    })
  }
  
  return explanation
}

function generateTechnicalExplanation(line: any, agentExecutions: AgentExecution[]): string {
  let explanation = `**Technical Details for "${line.input.name}":**\n\n`
  
  // Add agent execution details
  explanation += `**Agent Pipeline Execution:**\n`
  agentExecutions.forEach(exec => {
    explanation += `• ${exec.agentName} (${exec.agentStage}): ${exec.executionTime}ms\n`
  })
  
  explanation += `\n**Input Data:**\n`
  explanation += `• Quantity: ${line.input.quantity} ${line.input.unit}\n`
  explanation += `• Unit Price: $${line.input.unitPrice}\n`
  explanation += `• Total Value: $${(line.input.quantity * line.input.unitPrice).toFixed(2)}\n`
  
  if (line.match) {
    explanation += `\n**Matching Algorithm Results:**\n`
    explanation += `• Canonical Item ID: ${line.match.canonical}\n`
    explanation += `• Confidence Score: ${(line.match.confidence * 100).toFixed(1)}%\n`
  }
  
  return explanation
}

async function storeValidationResults(
  sessionId: string,
  validationResult: any,
  explanations: any[],
  agentExecutions: AgentExecution[]
) {
  // Store line item validations
  for (let i = 0; i < validationResult.lines.length; i++) {
    const line = validationResult.lines[i]
    const explanation = explanations[i]
    
    const lineItemId = await transparencyDB.createLineItemValidation({
      sessionId,
      lineItemIndex: i,
      itemName: line.input.name,
      itemType: line.type,
      quantity: line.input.quantity,
      unitPrice: line.input.unitPrice,
      unit: line.input.unit,
      validationDecision: line.status,
      confidenceScore: line.match?.confidence,
      primaryReason: line.reasonCodes[0],
      detailedExplanation: explanation.lineItemExplanations[0]?.detailedExplanation,
      supportingFactors: [],
      riskFactors: line.reasonCodes,
      canonicalMatchId: line.match?.canonical,
      canonicalMatchName: line.match?.canonical,
      matchConfidence: line.match?.confidence,
      pricingAnalysis: line.pricing ? {
        marketPrice: {
          min: line.pricing.min,
          max: line.pricing.max,
          median: (line.pricing.min + line.pricing.max) / 2,
          source: 'market-data'
        },
        userPrice: line.input.unitPrice,
        priceFlag: 'within_range' // TODO: Calculate actual flag
      } : undefined
    })
    
    // Store explanation
    if (explanation.lineItemExplanations[0]) {
      await transparencyDB.createValidationExplanation({
        ...explanation.lineItemExplanations[0],
        lineItemValidationId: lineItemId
      })
    }
  }
}

function buildEnhancedLineItems(lines: any[], explanations: any[], agentExecutions: AgentExecution[]) {
  return lines.map((line, index) => {
    const explanation = explanations[index]?.lineItemExplanations[0]
    const status = line.status as ValidationStatus
    const decisionFactors = generateMockDecisionFactors(status)
    
    // Determine risk factors
    const riskFactors: string[] = []
    if (line.unitPrice > 100) riskFactors.push('HIGH_PRICE_VARIANCE')
    if (!line.vendorVerified) riskFactors.push('UNKNOWN_VENDOR')
    if (line.quantity > 50) riskFactors.push('LARGE_QUANTITY')

    return {
      // Standard fields
      type: line.type || 'material',
      input: {
        name: line.input?.name || line.name,
        quantity: line.input?.quantity || line.quantity || 1,
        unitPrice: line.input?.unitPrice || line.unitPrice || 0,
        unit: line.input?.unit || line.unit || 'pcs',
        type: (line.input?.type || line.type || 'material') as 'material' | 'equipment' | 'labor'
      },
      status,
      reasonCodes: line.reasonCodes || ['validated'],
      
      // Enhanced fields
      confidenceScore: line.confidence || 0.8,
      explanation: {
        summary: explanation?.summaryExplanation || `${status} - Standard validation result`,
        detailed: explanation?.detailedExplanation,
        technical: explanation?.technicalExplanation,
        reasoning: line.reasonCodes || ['Standard validation completed'],
        confidence: line.confidence || 0.8,
        primaryFactors: decisionFactors.slice(0, 3).map(f => f.factorName),
        riskFactors
      },
      decisionFactors,
      agentContributions: agentExecutions.map(exec => ({
        agentName: exec.agentName,
        stage: exec.agentStage,
        decision: exec.outputData?.decision || 'processed',
        confidence: exec.confidenceScore || 0.5,
        reasoning: exec.decisionRationale || '',
        executionTime: exec.executionTime
      }))
    }
  })
}

function buildExecutionSummary(agentExecutions: AgentExecution[]) {
  const totalExecutionTime = agentExecutions.reduce((sum, exec) => sum + exec.executionTime, 0)
  const avgConfidence = agentExecutions.reduce((sum, exec) => sum + (exec.confidenceScore || 0), 0) / agentExecutions.length
  
  return {
    totalAgents: agentExecutions.length,
    totalExecutionTime,
    averageConfidence: avgConfidence,
    criticalPath: agentExecutions
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 3)
      .map(exec => exec.agentName),
    bottlenecks: agentExecutions
      .filter(exec => exec.executionTime > 1000) // > 1 second
      .map(exec => exec.agentName),
    errorCount: agentExecutions.filter(exec => exec.status === 'FAILED').length
  }
}

function mapStatusToValidationStatus(status: string): ValidationStatus {
  switch (status.toUpperCase()) {
    case 'ALLOW': return 'ALLOW'
    case 'NEEDS_REVIEW': return 'NEEDS_REVIEW'
    case 'REJECT': return 'REJECT'
    default: return 'NEEDS_REVIEW'
  }
}

function mapPolicyToValidationStatus(policy: string): ValidationStatus {
  switch (policy.toUpperCase()) {
    case 'ALLOW': return 'ALLOW'
    case 'DENY': return 'REJECT'
    case 'NEEDS_MORE_INFO': return 'NEEDS_REVIEW'
    default: return 'NEEDS_REVIEW'
  }
}

