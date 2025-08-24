/**
 * Rule Engine Service
 * Integrates rule agent with orchestration and domain events
 * Phase 5: Rule Agent + Explanation Loop
 */

import { enhancedRuleAgent, RuleContext, RuleDecision, RuleResult } from './rule-agent';
import { processDomainEvent } from '../orchestration/orchestrator';
import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface RuleEvaluationRequest {
  lineItemId: string;
  itemName: string;
  itemDescription?: string;
  canonicalItemId?: string;
  unitPrice: number;
  quantity: number;
  matchConfidence?: number;
  priceIsValid?: boolean;
  vendorId?: string;
  projectContext?: string;
  invoiceMetadata?: Record<string, any>;
}

export interface RuleEvaluationResult {
  lineItemId: string;
  decision: RuleDecision;
  reasons: string[];
  policyCodes: string[];
  confidence: number;
  ruleResult: RuleResult;
  domainEventTriggered: boolean;
}

/**
 * Evaluate rules for a line item and trigger appropriate domain events
 */
export async function evaluateRulesForLineItem(
  request: RuleEvaluationRequest
): Promise<RuleEvaluationResult> {
  const { lineItemId, itemName } = request;

  console.log(`[Rule Service] Evaluating rules for line item ${lineItemId}: "${itemName}"`);

  try {
    // Build rule context
    const ruleContext: RuleContext = {
      lineItemId: request.lineItemId,
      itemName: request.itemName,
      itemDescription: request.itemDescription,
      canonicalItemId: request.canonicalItemId,
      unitPrice: request.unitPrice,
      quantity: request.quantity,
      matchConfidence: request.matchConfidence,
      priceIsValid: request.priceIsValid,
      vendorId: request.vendorId,
      projectContext: request.projectContext,
      invoiceMetadata: request.invoiceMetadata,
    };

    // Apply rules using the enhanced rule agent
    const ruleResult = await enhancedRuleAgent.applyRules(ruleContext);

    // Trigger appropriate domain event based on decision
    let domainEventTriggered = false;
    try {
      domainEventTriggered = await triggerRuleDecisionEvent(lineItemId, ruleResult);
    } catch (eventError) {
      console.error(`[Rule Service] Failed to trigger domain event for ${lineItemId}:`, eventError);
    }

    const result: RuleEvaluationResult = {
      lineItemId,
      decision: ruleResult.decision,
      reasons: ruleResult.reasons,
      policyCodes: ruleResult.policyCodes,
      confidence: ruleResult.confidence,
      ruleResult,
      domainEventTriggered,
    };

    console.log(`[Rule Service] Rule evaluation completed for ${lineItemId}: ${ruleResult.decision} (${ruleResult.policyCodes.length} rules applied)`);

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Rule Service] Rule evaluation failed for ${lineItemId}:`, error);

    // Return safe default
    return {
      lineItemId,
      decision: RuleDecision.NEEDS_EXPLANATION,
      reasons: ['Rule evaluation error - manual review required'],
      policyCodes: ['RULE_ENGINE_ERROR'],
      confidence: 0.1,
      ruleResult: {
        decision: RuleDecision.NEEDS_EXPLANATION,
        reasons: ['Rule evaluation error'],
        policyCodes: ['RULE_ENGINE_ERROR'],
        facts: { error: errorMsg },
        confidence: 0.1,
        needsExplanation: true,
      },
      domainEventTriggered: false,
    };
  }
}

/**
 * Trigger domain event based on rule decision
 */
async function triggerRuleDecisionEvent(lineItemId: string, ruleResult: RuleResult): Promise<boolean> {
  try {
    switch (ruleResult.decision) {
      case RuleDecision.ALLOW:
        // Rules passed - item can proceed to next stage
        return await processDomainEvent({
          type: 'READY_FOR_SUBMISSION',
          lineItemId,
        });

      case RuleDecision.DENY:
        // Rules failed - deny the item
        const denyReason = ruleResult.reasons.join('; ') || 'Business rules violation';
        return await processDomainEvent({
          type: 'DENIED',
          lineItemId,
          reason: denyReason,
        });

      case RuleDecision.NEEDS_EXPLANATION:
        // Needs explanation - user input required
        const explanationReason = ruleResult.reasons.join('; ') || 'Additional context required';
        return await processDomainEvent({
          type: 'NEEDS_EXPLANATION',
          lineItemId,
          reason: explanationReason,
        });

      default:
        console.warn(`[Rule Service] Unknown rule decision: ${ruleResult.decision}`);
        return false;
    }

  } catch (error) {
    console.error('[Rule Service] Domain event trigger failed:', error);
    return false;
  }
}

/**
 * Batch evaluate rules for multiple line items
 */
export async function evaluateRulesForMultipleLineItems(
  requests: RuleEvaluationRequest[]
): Promise<RuleEvaluationResult[]> {
  
  console.log(`[Rule Service] Starting batch rule evaluation for ${requests.length} line items`);

  const results: RuleEvaluationResult[] = [];

  // Process in small batches to avoid overwhelming the system
  const batchSize = 5;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(request => evaluateRulesForLineItem(request))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('[Rule Service] Batch evaluation error:', result.reason);
        // Add error result
        const errorResult: RuleEvaluationResult = {
          lineItemId: 'unknown',
          decision: RuleDecision.NEEDS_EXPLANATION,
          reasons: ['Batch processing error'],
          policyCodes: ['BATCH_ERROR'],
          confidence: 0,
          ruleResult: {
            decision: RuleDecision.NEEDS_EXPLANATION,
            reasons: ['Batch processing error'],
            policyCodes: ['BATCH_ERROR'],
            facts: {},
            confidence: 0,
            needsExplanation: true,
          },
          domainEventTriggered: false,
        };
        results.push(errorResult);
      }
    }

    // Small delay between batches
    if (i + batchSize < requests.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const summary = {
    allow: results.filter(r => r.decision === RuleDecision.ALLOW).length,
    deny: results.filter(r => r.decision === RuleDecision.DENY).length,
    needsExplanation: results.filter(r => r.decision === RuleDecision.NEEDS_EXPLANATION).length,
  };

  console.log(`[Rule Service] Batch evaluation completed: ${summary.allow} allowed, ${summary.deny} denied, ${summary.needsExplanation} need explanation`);

  return results;
}

/**
 * Get line items that need rule evaluation (status = PRICE_VALIDATED)
 */
export async function getItemsNeedingRuleEvaluation(limit: number = 20): Promise<RuleEvaluationRequest[]> {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select(`
        id,
        raw_name,
        unit_price,
        quantity,
        canonical_item_id
      `)
      .eq('status', 'PRICE_VALIDATED')
      .is('orchestrator_lock', null) // Only unlocked items
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Rule Service] Query error:', error);
      return [];
    }

    return (data || []).map(item => ({
      lineItemId: item.id,
      itemName: item.raw_name,
      unitPrice: item.unit_price || 0,
      quantity: item.quantity || 1,
      canonicalItemId: item.canonical_item_id,
    }));

  } catch (error) {
    console.error('[Rule Service] Query error:', error);
    return [];
  }
}

/**
 * Auto-trigger rule evaluation for items that have been price validated but not rule evaluated
 */
export async function autoTriggerRuleEvaluation(): Promise<void> {
  try {
    console.log('[Rule Service] Starting auto rule evaluation scan');

    const itemsToEvaluate = await getItemsNeedingRuleEvaluation(50);
    
    if (itemsToEvaluate.length === 0) {
      console.log('[Rule Service] No items need rule evaluation');
      return;
    }

    console.log(`[Rule Service] Found ${itemsToEvaluate.length} items needing rule evaluation`);

    const results = await evaluateRulesForMultipleLineItems(itemsToEvaluate);
    
    const summary = {
      allow: results.filter(r => r.decision === RuleDecision.ALLOW).length,
      deny: results.filter(r => r.decision === RuleDecision.DENY).length,
      needsExplanation: results.filter(r => r.decision === RuleDecision.NEEDS_EXPLANATION).length,
    };

    console.log(`[Rule Service] Auto evaluation completed: ${summary.allow} allowed, ${summary.deny} denied, ${summary.needsExplanation} need explanation`);

  } catch (error) {
    console.error('[Rule Service] Auto evaluation error:', error);
  }
}