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
 * Call Langfuse LLM integration using validator_v2 prompt
 */
async function callLangfuseLLM(request: LLMClassificationRequest): Promise<LLMClassificationResponse | null> {
  try {
    // Call internal API endpoint that bridges to Python Langfuse integration
    const response = await fetch('/api/internal/llm-classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt_name: 'validator_v2',
        variables: {
          item_name: request.itemName,
          item_description: request.itemDescription || 'No description provided',
          service_line: request.serviceLine || 'Not specified',
          service_type: request.serviceType || 'Not specified',
          context: 'Pre-validation classification'
        },
        task_type: 'validation',
        trace_name: 'pre_validation_classifier_v2',
        metadata: {
          classifier_version: '2.0.0',
          integration: 'langfuse_typescript'
        }
      })
    });

    if (!response.ok) {
      console.warn(`[LLM Classifier] Langfuse API returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    
    // Parse LLM response (expecting JSON format from validator_v2 prompt)
    let parsedResponse;
    try {
      parsedResponse = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
    } catch (parseError) {
      console.warn('[LLM Classifier] Failed to parse Langfuse LLM response as JSON:', parseError);
      return null;
    }

    // Convert to our expected format
    return {
      verdict: parsedResponse.verdict || 'NEEDS_REVIEW',
      score: parsedResponse.score || 0.5,
      reasons: parsedResponse.reasons || ['Langfuse classification completed'],
      category: parsedResponse.category,
      confidence: parsedResponse.confidence || 0.5,
    };

  } catch (error) {
    console.warn('[LLM Classifier] Langfuse integration failed:', error);
    return null;
  }
}

/**
 * Call Langfuse-integrated LLM with the validator_v2 prompt
 */
async function callLLMClassifier(request: LLMClassificationRequest): Promise<LLMClassificationResponse> {
  try {
    // Try to use Langfuse integration first
    const langfuseResponse = await callLangfuseLLM(request);
    if (langfuseResponse) {
      return langfuseResponse;
    }
    
    // Fallback to mock classifier
    console.log('[LLM Classifier] Langfuse not available, using mock classifier');
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
    
    console.log(`[LLM Classifier v2] Classifying: ${input.name} (with Langfuse validator_v2 prompt)`);
    
    // Call LLM classifier (which now includes Langfuse integration)
    const llmResponse = await callLLMClassifier(request);
    
    const duration = Date.now() - startTime;
    
    // Convert LLM response to PreValidationResult format
    const result: PreValidationResult = {
      verdict: llmResponse.verdict,
      score: llmResponse.score,
      reasons: llmResponse.reasons,
    };
    
    console.log(`[LLM Classifier v2] ${input.name} -> ${llmResponse.verdict} (${llmResponse.score}) in ${duration}ms`);
    console.log(`[LLM Classifier v2] Category: ${llmResponse.category || 'N/A'}, Confidence: ${llmResponse.confidence || 0}`);
    console.log(`[LLM Classifier v2] Reasons: ${llmResponse.reasons.join(', ')}`);
    
    return result;
    
  } catch (error) {
    console.error('[LLM Classifier v2] Error:', error);
    
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