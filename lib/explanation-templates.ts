// Enhanced explanation templates for better user understanding
import { 
  ValidationStatus, 
  LineItemExplanation, 
  ExplanationTemplate, 
  ExplanationContext,
  DecisionFactor 
} from './types/transparency'

// Template definitions for different validation scenarios
export const EXPLANATION_TEMPLATES: Record<string, ExplanationTemplate> = {
  // ALLOW templates
  ALLOW_CATALOG_MATCH: {
    id: 'allow_catalog_match',
    scenario: 'Item found in canonical catalog with acceptable price',
    template: `This {itemType} was **approved** because it matches our canonical catalog with {matchConfidence}% confidence. The unit price of {unitPrice} is within the acceptable range for {itemName}.`,
    variables: ['itemType', 'matchConfidence', 'unitPrice', 'itemName'],
    level: 1
  },
  
  ALLOW_MARKET_PRICE: {
    id: 'allow_market_price',
    scenario: 'Item approved based on market price analysis',
    template: `This {itemType} was **approved** after market price analysis. The quoted price of {unitPrice} is {priceComparison} compared to the market average of {marketAverage}, falling within our {toleranceRange}% tolerance range.`,
    variables: ['itemType', 'unitPrice', 'priceComparison', 'marketAverage', 'toleranceRange'],
    level: 2
  },

  ALLOW_VENDOR_VERIFIED: {
    id: 'allow_vendor_verified',
    scenario: 'Item approved due to verified vendor relationship',
    template: `This {itemType} was **approved** because it comes from {vendorName}, a verified vendor in our system with a {vendorRating}/5 rating and {contractStatus} contract status.`,
    variables: ['itemType', 'vendorName', 'vendorRating', 'contractStatus'],
    level: 1
  },

  // NEEDS_REVIEW templates
  REVIEW_PRICE_VARIANCE: {
    id: 'review_price_variance',
    scenario: 'Item flagged for price variance beyond tolerance',
    template: `This {itemType} **needs review** because the unit price of {unitPrice} is {variancePercentage}% {varianceDirection} than the expected range of {expectedRange}. Manual review is required to verify pricing justification.`,
    variables: ['itemType', 'unitPrice', 'variancePercentage', 'varianceDirection', 'expectedRange'],
    level: 1
  },

  REVIEW_UNKNOWN_ITEM: {
    id: 'review_unknown_item',
    scenario: 'Item not found in catalog or databases',
    template: `This item **needs review** because "{itemName}" was not found in our canonical catalog or market price databases. Our agents achieved only {matchConfidence}% confidence in categorization. Please verify the item details and pricing.`,
    variables: ['itemName', 'matchConfidence'],
    level: 1
  },

  REVIEW_QUANTITY_ANOMALY: {
    id: 'review_quantity_anomaly',
    scenario: 'Unusual quantity detected',
    template: `This {itemType} **needs review** due to an unusual quantity of {quantity} {unit}. This is {anomalyDescription} compared to typical orders for similar work scopes. Please confirm the quantity is correct.`,
    variables: ['itemType', 'quantity', 'unit', 'anomalyDescription'],
    level: 1
  },

  // REJECT templates
  REJECT_PROHIBITED_ITEM: {
    id: 'reject_prohibited_item',
    scenario: 'Item is on prohibited list or violates policy',
    template: `This item was **rejected** because "{itemName}" is {prohibitionReason}. Policy reference: {policyCode}. Consider alternative items or seek special approval through {approvalProcess}.`,
    variables: ['itemName', 'prohibitionReason', 'policyCode', 'approvalProcess'],
    level: 1
  },

  REJECT_PRICE_EXCESSIVE: {
    id: 'reject_price_excessive',
    scenario: 'Price exceeds maximum allowable limits',
    template: `This {itemType} was **rejected** because the unit price of {unitPrice} exceeds our maximum allowable limit of {maxAllowedPrice} by {excessPercentage}%. This violates spending policy {policyReference}.`,
    variables: ['itemType', 'unitPrice', 'maxAllowedPrice', 'excessPercentage', 'policyReference'],
    level: 1
  },

  REJECT_VENDOR_BLACKLISTED: {
    id: 'reject_vendor_blacklisted',
    scenario: 'Vendor is blacklisted or suspended',
    template: `This item was **rejected** because the vendor "{vendorName}" is currently {vendorStatus} in our system. Reason: {blacklistReason}. Contact procurement for alternative vendors.`,
    variables: ['vendorName', 'vendorStatus', 'blacklistReason'],
    level: 1
  }
}

// Risk factor explanations
export const RISK_FACTOR_EXPLANATIONS: Record<string, string> = {
  HIGH_PRICE_VARIANCE: 'The price significantly deviates from market averages',
  UNKNOWN_VENDOR: 'The vendor is not in our verified supplier database',
  LARGE_QUANTITY: 'The quantity is unusually large for this type of item',
  RUSH_ORDER: 'This appears to be a rush order which may affect pricing',
  SEASONAL_PRICING: 'Item pricing may be affected by seasonal market conditions',
  REGULATORY_CONCERN: 'Item may have regulatory compliance requirements',
  TECHNICAL_COMPLEXITY: 'Item has technical specifications that need verification'
}

// Decision factor templates
export const DECISION_FACTOR_TEMPLATES: Record<string, string> = {
  CATALOG_MATCH: 'Exact match found in canonical catalog ({confidence}% confidence)',
  PRICE_ANALYSIS: 'Market price analysis shows {comparison} vs average',
  VENDOR_VERIFICATION: 'Vendor {vendorName} has {rating}/5 rating',
  POLICY_COMPLIANCE: 'Item complies with policy {policyCode}',
  TECHNICAL_SPECS: 'Technical specifications verified against requirements',
  QUANTITY_VALIDATION: 'Quantity {quantity} {unit} is within normal range',
  HISTORICAL_USAGE: 'Similar items used in {historicalCount} previous projects'
}

// Main explanation generator class
export class ExplanationGenerator {
  
  /**
   * Generate contextual explanation for a line item validation
   */
  static generateExplanation(
    context: ExplanationContext,
    decisionFactors: DecisionFactor[]
  ): LineItemExplanation {
    const { lineItem, validationDecision, confidence, riskFactors } = context
    
    // Determine the best template based on decision and factors
    const template = this.selectTemplate(validationDecision, decisionFactors, riskFactors)
    
    // Generate explanations at all three levels
    const summary = this.generateSummary(template, context, decisionFactors)
    const detailed = this.generateDetailed(template, context, decisionFactors)
    const technical = this.generateTechnical(template, context, decisionFactors)
    
    // Extract primary factors
    const primaryFactors = decisionFactors
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 3)
      .map(factor => factor.factorName)
    
    return {
      summary,
      detailed,
      technical,
      primaryFactors,
      riskFactors: riskFactors || []
    }
  }

  /**
   * Select the most appropriate template
   */
  private static selectTemplate(
    decision: ValidationStatus,
    factors: DecisionFactor[],
    riskFactors: string[]
  ): ExplanationTemplate {
    const hasHighPriceVariance = riskFactors.includes('HIGH_PRICE_VARIANCE')
    const hasUnknownVendor = riskFactors.includes('UNKNOWN_VENDOR')
    const hasCatalogMatch = factors.some(f => f.factorName.includes('catalog'))
    const hasVendorVerification = factors.some(f => f.factorName.includes('vendor'))

    switch (decision) {
      case 'ALLOW':
        if (hasCatalogMatch) return EXPLANATION_TEMPLATES.ALLOW_CATALOG_MATCH
        if (hasVendorVerification) return EXPLANATION_TEMPLATES.ALLOW_VENDOR_VERIFIED
        return EXPLANATION_TEMPLATES.ALLOW_MARKET_PRICE
        
      case 'NEEDS_REVIEW':
        if (hasHighPriceVariance) return EXPLANATION_TEMPLATES.REVIEW_PRICE_VARIANCE
        if (hasUnknownVendor) return EXPLANATION_TEMPLATES.REVIEW_UNKNOWN_ITEM
        return EXPLANATION_TEMPLATES.REVIEW_QUANTITY_ANOMALY
        
      case 'REJECT':
        if (hasHighPriceVariance) return EXPLANATION_TEMPLATES.REJECT_PRICE_EXCESSIVE
        if (hasUnknownVendor) return EXPLANATION_TEMPLATES.REJECT_VENDOR_BLACKLISTED
        return EXPLANATION_TEMPLATES.REJECT_PROHIBITED_ITEM
        
      default:
        return EXPLANATION_TEMPLATES.ALLOW_CATALOG_MATCH
    }
  }

  /**
   * Generate Level 1 (Summary) explanation
   */
  private static generateSummary(
    template: ExplanationTemplate,
    context: ExplanationContext,
    factors: DecisionFactor[]
  ): string {
    const variables = this.extractVariables(context, factors)
    return this.interpolateTemplate(template.template, variables)
  }

  /**
   * Generate Level 2 (Detailed) explanation
   */
  private static generateDetailed(
    template: ExplanationTemplate,
    context: ExplanationContext,
    factors: DecisionFactor[]
  ): string {
    const summary = this.generateSummary(template, context, factors)
    
    let detailed = summary + '\n\n**Analysis Details:**\n'
    
    // Add factor analysis
    factors.forEach(factor => {
      const explanation = DECISION_FACTOR_TEMPLATES[factor.factorType] || 
                        `${factor.factorName}: ${factor.factorValue}`
      detailed += `• ${explanation}\n`
    })
    
    // Add risk factor explanations
    if (context.riskFactors && context.riskFactors.length > 0) {
      detailed += '\n**Risk Considerations:**\n'
      context.riskFactors.forEach(risk => {
        const explanation = RISK_FACTOR_EXPLANATIONS[risk] || risk
        detailed += `• ${explanation}\n`
      })
    }
    
    return detailed
  }

  /**
   * Generate Level 3 (Technical) explanation
   */
  private static generateTechnical(
    template: ExplanationTemplate,
    context: ExplanationContext,
    factors: DecisionFactor[]
  ): string {
    const detailed = this.generateDetailed(template, context, factors)
    
    let technical = detailed + '\n\n**Technical Analysis:**\n'
    
    // Add confidence scoring details
    technical += `• Validation confidence: ${Math.round(context.confidence * 100)}%\n`
    technical += `• Decision threshold: ${this.getDecisionThreshold(context.validationDecision)}\n`
    
    // Add factor weights and impact scores
    technical += '\n**Decision Factor Analysis:**\n'
    factors.forEach(factor => {
      technical += `• ${factor.factorName}:\n`
      technical += `  - Weight: ${(factor.weight || 0) * 100}%\n`
      technical += `  - Impact: ${(factor.impactScore || 0) * 100}%\n`
      technical += `  - Value: ${factor.factorValue}\n`
    })
    
    // Add algorithm details
    technical += '\n**Algorithm Details:**\n'
    technical += `• Template used: ${template.id}\n`
    technical += `• Scenario: ${template.scenario}\n`
    technical += `• Processing timestamp: ${new Date().toISOString()}\n`
    
    return technical
  }

  /**
   * Extract template variables from context
   */
  private static extractVariables(
    context: ExplanationContext,
    factors: DecisionFactor[]
  ): Record<string, string> {
    const item = context.lineItem
    
    return {
      itemType: this.getItemType(item.itemType || 'item'),
      itemName: item.itemName,
      unitPrice: `$${(item.unitPrice || 0).toFixed(2)}`,
      quantity: (item.quantity || 1).toString(),
      unit: 'units', // Would come from line item data
      matchConfidence: Math.round(context.confidence * 100).toString(),
      vendorName: 'Unknown Vendor', // Would come from validation data
      vendorRating: '4.2', // Would come from vendor database
      contractStatus: 'active', // Would come from vendor database
      variancePercentage: '25', // Would be calculated from price analysis
      varianceDirection: 'higher', // Would be calculated from price analysis
      expectedRange: '$50-75', // Would come from market analysis
      anomalyDescription: 'significantly higher', // Would be calculated
      prohibitionReason: 'not pre-approved for this project type',
      policyCode: 'PROC-2024-001',
      approvalProcess: 'special procurement approval workflow',
      maxAllowedPrice: '$100.00', // Would come from policy data
      excessPercentage: '25', // Would be calculated
      policyReference: 'Standard Procurement Policy Section 3.2',
      vendorStatus: 'temporarily suspended',
      blacklistReason: 'quality issues reported in Q2 2024',
      priceComparison: '12% lower',
      marketAverage: '$65.00',
      toleranceRange: '15'
    }
  }

  /**
   * Interpolate template with variables
   */
  private static interpolateTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template
    
    // Replace ${variable} patterns
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
    })
    
    // Replace {variable} patterns
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    })
    
    return result
  }

  /**
   * Get human-readable item type
   */
  private static getItemType(itemType: string): string {
    const types: Record<string, string> = {
      'material': 'material',
      'equipment': 'equipment',
      'labor': 'labor service',
      'tool': 'tool',
      'service': 'service'
    }
    
    return types[itemType.toLowerCase()] || 'item'
  }

  /**
   * Get decision threshold for technical explanation
   */
  private static getDecisionThreshold(decision: ValidationStatus): string {
    switch (decision) {
      case 'ALLOW': return '>= 80% confidence required for auto-approval'
      case 'NEEDS_REVIEW': return '40-79% confidence triggers manual review'
      case 'REJECT': return '< 40% confidence or policy violation triggers rejection'
      default: return 'Unknown threshold'
    }
  }
}

// Export utility functions for use in validation pipeline
export function generateExplanationForItem(
  lineItem: any,
  decision: ValidationStatus,
  confidence: number,
  factors: DecisionFactor[],
  riskFactors?: string[]
): LineItemExplanation {
  const context: ExplanationContext = {
    lineItem,
    validationDecision: decision,
    confidence,
    riskFactors
  }
  
  return ExplanationGenerator.generateExplanation(context, factors)
}

// Mock decision factors for testing
export function generateMockDecisionFactors(decision: ValidationStatus): DecisionFactor[] {
  switch (decision) {
    case 'ALLOW':
      return [
        {
          id: '1',
          lineItemValidationId: 'test',
          factorType: 'CATALOG_MATCH',
          factorName: 'canonical_catalog_match',
          factorValue: '95% match confidence',
          weight: 0.8,
          impactScore: 0.9,
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          lineItemValidationId: 'test',
          factorType: 'PRICE_ANALYSIS',
          factorName: 'market_price_validation',
          factorValue: 'Within 10% of market average',
          weight: 0.6,
          impactScore: 0.7,
          createdAt: new Date().toISOString()
        }
      ]
    
    case 'NEEDS_REVIEW':
      return [
        {
          id: '3',
          lineItemValidationId: 'test',
          factorType: 'PRICE_ANALYSIS',
          factorName: 'price_variance_detected',
          factorValue: '25% above expected range',
          weight: 0.9,
          impactScore: 0.8,
          createdAt: new Date().toISOString()
        }
      ]
    
    case 'REJECT':
      return [
        {
          id: '4',
          lineItemValidationId: 'test',
          factorType: 'POLICY_VIOLATION',
          factorName: 'exceeds_spending_limit',
          factorValue: 'Exceeds $100 limit by 50%',
          weight: 1.0,
          impactScore: 1.0,
          createdAt: new Date().toISOString()
        }
      ]
    
    default:
      return []
  }
}