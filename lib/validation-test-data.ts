// Test data for validation functionality
import { EnhancedValidationRequest } from './types/transparency'

export const sampleEnhancedRequest: EnhancedValidationRequest = {
  scopeOfWork: "Office renovation project - electrical and plumbing upgrades",
  serviceLineId: 1,
  serviceTypeId: 1,
  laborHours: 24,
  items: [
      {
        name: "Industrial LED light fixtures",
        quantity: 12,
        unitPrice: 85.50,
        unit: "pcs",
        type: "equipment"
      },
      {
        name: "Electrical conduit piping",
        quantity: 100,
        unitPrice: 4.75,
        unit: "ft",
        type: "material"
      },
      {
        name: "Copper pipe fittings",
        quantity: 25,
        unitPrice: 12.30,
        unit: "pcs",
        type: "material"
      }
    ],
  includeAgentTraces: true,
  includeDetailedExplanations: true,
  explanationLevel: 2
}

export const sampleMockResponse = {
  success: true,
  invoiceId: "test-invoice-12345",
  traceId: "trace-67890",
  timestamp: new Date().toISOString(),
  totalExecutionTime: 2450,
  overallStatus: "ALLOW" as const,
  summary: {
    totalLines: 3,
    allow: 2,
    needsReview: 1,
    reject: 0
  },
  lines: [
    {
      input: {
        name: "Industrial LED light fixtures",
        quantity: 12,
        unitPrice: 85.50,
        unit: "pcs",
        type: "equipment" as const
      },
      status: "NEEDS_REVIEW" as const,
      confidenceScore: 0.75,
      explanation: {
        summary: "Item approved but flagged for high unit cost review",
        detailed: "The LED fixtures are legitimate equipment but price seems elevated for standard office use. Recommend verifying specifications match the quoted price.",
        technical: "Price analysis: $85.50 vs market avg $65-75. Quality/spec verification needed.",
        primaryFactors: ["high_unit_cost", "equipment_category_match"],
        riskFactors: ["PRICE_VARIANCE"]
      },
      agentContributions: [],
      decisionFactors: []
    }
  ],
  executionSummary: {
    totalAgents: 5,
    averageConfidence: 0.82,
    errorCount: 0,
    bottlenecks: [],
    criticalPath: ["PreprocessingAgent", "PricingAgent", "ComplianceAgent"]
  },
  agentTraces: []
}

// Mock function to simulate API delay
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))