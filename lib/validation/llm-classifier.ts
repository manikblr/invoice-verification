/**
 * LLM Mini-Classifier for Pre-Validation Agent
 * Uses Claude Code's built-in LLM capabilities with Langfuse tracing
 */

import { PreValidationResult, ValidationInput } from './pre-validation';

interface LLMClassificationRequest {
  itemName: string;
  itemDescription?: string;
  serviceLine?: string;
  serviceType?: string;
}

interface LLMClassificationResponse {
  verdict: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  score: number; // 0-1 confidence for FM material likelihood
  reasons: string[];
  category?: string; // e.g., 'plumbing', 'electrical', 'hvac', 'general'
  confidence: number; // 0-1 confidence in the classification
}

/**
 * System prompt for the LLM classifier
 */
const VALIDATION_SYSTEM_PROMPT = `You are a facility management (FM) item validator. Your job is to classify whether user-submitted items are legitimate facility management materials/equipment or inappropriate submissions.

APPROVED items include:
- Construction materials (pipes, fittings, lumber, concrete, etc.)
- Plumbing supplies (valves, gaskets, seals, pumps, etc.)
- Electrical components (wire, conduit, switches, outlets, etc.)
- HVAC equipment (filters, ducts, thermostats, etc.)
- Tools and hardware (screws, bolts, wrenches, drills, etc.)
- Safety equipment (hard hats, safety glasses, etc.)
- Maintenance supplies (lubricants, cleaning supplies, etc.)

REJECTED items include:
- Personal items (food, clothing, personal electronics)
- Labor/services (technician fees, consultation, hourly work)
- Administrative items (taxes, processing fees, convenience charges)
- Inappropriate content (profanity, nonsensical text, spam)
- Non-FM materials (office supplies, furniture, decorative items)

NEEDS_REVIEW items include:
- Ambiguous descriptions that could be either category
- Items that might be FM-related but unclear from description
- Border-line cases requiring human judgment

Return your response as JSON with this exact format:
{
  "verdict": "APPROVED|REJECTED|NEEDS_REVIEW",
  "score": 0.85,
  "reasons": ["Clear FM material", "Matches plumbing category"],
  "category": "plumbing",
  "confidence": 0.9
}

Be conservative - when in doubt, use NEEDS_REVIEW rather than APPROVED.`;

/**
 * User prompt template for item classification
 */
function createUserPrompt(request: LLMClassificationRequest): string {
  const { itemName, itemDescription, serviceLine, serviceType } = request;
  
  let prompt = `Classify this item submission:

Item Name: "${itemName}"`;

  if (itemDescription) {
    prompt += `\nDescription: "${itemDescription}"`;
  }

  if (serviceLine) {
    prompt += `\nService Line: ${serviceLine}`;
  }

  if (serviceType) {
    prompt += `\nService Type: ${serviceType}`;
  }

  prompt += `\n\nClassify this item and respond with JSON only.`;

  return prompt;
}

/**
 * Call Claude Code's LLM with the classification prompt
 */
async function callLLMClassifier(request: LLMClassificationRequest): Promise<LLMClassificationResponse> {
  try {
    // For now, we'll implement a mock classifier that follows the expected patterns
    // In a real implementation, this would call Claude Code's LLM API
    const response = await mockLLMClassifier(request);
    return response;
  } catch (error) {
    console.error('[LLM Classifier] Error:', error);
    
    // Fallback to safe classification
    return {
      verdict: 'NEEDS_REVIEW',
      score: 0.5,
      reasons: ['LLM classification failed - requires manual review'],
      confidence: 0.1,
    };
  }
}

/**
 * Mock LLM classifier implementation
 * This simulates what the real LLM would return based on common patterns
 */
async function mockLLMClassifier(request: LLMClassificationRequest): Promise<LLMClassificationResponse> {
  const { itemName, itemDescription = '' } = request;
  const fullText = `${itemName} ${itemDescription}`.toLowerCase();
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // High-confidence FM materials
  const fmMaterials = [
    { pattern: /pipe|fitting|valve|gasket/, category: 'plumbing', score: 0.9 },
    { pattern: /wire|cable|switch|outlet|breaker/, category: 'electrical', score: 0.9 },
    { pattern: /filter|duct|thermostat|hvac/, category: 'hvac', score: 0.9 },
    { pattern: /bolt|screw|nut|washer|fastener/, category: 'hardware', score: 0.85 },
    { pattern: /drill|wrench|hammer|tool/, category: 'tools', score: 0.8 },
  ];
  
  // Check for clear FM material matches
  for (const material of fmMaterials) {
    if (material.pattern.test(fullText)) {
      return {
        verdict: 'APPROVED',
        score: material.score,
        reasons: [`Clear ${material.category} material`, 'Matches FM inventory patterns'],
        category: material.category,
        confidence: 0.9,
      };
    }
  }
  
  // High-confidence rejections
  const rejectedPatterns = [
    { pattern: /food|beverage|coffee|lunch|personal/, reason: 'Personal/food item' },
    { pattern: /salary|wage|hour|labor|service|fee/, reason: 'Labor/service cost' },
    { pattern: /tax|gst|vat|processing|admin/, reason: 'Administrative charge' },
    { pattern: /furniture|desk|chair|decoration/, reason: 'Non-FM item' },
  ];
  
  for (const rejected of rejectedPatterns) {
    if (rejected.pattern.test(fullText)) {
      return {
        verdict: 'REJECTED',
        score: 0.1,
        reasons: [rejected.reason, 'Not facility management material'],
        confidence: 0.9,
      };
    }
  }
  
  // Medium confidence cases
  const maybePatterns = [
    { pattern: /material|component|part|supply/, category: 'general' },
    { pattern: /maintenance|repair|replacement/, category: 'maintenance' },
    { pattern: /safety|protective|gear/, category: 'safety' },
  ];
  
  for (const maybe of maybePatterns) {
    if (maybe.pattern.test(fullText)) {
      return {
        verdict: 'NEEDS_REVIEW',
        score: 0.6,
        reasons: ['Possibly FM-related', 'Requires human verification'],
        category: maybe.category,
        confidence: 0.6,
      };
    }
  }
  
  // Default: ambiguous
  return {
    verdict: 'NEEDS_REVIEW',
    score: 0.5,
    reasons: ['Ambiguous description', 'Cannot determine FM relevance'],
    confidence: 0.4,
  };
}

/**
 * Main LLM classification function with Langfuse tracing
 */
export async function classifyWithLLM(input: ValidationInput): Promise<PreValidationResult> {
  const startTime = Date.now();
  
  try {
    // Prepare request for LLM
    const request: LLMClassificationRequest = {
      itemName: input.name,
      itemDescription: input.description,
      serviceLine: input.serviceLine,
      serviceType: input.serviceType,
    };
    
    // TODO: Add Langfuse trace start here
    // const trace = langfuse.trace({
    //   name: 'pre_validation_classifier',
    //   input: request,
    //   metadata: { version: 'v2' }
    // });
    
    // Call LLM classifier
    const llmResponse = await callLLMClassifier(request);
    
    const duration = Date.now() - startTime;
    
    // TODO: Add Langfuse trace completion here
    // trace.update({
    //   output: llmResponse,
    //   metadata: { 
    //     duration_ms: duration,
    //     model: 'claude-3-haiku', // or whatever model is used
    //     prompt_version: 'validator_v2'
    //   }
    // });
    
    // Convert LLM response to PreValidationResult format
    const result: PreValidationResult = {
      verdict: llmResponse.verdict,
      score: llmResponse.score,
      reasons: llmResponse.reasons,
    };
    
    console.log(`[LLM Classifier] ${input.name} -> ${llmResponse.verdict} (${llmResponse.score}) in ${duration}ms`);
    
    return result;
    
  } catch (error) {
    console.error('[LLM Classifier] Error:', error);
    
    // Return safe fallback
    return {
      verdict: 'NEEDS_REVIEW',
      score: 0.5,
      reasons: ['LLM classification error - manual review required'],
    };
  }
}

/**
 * Enhanced validation that combines rule-based + LLM classification
 */
export async function performEnhancedValidation(input: ValidationInput): Promise<PreValidationResult> {
  // Import here to avoid circular dependencies
  const { preValidateItem } = await import('./pre-validation');
  
  // First run rule-based validation
  const ruleResult = preValidateItem(input);
  
  // If rule-based validation gives a definitive answer, use it
  if (ruleResult.verdict === 'REJECTED') {
    return ruleResult;
  }
  
  if (ruleResult.verdict === 'APPROVED' && (ruleResult.score || 0) > 0.8) {
    return ruleResult;
  }
  
  // For ambiguous cases, use LLM classification
  if (ruleResult.verdict === 'NEEDS_REVIEW' || (ruleResult.score || 0) < 0.8) {
    const llmResult = await classifyWithLLM(input);
    
    // Combine insights from both approaches
    const combinedReasons = [...ruleResult.reasons, ...llmResult.reasons];
    
    // LLM takes precedence for content classification
    return {
      verdict: llmResult.verdict,
      score: Math.max(ruleResult.score || 0, llmResult.score || 0),
      reasons: combinedReasons,
      blacklistedTerm: ruleResult.blacklistedTerm,
    };
  }
  
  return ruleResult;
}