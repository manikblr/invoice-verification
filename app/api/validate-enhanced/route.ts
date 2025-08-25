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
      validationResults: validationResult,
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

// Execute validation with comprehensive agent tracing
async function executeValidationWithTracing(
  request: EnhancedValidationRequest,
  invoiceId: string,
  tracker: AgentExecutionTracker
) {
  console.log('Starting validation with agent tracing...')

  // Stage 1: Preprocessing
  const preprocessStart = new Date()
  const preprocessedData = await preprocessInvoiceData(request, tracker)
  const preprocessEnd = new Date()

  await tracker.recordExecution(
    'preprocessing-agent',
    'preprocessing',
    request,
    preprocessedData,
    preprocessStart,
    preprocessEnd,
    'SUCCESS',
    {
      conclusion: 'Successfully preprocessed invoice data',
      confidence: 1.0,
      toolsUsed: ['data-validation', 'normalization'],
      dataSources: ['user-input']
    }
  )

  // Stage 2: Item Matching & Validation
  const validationStart = new Date()
  const standardResult = await validateUnifiedInvoice(
    {
      scope_of_work: request.scopeOfWork,
      service_line_id: request.serviceLineId,
      service_type_id: request.serviceTypeId,
      labor_hours: request.laborHours,
      items: request.items
    },
    true // always save
  )
  const validationEnd = new Date()

  // Transform standard result to enhanced result
  const enhancedResult = {
    overallDecision: mapStatusToValidationStatus(standardResult.invoice_status),
    summary: {
      totalLines: standardResult.summary.total_lines,
      allow: standardResult.summary.allow,
      needsReview: standardResult.summary.needs_review,
      reject: standardResult.summary.reject
    },
    lines: standardResult.lines.map(line => ({
      type: line.type,
      input: line.input,
      status: mapStatusToValidationStatus(line.status),
      reasonCodes: line.reason_codes,
      match: line.match ? {
        canonical: line.match.canonical,
        confidence: line.match.confidence
      } : undefined,
      pricing: line.pricing ? {
        min: line.pricing.min,
        max: line.pricing.max
      } : undefined
    })),
    executionTime: validationEnd.getTime() - validationStart.getTime()
  }

  await tracker.recordExecution(
    'item-validation-agent',
    'validation',
    preprocessedData,
    enhancedResult,
    validationStart,
    validationEnd,
    'SUCCESS',
    {
      conclusion: `Validated ${enhancedResult.lines.length} items`,
      confidence: 0.85,
      toolsUsed: ['canonical-matcher', 'policy-checker', 'price-validator'],
      dataSources: ['canonical-items', 'pricing-data', 'policy-rules']
    }
  )

  // Stage 3: Decision Synthesis
  const synthesisStart = new Date()
  const finalDecision = synthesizeValidationDecision(enhancedResult)
  const synthesisEnd = new Date()

  await tracker.recordExecution(
    'decision-synthesis-agent',
    'final_decision',
    enhancedResult,
    { decision: finalDecision },
    synthesisStart,
    synthesisEnd,
    'SUCCESS',
    {
      conclusion: `Final decision: ${finalDecision}`,
      confidence: 0.9,
      toolsUsed: ['decision-logic'],
      dataSources: ['validation-results']
    }
  )

  return {
    ...enhancedResult,
    overallDecision: finalDecision
  }
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
        name: line.name,
        quantity: line.quantity || 1,
        unitPrice: line.unitPrice || 0,
        unit: line.unit || 'pcs',
        type: (line.type || 'material') as 'material' | 'equipment' | 'labor'
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