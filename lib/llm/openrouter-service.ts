/**
 * OpenRouter API service for accessing GPT-5 and other models
 */

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private config: OpenRouterConfig;
  private baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  async chatCompletion(
    messages: OpenRouterMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost:3000',
        'X-Title': 'Invoice Verification Pre-Validation'
      },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.maxTokens || 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Validates item relevance using GPT-5
   */
  async validateRelevance(
    itemName: string,
    itemDescription: string | undefined,
    serviceLine: string,
    serviceType: string,
    scopeOfWork?: string
  ): Promise<{
    isRelevant: boolean;
    confidence: number;
    reasoning: string;
    explanationPrompt?: string;
  }> {
    const systemPrompt = `You are an expert facilities management (FM) procurement analyst specializing in validating invoice line items for relevance to specific service contexts. Your enhanced role focuses on identifying items that may be valid FM materials but questionably relevant to the specific service context.

## ANALYSIS FRAMEWORK

**Service Context:**
- Service Line: ${serviceLine}
- Service Type: ${serviceType}
${scopeOfWork ? `- Scope of Work: ${scopeOfWork}` : ''}

## ENHANCED EVALUATION CRITERIA

**1. Primary Relevance Assessment (Core Decision)**
- Does this item DIRECTLY support the specified service line and type?
- Is it COMMONLY used in this specific type of FM work?
- Does it clearly align with the scope of work described?

**2. Contextual Relevance Levels**
🟢 **HIGH RELEVANCE (0.8-1.0):**
- Items specifically required for the service type (e.g., HVAC filters for HVAC maintenance)
- Tools commonly used in this exact service line
- Materials directly mentioned in or implied by scope of work
- Safety equipment standard for this type of work

🟡 **MEDIUM RELEVANCE (0.4-0.7):** 
- Valid FM items but unclear connection to specific service context
- Generic materials that could be used across multiple service types
- Items that might be needed but aren't obviously required
- Quality materials but questionable timing or necessity for this scope

🔴 **LOW RELEVANCE (0.0-0.3):**
- Items from completely different trades/disciplines
- Materials unrelated to the service context
- Personal items, food, beverages, non-FM items
- Labor costs, administrative fees, taxes

**3. Enhanced Context-Specific Analysis:**
- **HVAC Service:** Filters, ductwork, refrigerants, thermostats, gauges, coils
- **Plumbing Service:** Pipes, fittings, valves, seals, pumps, drains, water treatment
- **Electrical Service:** Wires, breakers, outlets, conduits, panels, meters, switches
- **Roofing Service:** Membranes, sealants, flashings, fasteners, adhesives
- **General Maintenance:** Broader scope but must relate to building systems upkeep

## ENHANCED CONFIDENCE SCORING & DECISION LOGIC
- **0.9-1.0:** Clearly essential for this service type → APPROVE
- **0.7-0.8:** Good match with service context → APPROVE  
- **0.4-0.6:** Valid FM item but unclear relevance → REQUEST EXPLANATION
- **0.2-0.3:** Probably not relevant → REJECT
- **0.0-0.1:** Clearly irrelevant → REJECT

## EXPLANATION PROMPTING
For items with 0.4-0.6 confidence, provide specific questions like:
"This appears to be a valid facilities management item, but its relevance to [SERVICE TYPE] work is unclear. Please explain how this item will be used in your [SCOPE OF WORK] project."

## RESPONSE FORMAT
Respond with valid JSON only:
{
  "isRelevant": boolean,
  "confidence": number,
  "reasoning": "Detailed explanation of relevance assessment with specific reference to service context",
  "explanationPrompt": "Specific question to ask user if confidence is 0.4-0.6 (optional)"
}`;

    const userPrompt = `**ITEM TO VALIDATE:**
- **Name:** "${itemName}"
${itemDescription ? `- **Description:** "${itemDescription}"` : '- **Description:** Not provided'}

**TASK:** Analyze this item's relevance to the specified service context. Consider:
1. Does this item directly support the service line and type specified?
2. Would this item typically be procured for this type of work?
3. Is there a logical connection between the item and the scope of work?

Provide your assessment as JSON only.`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const model = process.env.OPENROUTER_PREVALIDATION_MODEL || 'openai/gpt-4o-2024-11-20';
      // Use shorter timeout for faster failure on garbage input
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('LLM validation timeout - item likely invalid')), 2000)
      );
      
      const validationPromise = this.chatCompletion(messages, {
        temperature: 0.1,
        maxTokens: 150, // Reduced for faster response
        model
      });
      
      const response = await Promise.race([validationPromise, timeoutPromise]) as OpenRouterResponse;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenRouter');
      }

      // Parse JSON response
      const result = JSON.parse(content.trim());
      
      return {
        isRelevant: Boolean(result.isRelevant),
        confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
        reasoning: String(result.reasoning || 'No reasoning provided'),
        explanationPrompt: result.explanationPrompt || undefined
      };
    } catch (error) {
      console.error('OpenRouter validation error:', error);
      // Fallback to neutral assessment
      return {
        isRelevant: true, // Default to allowing items when LLM fails
        confidence: 0.5,
        reasoning: `LLM validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        explanationPrompt: undefined
      };
    }
  }
}

/**
 * Factory function to create OpenRouter service from environment
 */
export function createOpenRouterService(): OpenRouterService {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenRouterService({
    apiKey,
    model: process.env.OPENROUTER_PREVALIDATION_MODEL || 'openai/gpt-4o-2024-11-20'
  });
}