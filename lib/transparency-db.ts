import { createClient } from '@supabase/supabase-js'
import { 
  ValidationSession, 
  LineItemValidation, 
  AgentExecution, 
  ValidationExplanation,
  DecisionFactor,
  ValidationTrace,
  ValidationHistoryQuery,
  ValidationHistoryResponse
} from './types/transparency'

// Database client for transparency features
export class TransparencyDB {
  private supabase

  constructor() {
    // Support multiple possible environment variable names used in the codebase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.Supabase_Service_Key || 
                      process.env.SUPABASE_ANON_KEY ||
                      process.env.Supabase_Anon_Key
    
    console.log('TransparencyDB init - URL present:', !!supabaseUrl, 'Key present:', !!serviceKey)
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('Supabase')))
    
    if (!supabaseUrl || !serviceKey) {
      console.warn('Supabase configuration missing for transparency features - using mock implementation')
      console.warn('Checked env vars: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, Supabase_Service_Key, SUPABASE_ANON_KEY, Supabase_Anon_Key')
      // Create a dummy client that won't be used during build
      this.supabase = null as any
      return
    }
    
    this.supabase = createClient(supabaseUrl, serviceKey)
    console.log('TransparencyDB initialized successfully')
  }

  private checkSupabaseConnection(): boolean {
    if (!this.supabase) {
      console.warn('Transparency features not available - Supabase configuration missing')
      return false
    }
    return true
  }

  // ========== Validation Sessions ==========
  
  async createValidationSession(session: Omit<ValidationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (!this.checkSupabaseConnection()) {
      // Return a mock ID when not connected
      return `mock-session-${Date.now()}`
    }
    const { data, error } = await this.supabase
      .from('validation_sessions')
      .insert([{
        invoice_id: session.invoiceId,
        user_session: session.userSession,
        invoice_data: session.invoiceData,
        validation_results: session.validationResults,
        overall_status: session.overallStatus,
        total_execution_time: session.totalExecutionTime,
        langfuse_trace_id: session.langfuseTraceId,
        service_line_name: session.serviceLineName,
        notes: session.notes
      }])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating validation session:', error)
      throw new Error(`Failed to create validation session: ${error.message}`)
    }

    return data.id
  }

  async getValidationSession(invoiceId: string): Promise<ValidationSession | null> {
    if (!this.checkSupabaseConnection()) {
      console.warn('Cannot get validation session - database not available')
      return null
    }

    const { data, error } = await this.supabase
      .from('validation_sessions')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      console.error('Error getting validation session:', error)
      throw new Error(`Failed to get validation session: ${error.message}`)
    }

    return this.mapValidationSession(data)
  }

  async updateValidationSession(sessionId: string, updates: Partial<ValidationSession>): Promise<void> {
    if (!this.checkSupabaseConnection()) {
      console.log(`Mock: Update session ${sessionId}`)
      return
    }
    const { error } = await this.supabase
      .from('validation_sessions')
      .update({
        validation_results: updates.validationResults,
        overall_status: updates.overallStatus,
        total_execution_time: updates.totalExecutionTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (error) {
      console.error('Error updating validation session:', error)
      throw new Error(`Failed to update validation session: ${error.message}`)
    }
  }

  // ========== Line Item Validations ==========
  
  async createLineItemValidation(lineItem: Omit<LineItemValidation, 'id' | 'createdAt'>): Promise<string> {
    if (!this.checkSupabaseConnection()) {
      console.log('Mock: createLineItemValidation called')
      return `mock-line-item-${Date.now()}`
    }

    // Build the insert object step by step to handle potential schema mismatches
    const insertData: any = {
      session_id: lineItem.sessionId,
      line_item_index: lineItem.lineItemIndex,
      item_name: lineItem.itemName,
      item_type: lineItem.itemType,
      quantity: lineItem.quantity,
      unit_price: lineItem.unitPrice,
      unit: lineItem.unit,
      validation_decision: lineItem.validationDecision,
      confidence_score: lineItem.confidenceScore,
      primary_reason: lineItem.primaryReason,
      detailed_explanation: lineItem.detailedExplanation,
      supporting_factors: lineItem.supportingFactors,
      risk_factors: lineItem.riskFactors,
      match_confidence: lineItem.matchConfidence,
      pricing_analysis: lineItem.pricingAnalysis
    }

    // Add canonical matching fields only if they have values
    if (lineItem.canonicalMatchId) {
      insertData.canonical_match_id = lineItem.canonicalMatchId
    }
    if (lineItem.canonicalMatchName) {
      insertData.canonical_match_name = lineItem.canonicalMatchName
    }

    console.log('Attempting to insert line item validation with data:', JSON.stringify(insertData, null, 2))

    // First, let's check what columns actually exist in the table
    try {
      const { data: tableInfo, error: schemaError } = await this.supabase
        .from('line_item_validations')
        .select('*')
        .limit(0)

      if (schemaError) {
        console.error('Schema check failed:', schemaError)
        // Try to create the table if it doesn't exist
        console.log('Attempting to create line_item_validations table with minimal schema...')
        return await this.createMinimalLineItemValidation(lineItem)
      }
    } catch (schemaCheckError) {
      console.log('Schema check error, trying minimal approach:', schemaCheckError)
      return await this.createMinimalLineItemValidation(lineItem)
    }

    const { data, error } = await this.supabase
      .from('line_item_validations')
      .insert([insertData])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating line item validation:', error)
      // Try fallback approach if main insert fails
      console.log('Main insert failed, trying minimal approach as fallback')
      return await this.createMinimalLineItemValidation(lineItem)
    }

    return data.id
  }

  // Minimal fallback method for database schema issues
  private async createMinimalLineItemValidation(lineItem: Omit<LineItemValidation, 'id' | 'createdAt'>): Promise<string> {
    console.log('Using minimal line item validation approach')
    
    // Try with just the essential fields
    const minimalData = {
      session_id: lineItem.sessionId,
      line_item_index: lineItem.lineItemIndex,
      item_name: lineItem.itemName,
      item_type: lineItem.itemType,
      validation_decision: lineItem.validationDecision
    }

    const { data, error } = await this.supabase
      .from('line_item_validations')
      .insert([minimalData])
      .select('id')
      .single()

    if (error) {
      console.error('Even minimal insert failed:', error)
      // Return a mock ID if database is completely unavailable
      console.log('Database unavailable, returning mock ID')
      return `mock-validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    console.log('Minimal line item validation created successfully')
    return data.id
  }

  async getLineItemValidations(sessionId: string): Promise<LineItemValidation[]> {
    if (!this.checkSupabaseConnection()) {
      console.warn('Cannot get line item validations - database not available')
      return []
    }

    const { data, error } = await this.supabase
      .from('line_item_validations')
      .select('*')
      .eq('session_id', sessionId)
      .order('line_item_index')

    if (error) {
      console.error('Error getting line item validations:', error)
      throw new Error(`Failed to get line item validations: ${error.message}`)
    }

    return data.map(this.mapLineItemValidation)
  }

  // ========== Agent Executions ==========
  
  async createAgentExecution(execution: Omit<AgentExecution, 'id' | 'createdAt'>): Promise<string> {
    const { data, error } = await this.supabase
      .from('agent_executions')
      .insert([{
        session_id: execution.sessionId,
        agent_name: execution.agentName,
        agent_version: execution.agentVersion,
        agent_stage: execution.agentStage,
        execution_order: execution.executionOrder,
        start_time: execution.startTime,
        end_time: execution.endTime,
        execution_time: execution.executionTime,
        status: execution.status,
        input_data: execution.inputData,
        output_data: execution.outputData,
        reasoning: execution.reasoning,
        decision_rationale: execution.decisionRationale,
        confidence_score: execution.confidenceScore,
        tools_used: execution.toolsUsed,
      }])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating agent execution:', error)
      throw new Error(`Failed to create agent execution: ${error.message}`)
    }

    return data.id
  }

  async getAgentExecutions(sessionId: string): Promise<AgentExecution[]> {
    if (!this.checkSupabaseConnection()) {
      console.warn('Cannot get agent executions - database not available')
      return []
    }

    const { data, error } = await this.supabase
      .from('agent_executions')
      .select('*')
      .eq('session_id', sessionId)
      .order('execution_order')

    if (error) {
      console.error('Error getting agent executions:', error)
      throw new Error(`Failed to get agent executions: ${error.message}`)
    }

    return data.map(this.mapAgentExecution)
  }

  // ========== Validation Explanations ==========
  
  async createValidationExplanation(explanation: Omit<ValidationExplanation, 'id' | 'createdAt'>): Promise<string> {
    if (!this.checkSupabaseConnection()) {
      console.log('Mock: createValidationExplanation called')
      return `mock-explanation-${Date.now()}`
    }

    const { data, error } = await this.supabase
      .from('validation_explanations')
      .insert([{
        line_item_validation_id: explanation.lineItemValidationId,
        summary_explanation: explanation.summaryExplanation,
        detailed_explanation: explanation.detailedExplanation,
        technical_explanation: explanation.technicalExplanation,
        explanation_generated_at: explanation.explanationGeneratedAt,
        explanation_version: explanation.explanationVersion,
        user_helpful_rating: explanation.userHelpfulRating,
        user_feedback: explanation.userFeedback
      }])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating validation explanation:', error)
      // Try minimal fallback approach
      console.log('Main explanation insert failed, trying minimal approach')
      return await this.createMinimalValidationExplanation(explanation)
    }

    return data.id
  }

  // Minimal fallback method for explanation table
  private async createMinimalValidationExplanation(explanation: Omit<ValidationExplanation, 'id' | 'createdAt'>): Promise<string> {
    console.log('Using minimal validation explanation approach')
    
    // Try with just the essential fields
    const minimalData = {
      line_item_validation_id: explanation.lineItemValidationId,
      summary_explanation: explanation.summaryExplanation
    }

    const { data, error } = await this.supabase
      .from('validation_explanations')
      .insert([minimalData])
      .select('id')
      .single()

    if (error) {
      console.error('Even minimal explanation insert failed:', error)
      // Return a mock ID if database is completely unavailable
      console.log('Explanation database unavailable, returning mock ID')
      return `mock-explanation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    console.log('Minimal validation explanation created successfully')
    return data.id
  }

  async getValidationExplanations(lineItemValidationId: string): Promise<ValidationExplanation[]> {
    const { data, error } = await this.supabase
      .from('validation_explanations')
      .select('*')
      .eq('line_item_validation_id', lineItemValidationId)

    if (error) {
      console.error('Error getting validation explanations:', error)
      throw new Error(`Failed to get validation explanations: ${error.message}`)
    }

    return data.map(this.mapValidationExplanation)
  }

  // ========== Decision Factors ==========
  
  async createDecisionFactor(factor: Omit<DecisionFactor, 'id' | 'createdAt'>): Promise<string> {
    const { data, error } = await this.supabase
      .from('decision_factors')
      .insert([{
        line_item_validation_id: factor.lineItemValidationId,
        factor_type: factor.factorType,
        factor_name: factor.factorName,
        factor_description: factor.factorDescription,
        factor_weight: factor.factorWeight,
        factor_result: factor.factorResult,
        factor_value: factor.factorValue
      }])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating decision factor:', error)
      throw new Error(`Failed to create decision factor: ${error.message}`)
    }

    return data.id
  }

  async getDecisionFactors(lineItemValidationId: string): Promise<DecisionFactor[]> {
    const { data, error } = await this.supabase
      .from('decision_factors')
      .select('*')
      .eq('line_item_validation_id', lineItemValidationId)

    if (error) {
      console.error('Error getting decision factors:', error)
      throw new Error(`Failed to get decision factors: ${error.message}`)
    }

    return data.map(this.mapDecisionFactor)
  }

  // ========== Complete Validation Trace ==========
  
  async getValidationTrace(invoiceId: string): Promise<ValidationTrace | null> {
    if (!this.checkSupabaseConnection()) {
      console.warn('Database unavailable - creating mock validation trace for demonstration')
      return this.createMockValidationTrace(invoiceId)
    }

    try {
      const session = await this.getValidationSession(invoiceId)
      if (!session) {
        console.log(`No validation session found for invoice: ${invoiceId}`)
        return null
      }

      console.log(`Found session ${session.id} for invoice ${invoiceId}`)

      // Get related data with error handling
      const [lineItems, agentExecutions] = await Promise.allSettled([
        this.getLineItemValidations(session.id),
        this.getAgentExecutions(session.id)
      ])

      const finalLineItems = lineItems.status === 'fulfilled' ? lineItems.value : []
      const finalAgentExecutions = agentExecutions.status === 'fulfilled' ? agentExecutions.value : []

      console.log(`Retrieved ${finalLineItems.length} line items and ${finalAgentExecutions.length} agent executions`)

      // Get explanations and decision factors for all line items with error handling
      let explanations: any[] = []
      let decisionFactors: any[] = []

      if (finalLineItems.length > 0) {
        try {
          const explanationsPromises = finalLineItems.map(item => 
            this.getValidationExplanations(item.id).catch(err => {
              console.warn(`Failed to get explanations for line item ${item.id}:`, err)
              return []
            })
          )
          const decisionFactorsPromises = finalLineItems.map(item => 
            this.getDecisionFactors(item.id).catch(err => {
              console.warn(`Failed to get decision factors for line item ${item.id}:`, err)
              return []
            })
          )

          const [explanationArrays, decisionFactorArrays] = await Promise.all([
            Promise.all(explanationsPromises),
            Promise.all(decisionFactorsPromises)
          ])

          explanations = explanationArrays.flat()
          decisionFactors = decisionFactorArrays.flat()
        } catch (explanationError) {
          console.warn('Failed to fetch explanations and decision factors:', explanationError)
        }
      }

      // Agent executions are now returned separately, not as part of validationResults

      return {
        session,
        lineItems: finalLineItems,
        agentExecutions: finalAgentExecutions,
        explanations,
        decisionFactors
      }
    } catch (error) {
      console.error(`Error getting validation trace for ${invoiceId}:`, error)
      // Return mock data as fallback
      console.warn('Falling back to mock validation trace due to error')
      return this.createMockValidationTrace(invoiceId)
    }
  }

  private createMockValidationTrace(invoiceId: string): ValidationTrace {
    const mockSession: ValidationSession = {
      id: `mock-session-${invoiceId}`,
      invoiceId: invoiceId,
      userSession: 'demo-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invoiceData: {
        scopeOfWork: 'Demo validation data for history testing',
        serviceLineId: 1,
        serviceTypeName: 'Standard Service',
        laborHours: 0,
        items: [
          { name: 'Demo Item', quantity: 1, unitPrice: 50, unit: 'pcs', type: 'material' }
        ]
      },
      validationResults: {
        summary: { totalLines: 1, allow: 0, needsReview: 1, reject: 0 },
        lines: [
          {
            id: 'mock-line-1',
            sessionId: `mock-session-${invoiceId}`,
            lineItemIndex: 0,
            itemName: 'Demo Item',
            itemType: 'material',
            quantity: 1,
            unitPrice: 50,
            unit: 'pcs',
            validationDecision: 'NEEDS_REVIEW',
            confidenceScore: 0.7,
            primaryReason: 'Demo validation result',
            detailedExplanation: 'This is demo data for testing history functionality',
            supportingFactors: [],
            riskFactors: [],
            createdAt: new Date().toISOString()
          }
        ],
        overallDecision: 'NEEDS_REVIEW',
        executionTime: 2500
      },
      overallStatus: 'NEEDS_REVIEW',
      totalExecutionTime: 2500,
      langfuseTraceId: `mock-trace-${invoiceId}`,
      serviceLineName: 'Demo Service Line',
      notes: 'Mock data for demonstration purposes'
    }

    const mockLineItems: LineItemValidation[] = [
      {
        id: `mock-line-${invoiceId}`,
        sessionId: mockSession.id,
        lineItemIndex: 0,
        itemName: 'Demo Item',
        itemType: 'material',
        quantity: 1,
        unitPrice: 50,
        unit: 'pcs',
        validationDecision: 'NEEDS_REVIEW',
        confidenceScore: 0.7,
        primaryReason: 'Demo validation for testing',
        detailedExplanation: 'This is mock data to demonstrate history functionality',
        supportingFactors: ['Demo factor'],
        riskFactors: [],
        canonicalMatchId: null,
        canonicalMatchName: null,
        matchConfidence: null,
        pricingAnalysis: null,
        createdAt: new Date().toISOString()
      }
    ]

    return {
      session: mockSession,
      lineItems: mockLineItems,
      agentExecutions: [], // Mock agent executions for demo
      explanations: [],
      decisionFactors: []
    }
  }

  // ========== Validation History ==========
  
  async getValidationHistory(query: ValidationHistoryQuery): Promise<ValidationHistoryResponse> {
    if (!this.checkSupabaseConnection()) {
      console.warn('Cannot get validation history - database not available, returning mock data')
      return {
        sessions: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false
      }
    }

    let dbQuery = this.supabase
      .from('validation_sessions')
      .select('*', { count: 'exact' })

    // Apply filters
    if (query.startDate) {
      dbQuery = dbQuery.gte('created_at', query.startDate)
    }
    if (query.endDate) {
      dbQuery = dbQuery.lte('created_at', query.endDate)
    }
    if (query.status) {
      dbQuery = dbQuery.eq('overall_status', query.status)
    }
    if (query.serviceLine) {
      dbQuery = dbQuery.ilike('service_line_name', `%${query.serviceLine}%`)
    }
    if (query.itemName) {
      // Search within invoice_data for items matching the name
      dbQuery = dbQuery.textSearch('invoice_data', query.itemName)
    }

    // Apply sorting
    const sortBy = query.sortBy || 'date'
    const sortOrder = query.sortOrder || 'desc'
    const sortColumn = sortBy === 'date' ? 'created_at' : 
                      sortBy === 'executionTime' ? 'total_execution_time' : 
                      'overall_status'
    
    dbQuery = dbQuery.order(sortColumn, { ascending: sortOrder === 'asc' })

    // Apply pagination
    const limit = query.limit || 20
    const offset = query.offset || 0
    dbQuery = dbQuery.range(offset, offset + limit - 1)

    const { data, error, count } = await dbQuery

    if (error) {
      console.error('Error getting validation history:', error)
      throw new Error(`Failed to get validation history: ${error.message}`)
    }

    const sessions = (data || []).map(item => this.mapValidationSession(item))

    // For each session, populate the agent execution count in validationResults
    for (const session of sessions) {
      try {
        // Get agent executions count for this session
        const { data: agentExecs, error: agentError } = await this.supabase
          .from('agent_executions')
          .select('*')
          .eq('session_id', session.id)
          .order('execution_order')

        if (!agentError && agentExecs) {
          // Update the validation results to include agent executions
          if (!session.validationResults) {
            session.validationResults = {
              summary: { totalLines: 0, allow: 0, needsReview: 0, reject: 0 },
              lines: [],
              overallDecision: session.overallStatus,
              executionTime: session.totalExecutionTime || 0
            }
          }
          
          // Map agent executions properly
          session.validationResults.agentExecutions = agentExecs.map(this.mapAgentExecution)
        }
      } catch (agentFetchError) {
        console.warn(`Could not fetch agent executions for session ${session.id}:`, agentFetchError)
        // Ensure agentExecutions is an empty array rather than undefined
        if (session.validationResults) {
          session.validationResults.agentExecutions = []
        }
      }
    }

    return {
      sessions,
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: (count || 0) > offset + limit
    }
  }

  // Search validation sessions by item name or content
  async searchValidationSessions(params: {
    searchQuery: string
    status?: string
    startDate?: string
    endDate?: string
    serviceLine?: string
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: string
  }): Promise<ValidationSession[]> {
    let dbQuery = this.supabase
      .from('validation_sessions')
      .select('*')

    // Apply search - look in invoice_data for the search query
    if (params.searchQuery) {
      // Use PostgreSQL JSONB search to find items with matching names
      dbQuery = dbQuery.or(`invoice_data->>scopeOfWork.ilike.%${params.searchQuery}%,invoice_data->items->0->>name.ilike.%${params.searchQuery}%`)
    }

    // Apply filters
    if (params.startDate) {
      dbQuery = dbQuery.gte('created_at', params.startDate)
    }
    if (params.endDate) {
      dbQuery = dbQuery.lte('created_at', params.endDate)
    }
    if (params.status) {
      dbQuery = dbQuery.eq('overall_status', params.status)
    }
    if (params.serviceLine) {
      dbQuery = dbQuery.ilike('service_line_name', `%${params.serviceLine}%`)
    }

    // Apply sorting
    const sortOrder = params.sortOrder || 'desc'
    dbQuery = dbQuery.order('created_at', { ascending: sortOrder === 'asc' })

    // Apply pagination
    const limit = params.limit || 20
    const offset = params.offset || 0
    dbQuery = dbQuery.range(offset, offset + limit - 1)

    const { data, error } = await dbQuery

    if (error) {
      console.error('Error searching validation sessions:', error)
      throw new Error(`Failed to search validation sessions: ${error.message}`)
    }

    return (data || []).map(item => this.mapValidationSession(item))
  }

  // Get multiple validation sessions (helper method)
  async getValidationSessions(params: {
    userId?: string
    startDate?: string
    endDate?: string
    status?: string
    serviceLine?: string
    itemName?: string
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: string
  }): Promise<ValidationSession[]> {
    let dbQuery = this.supabase
      .from('validation_sessions')
      .select('*')

    // Apply filters
    if (params.startDate) {
      dbQuery = dbQuery.gte('created_at', params.startDate)
    }
    if (params.endDate) {
      dbQuery = dbQuery.lte('created_at', params.endDate)
    }
    if (params.status) {
      dbQuery = dbQuery.eq('overall_status', params.status)
    }
    if (params.serviceLine) {
      dbQuery = dbQuery.ilike('service_line_name', `%${params.serviceLine}%`)
    }
    if (params.itemName) {
      // Search within invoice_data for items matching the name
      dbQuery = dbQuery.or(`invoice_data->>scopeOfWork.ilike.%${params.itemName}%,invoice_data->items->0->>name.ilike.%${params.itemName}%`)
    }

    // Apply sorting
    const sortBy = params.sortBy || 'date'
    const sortOrder = params.sortOrder || 'desc'
    const sortColumn = sortBy === 'date' ? 'created_at' : 
                      sortBy === 'executionTime' ? 'total_execution_time' : 
                      'overall_status'
    
    dbQuery = dbQuery.order(sortColumn, { ascending: sortOrder === 'asc' })

    // Apply pagination
    const limit = params.limit || 20
    const offset = params.offset || 0
    dbQuery = dbQuery.range(offset, offset + limit - 1)

    const { data, error } = await dbQuery

    if (error) {
      console.error('Error getting validation sessions:', error)
      throw new Error(`Failed to get validation sessions: ${error.message}`)
    }

    return (data || []).map(item => this.mapValidationSession(item))
  }

  // ========== Utility Methods ==========

  private mapValidationSession(data: any): ValidationSession {
    return {
      id: data.id,
      invoiceId: data.invoice_id,
      userSession: data.user_session,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      invoiceData: data.invoice_data,
      validationResults: data.validation_results,
      overallStatus: data.overall_status,
      totalExecutionTime: data.total_execution_time,
      langfuseTraceId: data.langfuse_trace_id,
      serviceLineName: data.service_line_name,
      notes: data.notes
    }
  }

  private mapLineItemValidation(data: any): LineItemValidation {
    return {
      id: data.id,
      sessionId: data.session_id,
      lineItemIndex: data.line_item_index,
      itemName: data.item_name,
      itemType: data.item_type,
      quantity: data.quantity,
      unitPrice: data.unit_price,
      unit: data.unit,
      validationDecision: data.validation_decision,
      confidenceScore: data.confidence_score,
      primaryReason: data.primary_reason,
      detailedExplanation: data.detailed_explanation,
      supportingFactors: data.supporting_factors || [],
      riskFactors: data.risk_factors || [],
      canonicalMatchId: data.canonical_match_id,
      canonicalMatchName: data.canonical_match_name,
      matchConfidence: data.match_confidence,
      pricingAnalysis: data.pricing_analysis,
      createdAt: data.created_at
    }
  }

  private mapAgentExecution(data: any): AgentExecution {
    return {
      id: data.id,
      sessionId: data.session_id,
      agentName: data.agent_name,
      agentVersion: data.agent_version,
      agentStage: data.agent_stage,
      executionOrder: data.execution_order,
      startTime: data.start_time,
      endTime: data.end_time,
      executionTime: data.execution_time,
      status: data.status,
      inputData: data.input_data,
      outputData: data.output_data,
      reasoning: data.reasoning,
      decisionRationale: data.decision_rationale,
      confidenceScore: data.confidence_score,
      toolsUsed: data.tools_used || [],
      dataSourcesAccessed: data.data_sources_accessed || [],
      createdAt: data.created_at
    }
  }

  private mapValidationExplanation(data: any): ValidationExplanation {
    return {
      id: data.id,
      lineItemValidationId: data.line_item_validation_id,
      summaryExplanation: data.summary_explanation,
      detailedExplanation: data.detailed_explanation,
      technicalExplanation: data.technical_explanation,
      explanationGeneratedAt: data.explanation_generated_at,
      explanationVersion: data.explanation_version,
      userHelpfulRating: data.user_helpful_rating,
      userFeedback: data.user_feedback,
      createdAt: data.created_at
    }
  }

  private mapDecisionFactor(data: any): DecisionFactor {
    return {
      id: data.id,
      lineItemValidationId: data.line_item_validation_id,
      factorType: data.factor_type,
      factorName: data.factor_name,
      factorDescription: data.factor_description,
      factorWeight: data.factor_weight,
      factorResult: data.factor_result,
      factorValue: data.factor_value,
      createdAt: data.created_at
    }
  }

  private mapValidationSessionSummary(data: any) {
    return {
      id: data.id,
      invoiceId: data.invoice_id,
      createdAt: data.created_at,
      overallStatus: data.overall_status,
      itemCount: data.item_count,
      approvedItems: data.approved_items,
      reviewItems: data.review_items,
      rejectedItems: data.rejected_items,
      totalExecutionTime: data.total_execution_time,
      serviceLineName: data.service_line_name,
      serviceTypeName: data.service_type_name
    }
  }

  // Cleanup old data
  async cleanupOldValidationData(retentionDays: number = 90): Promise<number> {
    const { data, error } = await this.supabase.rpc('cleanup_old_validation_data', {
      retention_days: retentionDays
    })

    if (error) {
      console.error('Error cleaning up old validation data:', error)
      throw new Error(`Failed to cleanup old data: ${error.message}`)
    }

    return data
  }
}

// Export lazy singleton instance
let _transparencyDB: TransparencyDB | null = null

function getTransparencyDB(): TransparencyDB {
  if (!_transparencyDB) {
    _transparencyDB = new TransparencyDB()
  }
  return _transparencyDB
}

export const transparencyDB = new Proxy({} as TransparencyDB, {
  get(target, prop) {
    const db = getTransparencyDB()
    const value = (db as any)[prop]
    return typeof value === 'function' ? value.bind(db) : value
  }
})