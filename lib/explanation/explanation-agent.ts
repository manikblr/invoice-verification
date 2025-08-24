/**
 * Explanation Verification Agent
 * Evaluates user explanations and determines acceptance/rejection
 * Phase 5: Rule Agent + Explanation Loop
 */

import { createClient } from '@supabase/supabase-js';
import { enhancedRuleAgent, RuleContext } from '../rule-engine/rule-agent';

// TODO: Replace with actual tracing and LLM when available
async function trace(name: string, data: any, traceId?: string): Promise<string> {
  console.log(`[Trace ${name}]`, data);
  return traceId || `trace_${Date.now()}`;
}

// Mock LLM call for explanation evaluation
async function callLLMForExplanation(prompt: string): Promise<{
  isAccepted: boolean;
  confidence: number;
  reasoning: string;
  clarityScore?: number;
}> {
  // Mock implementation - in real system would call OpenRouter/LLM
  console.log(`[Mock LLM] Evaluating explanation with prompt length: ${prompt.length}`);
  
  // Simple heuristic-based evaluation for demo
  const explanation = prompt.toLowerCase();
  
  // Positive indicators
  const positiveKeywords = ['project', 'required', 'necessary', 'standard', 'specification', 
                           'safety', 'compliance', 'regulation', 'upgrade', 'replacement'];
  const positiveCount = positiveKeywords.filter(word => explanation.includes(word)).length;
  
  // Negative indicators
  const negativeKeywords = ['personal', 'gift', 'entertainment', 'luxury', 'unnecessary'];
  const negativeCount = negativeKeywords.filter(word => explanation.includes(word)).length;
  
  // Length and detail heuristics
  const hasDetails = explanation.length > 50;
  const hasSpecificContext = explanation.includes('because') || explanation.includes('for') || explanation.includes('to');
  
  const score = positiveCount * 0.3 + (hasDetails ? 0.2 : 0) + (hasSpecificContext ? 0.2 : 0) - negativeCount * 0.4;
  const isAccepted = score > 0.3 && negativeCount === 0;
  
  return {
    isAccepted,
    confidence: Math.min(0.9, Math.max(0.1, score)),
    reasoning: isAccepted 
      ? `Explanation provides sufficient context and justification (score: ${score.toFixed(2)})`
      : `Explanation lacks sufficient justification or contains concerning elements (score: ${score.toFixed(2)})`,
    clarityScore: Math.min(1.0, (hasDetails ? 0.4 : 0.1) + (hasSpecificContext ? 0.4 : 0.1) + (positiveCount * 0.1)),
  };
}

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface ExplanationVerificationRequest {
  explanationId: string;
  lineItemId: string;
}

export interface ExplanationVerificationResult {
  explanationId: string;
  lineItemId: string;
  isAccepted: boolean;
  confidence: number;
  reasoning: string;
  clarityScore?: number;
  domainEventTriggered: boolean;
}

export class ExplanationAgent {
  /**
   * Verify and evaluate a user explanation
   */
  async verifyExplanation(request: ExplanationVerificationRequest): Promise<ExplanationVerificationResult> {
    const startTime = Date.now();
    const { explanationId, lineItemId } = request;

    const traceId = await trace('explanation_agent_v1', {
      explanation_id: explanationId,
      line_item_id: lineItemId,
    });

    try {
      console.log(`[Explanation Agent] Verifying explanation ${explanationId} for line item ${lineItemId}`);

      if (!supabase) {
        throw new Error('Database not configured');
      }

      // Get explanation details
      const { data: explanation, error: explanationError } = await supabase
        .from('line_item_explanations')
        .select('*')
        .eq('id', explanationId)
        .single();

      if (explanationError || !explanation) {
        throw new Error(`Explanation ${explanationId} not found`);
      }

      // Get line item details for context
      const { data: lineItem, error: lineItemError } = await supabase
        .from('invoice_line_items')
        .select('id, raw_name, unit_price, quantity, canonical_item_id')
        .eq('id', lineItemId)
        .single();

      if (lineItemError || !lineItem) {
        throw new Error(`Line item ${lineItemId} not found`);
      }

      // Build evaluation context
      const context = await this.buildEvaluationContext(lineItem, explanation);

      // Evaluate explanation using LLM
      const llmResult = await this.evaluateExplanationWithLLM(context);

      // Update explanation record
      const updateResult = await this.updateExplanationStatus(
        explanationId,
        llmResult.isAccepted,
        llmResult.reasoning,
        llmResult.clarityScore
      );

      // Trigger appropriate domain event
      let domainEventTriggered = false;
      try {
        domainEventTriggered = await this.triggerDomainEvent(lineItemId, llmResult.isAccepted, llmResult.reasoning);
      } catch (eventError) {
        console.error(`[Explanation Agent] Failed to trigger domain event:`, eventError);
      }

      const result: ExplanationVerificationResult = {
        explanationId,
        lineItemId,
        isAccepted: llmResult.isAccepted,
        confidence: llmResult.confidence,
        reasoning: llmResult.reasoning,
        clarityScore: llmResult.clarityScore,
        domainEventTriggered,
      };

      await trace('explanation_agent_v1', {
        is_accepted: result.isAccepted,
        confidence: result.confidence,
        clarity_score: result.clarityScore,
        domain_event_triggered: domainEventTriggered,
        duration_ms: Date.now() - startTime,
      }, traceId);

      console.log(`[Explanation Agent] Verification completed for ${explanationId}: ${llmResult.isAccepted ? 'ACCEPTED' : 'REJECTED'} (confidence: ${llmResult.confidence})`);

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Explanation Agent] Verification failed for ${explanationId}:`, error);

      await trace('explanation_agent_v1', {
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      }, traceId);

      throw error;
    }
  }

  /**
   * Build evaluation context for the explanation
   */
  private async buildEvaluationContext(lineItem: any, explanation: any): Promise<string> {
    const context = `
EXPLANATION EVALUATION REQUEST

Line Item Details:
- Item: "${lineItem.raw_name}"
- Price: $${lineItem.unit_price}
- Quantity: ${lineItem.quantity}
- Canonical Item: ${lineItem.canonical_item_id || 'None'}

User Explanation:
"${explanation.explanation_text}"

Submitted by: ${explanation.submitted_by}
Submission time: ${explanation.submitted_at}

EVALUATION CRITERIA:
1. Does the explanation provide reasonable business justification?
2. Is the item clearly related to legitimate business needs?
3. Are there any red flags or concerning elements?
4. Is the explanation clear and detailed enough?

Please evaluate whether this explanation should be ACCEPTED or REJECTED.
Consider the context, reasonableness, and business appropriateness of the request.
`.trim();

    return context;
  }

  /**
   * Evaluate explanation using LLM with judge prompts
   */
  private async evaluateExplanationWithLLM(context: string): Promise<{
    isAccepted: boolean;
    confidence: number;
    reasoning: string;
    clarityScore?: number;
  }> {
    try {
      // Import judge prompts
      const { 
        selectJudgePrompt, 
        buildUserMessage, 
        validateJudgeResponse 
      } = await import('./judge-prompts');

      // Parse context to extract evaluation parameters
      const itemMatch = context.match(/Item: "([^"]+)"/);
      const priceMatch = context.match(/Price: \$([0-9.]+)/);
      const quantityMatch = context.match(/Quantity: ([0-9]+)/);
      const explanationMatch = context.match(/User Explanation:\s*"([^"]+)"/);
      
      const itemName = itemMatch?.[1] || 'Unknown Item';
      const unitPrice = parseFloat(priceMatch?.[1] || '0');
      const quantity = parseInt(quantityMatch?.[1] || '1');
      const explanationText = explanationMatch?.[1] || 'No explanation provided';
      const totalCost = unitPrice * quantity;

      // Select appropriate judge prompt
      const judgePrompt = selectJudgePrompt({
        isRevision: false,
        isHighValue: totalCost > 5000,
        totalCost,
        valueThreshold: 5000,
      });

      // Build structured evaluation message
      const userMessage = buildUserMessage(judgePrompt, {
        itemName,
        quantity,
        unitPrice: unitPrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
        explanationText,
        submittedBy: 'User',
        submissionDate: new Date().toISOString(),
        canonicalItemId: 'N/A',
        evaluationContext: 'Standard business procurement review',
      });

      // In production, this would call the actual LLM with the structured prompts
      const judgeResponse = await this.callJudgeWithPrompt(judgePrompt.systemMessage, userMessage);
      
      // Validate response format
      const validation = validateJudgeResponse(judgeResponse, judgePrompt);
      if (!validation.isValid) {
        console.warn(`[Explanation Agent] Invalid judge response:`, validation.errors);
        // Fallback to simple evaluation
        return await callLLMForExplanation(context);
      }

      // Convert judge response to our format
      const isAccepted = judgeResponse.decision === 'ACCEPT';
      const confidence = judgeResponse.confidence || 0.5;
      const clarityScore = judgeResponse.totalScore ? judgeResponse.totalScore / 100 : undefined;

      console.log(`[Explanation Agent] Judge evaluation result: ${judgeResponse.decision} (score: ${judgeResponse.totalScore}/100)`);
      
      return {
        isAccepted,
        confidence,
        reasoning: judgeResponse.reasoning || 'Judge evaluation completed',
        clarityScore,
      };

    } catch (error) {
      console.error('[Explanation Agent] Judge evaluation failed:', error);
      
      // Fallback to simple heuristic evaluation
      return await callLLMForExplanation(context);
    }
  }

  /**
   * Call judge with structured prompts (mock implementation)
   */
  private async callJudgeWithPrompt(systemMessage: string, userMessage: string): Promise<any> {
    // Mock judge implementation with improved scoring
    console.log(`[Mock Judge] Evaluating with system message length: ${systemMessage.length}, user message length: ${userMessage.length}`);
    
    const explanation = userMessage.toLowerCase();
    
    // Scoring based on judge criteria
    let clarityScore = 0;
    let businessJustificationScore = 0;
    let specificityScore = 0;
    let appropriatenessScore = 0;

    // Clarity scoring (0-25)
    if (explanation.length > 50) clarityScore += 10;
    if (explanation.includes('because') || explanation.includes('for')) clarityScore += 8;
    if (explanation.includes('project') || explanation.includes('business')) clarityScore += 7;

    // Business justification (0-35)
    const businessKeywords = ['required', 'necessary', 'project', 'specification', 'compliance', 'safety', 'upgrade', 'replacement', 'standard'];
    businessJustificationScore = Math.min(35, businessKeywords.filter(word => explanation.includes(word)).length * 5);

    // Specificity (0-20)
    if (explanation.includes('quantity') || /\d+/.test(explanation)) specificityScore += 8;
    if (explanation.includes('location') || explanation.includes('site')) specificityScore += 6;
    if (explanation.includes('timeline') || explanation.includes('deadline')) specificityScore += 6;

    // Appropriateness (0-20)
    const negativeKeywords = ['personal', 'gift', 'entertainment', 'luxury'];
    const positiveKeywords = ['equipment', 'material', 'supply', 'tool'];
    
    appropriatenessScore = 15; // Start with base score
    appropriatenessScore -= negativeKeywords.filter(word => explanation.includes(word)).length * 10;
    appropriatenessScore += positiveKeywords.filter(word => explanation.includes(word)).length * 2;
    appropriatenessScore = Math.max(0, Math.min(20, appropriatenessScore));

    const totalScore = clarityScore + businessJustificationScore + specificityScore + appropriatenessScore;
    
    let decision = 'REJECT';
    if (totalScore >= 80) decision = 'ACCEPT';
    else if (totalScore >= 60) decision = 'ACCEPT';
    else if (totalScore >= 40) decision = 'NEEDS_REVISION';

    // For high-value items, apply stricter threshold
    if (explanation.includes('high value') && totalScore < 75) {
      decision = 'REJECT';
    }

    return {
      decision,
      totalScore,
      scores: {
        clarity: clarityScore,
        businessJustification: businessJustificationScore,
        specificity: specificityScore,
        appropriateness: appropriatenessScore,
      },
      reasoning: `Explanation scored ${totalScore}/100. ${decision === 'ACCEPT' ? 'Provides adequate business justification.' : decision === 'NEEDS_REVISION' ? 'Needs more specific business context.' : 'Insufficient or inappropriate justification.'}`,
      strengths: totalScore > 60 ? ['Clear business context provided'] : [],
      weaknesses: totalScore < 60 ? ['Needs more specific business justification'] : [],
      confidence: Math.min(0.9, totalScore / 100),
    };
  }

  /**
   * Update explanation status in database
   */
  private async updateExplanationStatus(
    explanationId: string,
    accepted: boolean,
    reasoning: string,
    clarityScore?: number
  ): Promise<boolean> {
    
    if (!supabase) {
      return false;
    }

    try {
      const updateData: any = {
        verification_status: accepted ? 'accepted' : 'rejected',
        accepted,
        rejected_reason: accepted ? null : reasoning,
        clarity_score: clarityScore,
        verification_agent_run_id: `explanation_agent_${Date.now()}`,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('line_item_explanations')
        .update(updateData)
        .eq('id', explanationId);

      if (error) {
        console.error('[Explanation Agent] Failed to update explanation status:', error);
        return false;
      }

      return true;

    } catch (error) {
      console.error('[Explanation Agent] Database update error:', error);
      return false;
    }
  }

  /**
   * Trigger appropriate domain event based on verification result
   */
  private async triggerDomainEvent(lineItemId: string, accepted: boolean, reasoning: string): Promise<boolean> {
    try {
      const { processDomainEvent } = await import('../orchestration/orchestrator');
      
      if (accepted) {
        // Explanation accepted - item can proceed
        return await processDomainEvent({
          type: 'READY_FOR_SUBMISSION',
          lineItemId,
        });
      } else {
        // Explanation rejected - deny item
        return await processDomainEvent({
          type: 'DENIED',
          lineItemId,
          reason: `Explanation rejected: ${reasoning}`,
        });
      }

    } catch (error) {
      console.error('[Explanation Agent] Domain event trigger failed:', error);
      return false;
    }
  }

  /**
   * Get explanation verification statistics
   */
  async getVerificationStats(): Promise<Record<string, any>> {
    if (!supabase) {
      return { error: 'Database not configured' };
    }

    try {
      const { data, error } = await supabase
        .from('line_item_explanations')
        .select('verification_status, accepted, clarity_score')
        .not('verification_status', 'eq', 'pending');

      if (error) {
        throw error;
      }

      const stats = {
        total_verified: data?.length || 0,
        accepted: data?.filter(e => e.accepted === true).length || 0,
        rejected: data?.filter(e => e.accepted === false).length || 0,
        avg_clarity_score: 0,
      };

      const clarityScores = data?.filter(e => e.clarity_score !== null).map(e => e.clarity_score) || [];
      if (clarityScores.length > 0) {
        stats.avg_clarity_score = clarityScores.reduce((sum, score) => sum + score, 0) / clarityScores.length;
      }

      return {
        ...stats,
        acceptance_rate: stats.total_verified > 0 ? stats.accepted / stats.total_verified : 0,
        agent_version: '1.0.0',
        evaluation_method: 'llm_with_heuristic_fallback',
      };

    } catch (error) {
      console.error('[Explanation Agent] Failed to get stats:', error);
      return { error: 'Failed to retrieve statistics' };
    }
  }

  /**
   * Batch verify multiple explanations
   */
  async verifyMultipleExplanations(requests: ExplanationVerificationRequest[]): Promise<ExplanationVerificationResult[]> {
    console.log(`[Explanation Agent] Starting batch verification for ${requests.length} explanations`);

    const results: ExplanationVerificationResult[] = [];

    // Process in small batches to avoid overwhelming the system
    const batchSize = 3;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(request => this.verifyExplanation(request))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('[Explanation Agent] Batch verification error:', result.reason);
          // Add error result
          results.push({
            explanationId: 'unknown',
            lineItemId: 'unknown',
            isAccepted: false,
            confidence: 0,
            reasoning: 'Batch processing error',
            domainEventTriggered: false,
          });
        }
      }

      // Small delay between batches
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[Explanation Agent] Batch verification completed: ${results.filter(r => r.isAccepted).length}/${results.length} accepted`);

    return results;
  }
}

// Singleton instance
export const explanationAgent = new ExplanationAgent();