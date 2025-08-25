// Client-side API functions for transparency features

import {
  EnhancedValidationRequest,
  EnhancedValidationResponse,
  ValidationHistoryQuery,
  ValidationHistoryResponse,
  ValidationTrace,
  AgentExecution
} from './types/transparency'

// Enhanced validation with full transparency
export async function validateInvoiceEnhanced(
  request: EnhancedValidationRequest
): Promise<EnhancedValidationResponse> {
  const response = await fetch('/api/validate-enhanced', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Enhanced validation failed')
  }

  return response.json()
}

// Get validation history with filtering and pagination
export async function getValidationHistory(
  query: ValidationHistoryQuery = {}
): Promise<ValidationHistoryResponse> {
  const params = new URLSearchParams()
  
  if (query.userId) params.append('userId', query.userId)
  if (query.startDate) params.append('startDate', query.startDate)
  if (query.endDate) params.append('endDate', query.endDate)
  if (query.status) params.append('status', query.status)
  if (query.serviceLine) params.append('serviceLine', query.serviceLine)
  if (query.itemName) params.append('itemName', query.itemName)
  if (query.limit) params.append('limit', query.limit.toString())
  if (query.offset) params.append('offset', query.offset.toString())
  if (query.sortBy) params.append('sortBy', query.sortBy)
  if (query.sortOrder) params.append('sortOrder', query.sortOrder)

  const response = await fetch(`/api/validation-history?${params}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to fetch validation history')
  }

  return response.json()
}

// Get detailed validation information for a specific invoice
export async function getValidationDetails(invoiceId: string): Promise<ValidationTrace> {
  const response = await fetch(`/api/validation/${invoiceId}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to fetch validation details')
  }

  const result = await response.json()
  return result.data
}

// Get agent execution traces for a specific invoice
export async function getAgentTraces(
  invoiceId: string,
  options: {
    agentName?: string
    stage?: string
    includeReasoning?: boolean
  } = {}
): Promise<{
  invoiceId: string
  sessionId: string
  totalExecutions: number
  statistics: any
  executions: AgentExecution[]
}> {
  const params = new URLSearchParams()
  
  if (options.agentName) params.append('agentName', options.agentName)
  if (options.stage) params.append('stage', options.stage)
  if (options.includeReasoning) params.append('includeReasoning', 'true')

  const response = await fetch(`/api/validation/${invoiceId}/agent-traces?${params}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to fetch agent traces')
  }

  return response.json()
}

// Submit user feedback on explanation helpfulness
export async function submitExplanationFeedback(
  validationId: string,
  lineItemIndex: number,
  rating: number,
  feedback?: string
): Promise<void> {
  // This would be implemented as a separate endpoint
  const response = await fetch('/api/explanation-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      validationId,
      lineItemIndex,
      rating,
      feedback,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to submit feedback')
  }
}

// Export validation report (for compliance/audit purposes)
export async function exportValidationReport(
  invoiceId: string,
  format: 'pdf' | 'json' | 'csv' = 'pdf'
): Promise<Blob> {
  const response = await fetch(`/api/validation/${invoiceId}/export?format=${format}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to export validation report')
  }

  return response.blob()
}

// Search validation history by item name or description
export async function searchValidationHistory(
  searchQuery: string,
  filters: {
    status?: string
    dateRange?: { start: string; end: string }
    serviceLine?: string
  } = {}
): Promise<ValidationHistoryResponse> {
  return getValidationHistory({
    itemName: searchQuery,
    status: filters.status as any,
    startDate: filters.dateRange?.start,
    endDate: filters.dateRange?.end,
    serviceLine: filters.serviceLine,
    limit: 50,
    sortBy: 'date',
    sortOrder: 'desc'
  })
}

// Get validation statistics for dashboard
export async function getValidationStatistics(
  timeRange: '24h' | '7d' | '30d' | '90d' = '7d'
): Promise<{
  totalValidations: number
  successRate: number
  averageExecutionTime: number
  topAgents: { name: string; count: number; avgTime: number }[]
  statusDistribution: { status: string; count: number; percentage: number }[]
  trendData: { date: string; count: number; avgTime: number }[]
}> {
  const response = await fetch(`/api/validation-statistics?range=${timeRange}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Failed to fetch validation statistics')
  }

  return response.json()
}

// Batch validation for multiple invoices
export async function validateMultipleInvoices(
  requests: EnhancedValidationRequest[]
): Promise<EnhancedValidationResponse[]> {
  const response = await fetch('/api/validate-enhanced/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.details || error.error || 'Batch validation failed')
  }

  return response.json()
}

// Re-run validation with different parameters (for testing/debugging)
export async function revalidateInvoice(
  invoiceId: string,
  newParameters: Partial<EnhancedValidationRequest>
): Promise<EnhancedValidationResponse> {
  // Get the original validation
  const originalValidation = await getValidationDetails(invoiceId)
  
  // Merge with new parameters
  const request: EnhancedValidationRequest = {
    scopeOfWork: originalValidation.session.invoiceData.scopeOfWork,
    serviceLineId: originalValidation.session.invoiceData.serviceLineId,
    serviceTypeId: 1, // Default value since it's not in the original data
    laborHours: originalValidation.session.invoiceData.laborHours,
    items: originalValidation.session.invoiceData.items,
    ...newParameters
  }

  return validateInvoiceEnhanced(request)
}

// Compare two validations side by side
export async function compareValidations(
  invoiceId1: string,
  invoiceId2: string
): Promise<{
  validation1: ValidationTrace
  validation2: ValidationTrace
  differences: {
    statusChanges: Array<{ item: string; from: string; to: string }>
    confidenceChanges: Array<{ item: string; from: number; to: number }>
    executionTimeChange: { from: number; to: number }
    agentDifferences: Array<{ agent: string; change: string }>
  }
}> {
  const [validation1, validation2] = await Promise.all([
    getValidationDetails(invoiceId1),
    getValidationDetails(invoiceId2)
  ])

  // Calculate differences
  const statusChanges = []
  const confidenceChanges = []

  for (let i = 0; i < Math.min(validation1.lineItems.length, validation2.lineItems.length); i++) {
    const item1 = validation1.lineItems[i]
    const item2 = validation2.lineItems[i]

    if (item1.validationDecision !== item2.validationDecision) {
      statusChanges.push({
        item: item1.itemName,
        from: item1.validationDecision,
        to: item2.validationDecision
      })
    }

    if (item1.confidenceScore && item2.confidenceScore && 
        Math.abs(item1.confidenceScore - item2.confidenceScore) > 0.1) {
      confidenceChanges.push({
        item: item1.itemName,
        from: item1.confidenceScore,
        to: item2.confidenceScore
      })
    }
  }

  const executionTimeChange = {
    from: validation1.session.totalExecutionTime || 0,
    to: validation2.session.totalExecutionTime || 0
  }

  // Compare agent executions
  const agents1 = new Set(validation1.agentExecutions.map(a => a.agentName))
  const agents2 = new Set(validation2.agentExecutions.map(a => a.agentName))
  
  const agentDifferences = [
    ...Array.from(agents1).filter(a => !agents2.has(a)).map(a => ({ agent: a, change: 'removed' })),
    ...Array.from(agents2).filter(a => !agents1.has(a)).map(a => ({ agent: a, change: 'added' }))
  ]

  return {
    validation1,
    validation2,
    differences: {
      statusChanges,
      confidenceChanges,
      executionTimeChange,
      agentDifferences
    }
  }
}