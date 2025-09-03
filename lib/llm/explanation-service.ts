/**
 * LLM-powered explanation service for generating user-friendly validation messages
 * Uses OpenRouter API to create clear, contextual explanations for validation decisions
 */

import { OpenRouterService, createOpenRouterService } from './openrouter-service';

export interface ExplanationRequest {
  itemName: string;
  itemType?: string;
  unitPrice?: number;
  quantity?: number;
  validationDecision: 'ALLOW' | 'REJECT' | 'NEEDS_REVIEW';
  rejectionReason?: string;
  rejectionSource?: string;
  serviceLine?: string;
  serviceType?: string;
  scopeOfWork?: string;
  agentOutputs?: any[];
  priceAnalysis?: {
    expectedRange?: any;
    variance?: number;
    source?: string;
  };
}

export interface LLMExplanation {
  summary: string;
  detailed: string;
  actionable: string;
  confidence: number;
  userFriendly: boolean;
}

/**
 * Generate user-friendly explanations using LLM (with timeout for performance)
 */
export async function generateLLMExplanation(request: ExplanationRequest): Promise<LLMExplanation> {
  // Add timeout to prevent slow LLM calls
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('LLM explanation timeout')), 5000); // 5 second timeout for faster model
  });

  try {
    // Use GPT-4o-mini for fast, cost-effective explanations
    const openRouterService = createOpenRouterService();
    
    // Simplified, focused system prompt for faster responses
    const systemPrompt = `You are a procurement specialist explaining validation decisions. Be concise and helpful.

For REJECTED items: State why rejected and what to do instead.
For NEEDS_REVIEW items: State what information is needed.
For APPROVED items: Briefly confirm approval.

Use 1-2 sentences maximum. Be direct and actionable.`;

    // Simplified, faster prompt
    const userPrompt = `Item: "${request.itemName}" (${request.itemType})
Decision: ${request.validationDecision}
Reason: ${request.rejectionReason || 'Standard validation'}

Generate a concise explanation in business language.`;

    // Race between LLM call and timeout
    const llmPromise = openRouterService.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: 'openai/gpt-4o-mini', // Fast (~2s), cost-effective model perfect for explanations
      temperature: 0.3, // Low temperature for consistent, professional explanations
      maxTokens: 150   // Limit tokens for faster response
    });

    const response = await Promise.race([llmPromise, timeoutPromise]);

    // Parse LLM response
    const explanationText = response.choices?.[0]?.message?.content || '';
    
    // Extract sections (summary, detailed, actionable)
    const sections = parseLLMExplanationResponse(explanationText);
    
    return {
      summary: sections.summary || generateFallbackSummary(request),
      detailed: sections.detailed || generateFallbackDetailed(request),
      actionable: sections.actionable || generateFallbackActionable(request),
      confidence: 0.85, // High confidence in LLM explanations
      userFriendly: true
    };

  } catch (error) {
    console.error('LLM explanation generation failed:', error);
    
    // Fallback to rule-based explanations
    return generateFallbackExplanation(request);
  }
}

/**
 * Parse structured response from LLM
 */
function parseLLMExplanationResponse(text: string): {
  summary?: string;
  detailed?: string;
  actionable?: string;
} {
  // Simple parsing - look for numbered sections or clear separators
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let summary = '';
  let detailed = '';
  let actionable = '';
  
  let currentSection = 'summary';
  
  for (const line of lines) {
    // Detect section headers
    if (line.match(/^1\.|summary|brief/i)) {
      currentSection = 'summary';
      continue;
    } else if (line.match(/^2\.|detailed|explanation/i)) {
      currentSection = 'detailed';
      continue;
    } else if (line.match(/^3\.|actionable|next steps|what to do/i)) {
      currentSection = 'actionable';
      continue;
    }
    
    // Add content to current section
    switch (currentSection) {
      case 'summary':
        summary += (summary ? ' ' : '') + line;
        break;
      case 'detailed':
        detailed += (detailed ? ' ' : '') + line;
        break;
      case 'actionable':
        actionable += (actionable ? ' ' : '') + line;
        break;
    }
  }
  
  return {
    summary: summary || undefined,
    detailed: detailed || undefined,
    actionable: actionable || undefined
  };
}

/**
 * Generate fallback explanations when LLM is unavailable
 */
function generateFallbackExplanation(request: ExplanationRequest): LLMExplanation {
  return {
    summary: generateFallbackSummary(request),
    detailed: generateFallbackDetailed(request),
    actionable: generateFallbackActionable(request),
    confidence: 0.7,
    userFriendly: true
  };
}

function generateFallbackSummary(request: ExplanationRequest): string {
  const { validationDecision, itemName, rejectionReason } = request;
  
  switch (validationDecision) {
    case 'REJECT':
      if (rejectionReason?.toLowerCase().includes('blacklisted') || rejectionReason?.includes('labor')) {
        return `"${itemName}" was rejected because it contains terms that are not permitted through our facility management procurement system.`;
      }
      return `"${itemName}" was rejected due to policy violations.`;
    
    case 'NEEDS_REVIEW':
      return `"${itemName}" requires manual review before approval.`;
    
    case 'ALLOW':
      return `"${itemName}" was approved and meets all validation criteria.`;
    
    default:
      return `Validation completed for "${itemName}".`;
  }
}

function generateFallbackDetailed(request: ExplanationRequest): string {
  const { validationDecision, itemName, rejectionReason, serviceLine, serviceType } = request;
  
  switch (validationDecision) {
    case 'REJECT':
      if (rejectionReason?.toLowerCase().includes('blacklisted') || rejectionReason?.includes('labor')) {
        return `The item "${itemName}" contains terms (such as "labor", "fees", or "services") that are handled through different procurement channels. Our facility management system is designed for physical materials and equipment only. Labor costs and service fees must be processed through HR and service contract workflows respectively.`;
      }
      return `The item "${itemName}" does not meet our facility management procurement criteria and has been rejected based on established policies.`;
    
    case 'NEEDS_REVIEW':
      return `The item "${itemName}" requires additional verification. This could be due to pricing variance, unknown vendor, or missing product information. A procurement specialist will review the details manually.`;
    
    case 'ALLOW':
      return `The item "${itemName}" has been approved. It matches our catalog specifications, falls within acceptable price ranges, and meets all facility management requirements${serviceLine ? ` for ${serviceLine}` : ''}.`;
    
    default:
      return `Validation processing has been completed for "${itemName}".`;
  }
}

function generateFallbackActionable(request: ExplanationRequest): string {
  const { validationDecision, rejectionReason } = request;
  
  switch (validationDecision) {
    case 'REJECT':
      if (rejectionReason?.toLowerCase().includes('blacklisted') || rejectionReason?.includes('labor')) {
        return `For labor costs: Submit through HR department. For service fees: Use the service contract approval process. For materials: Resubmit with specific material/equipment names.`;
      }
      return `Contact your procurement team to discuss alternative items or seek special approval if this item is critical for your project.`;
    
    case 'NEEDS_REVIEW':
      return `Please provide additional details about this item or contact procurement for assistance. Include vendor information, detailed specifications, or business justification as needed.`;
    
    case 'ALLOW':
      return `No action required - proceed with procurement through standard channels.`;
    
    default:
      return `Contact support if you need assistance with this validation result.`;
  }
}

/**
 * Enhanced explanation generation with LLM integration
 */
export async function generateEnhancedExplanation(request: ExplanationRequest): Promise<{
  summary: string;
  detailed: string;
  technical: string;
}> {
  try {
    // Use LLM for user-friendly explanations
    const llmExplanation = await generateLLMExplanation(request);
    
    // Combine LLM explanation with technical details
    const technicalDetails = `**Technical Validation Details:**
- Agent: ${request.rejectionSource || 'validation-pipeline'}
- Confidence: ${Math.round((request.priceAnalysis?.variance || 0.85) * 100)}%
- Item Type: ${request.itemType || 'material'}
- Price Analysis: ${request.priceAnalysis?.source || 'standard-validation'}
- Policy Reference: ${getReferenceForReason(request.rejectionReason)}

**Raw Agent Output:**
${request.rejectionReason || 'Standard validation completed'}`;

    return {
      summary: llmExplanation.summary,
      detailed: llmExplanation.detailed + '\n\n**Next Steps:** ' + llmExplanation.actionable,
      technical: technicalDetails
    };

  } catch (error) {
    console.error('Enhanced explanation generation failed:', error);
    
    // Return fallback explanations
    const fallback = generateFallbackExplanation(request);
    return {
      summary: fallback.summary,
      detailed: fallback.detailed + '\n\n**Next Steps:** ' + fallback.actionable,
      technical: `Technical validation completed. Reason: ${request.rejectionReason || 'Standard processing'}`
    };
  }
}

/**
 * Get policy reference based on rejection reason
 */
function getReferenceForReason(reason?: string): string {
  if (!reason) return 'STANDARD-PROC-2024';
  
  const lowerReason = reason.toLowerCase();
  
  if (lowerReason.includes('labor') || lowerReason.includes('worker')) {
    return 'LABOR-EXCLUSION-2024';
  }
  if (lowerReason.includes('fee') || lowerReason.includes('charge')) {
    return 'SERVICE-FEE-2024';
  }
  if (lowerReason.includes('blacklisted') || lowerReason.includes('prohibited')) {
    return 'BLACKLIST-POLICY-2024';
  }
  if (lowerReason.includes('price') || lowerReason.includes('cost')) {
    return 'PRICING-POLICY-2024';
  }
  
  return 'STANDARD-PROC-2024';
}