/**
 * Orchestrator Service for Validation Pipeline
 * Manages status transitions and coordinates between stages
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Create client only if environment variables are available
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export type LineItemStatus = 
  | 'NEW'
  | 'VALIDATION_REJECTED'
  | 'AWAITING_MATCH'
  | 'AWAITING_INGEST'
  | 'MATCHED'
  | 'PRICE_VALIDATED'
  | 'NEEDS_EXPLANATION'
  | 'READY_FOR_SUBMISSION'
  | 'DENIED';

export interface StatusTransition {
  lineItemId: string;
  fromStatus: LineItemStatus;
  toStatus: LineItemStatus;
  reason: string;
  metadata?: Record<string, any>;
}

export interface LineItemDetails {
  id: string;
  status: LineItemStatus;
  rawName: string;
  canonicalItemId?: string;
  orchestratorLock?: string;
  createdAt: string;
}

/**
 * Domain events for the validation pipeline
 */
export type DomainEvent = 
  | { type: 'LINE_ITEM_ADDED'; lineItemId: string; itemName: string }
  | { type: 'VALIDATED'; lineItemId: string; verdict: string; score?: number }
  | { type: 'MATCH_MISS'; lineItemId: string; itemName: string }
  | { type: 'WEB_INGESTED'; lineItemId: string; sourcesCount: number }
  | { type: 'MATCHED'; lineItemId: string; canonicalItemId: string; confidence?: number }
  | { type: 'PRICE_VALIDATED'; lineItemId: string; validated: boolean }
  | { type: 'NEEDS_EXPLANATION'; lineItemId: string; reason: string }
  | { type: 'EXPLANATION_SUBMITTED'; lineItemId: string; explanationId: string }
  | { type: 'DENIED'; lineItemId: string; reason: string }
  | { type: 'READY_FOR_SUBMISSION'; lineItemId: string };

/**
 * Acquires an orchestrator lock for idempotent processing
 */
async function acquireOrchestratorLock(
  lineItemId: string, 
  operation: string
): Promise<string | null> {
  try {
    const lockToken = `${operation}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    
    const { data, error } = await supabase
      .from('invoice_line_items')
      .update({ orchestrator_lock: lockToken })
      .eq('id', lineItemId)
      .is('orchestrator_lock', null) // Only if no existing lock
      .select('id')
      .single();
    
    if (error || !data) {
      return null; // Lock acquisition failed
    }
    
    return lockToken;
  } catch (error) {
    console.error('[Orchestrator] Lock acquisition error:', error);
    return null;
  }
}

/**
 * Releases an orchestrator lock
 */
async function releaseOrchestratorLock(
  lineItemId: string,
  lockToken: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('invoice_line_items')
      .update({ orchestrator_lock: null })
      .eq('id', lineItemId)
      .eq('orchestrator_lock', lockToken);
    
    return !error;
  } catch (error) {
    console.error('[Orchestrator] Lock release error:', error);
    return false;
  }
}

/**
 * Performs a status transition with validation
 */
async function transitionStatus(
  transition: StatusTransition,
  lockToken: string
): Promise<boolean> {
  try {
    const { lineItemId, fromStatus, toStatus, reason } = transition;
    
    // Validate the transition is allowed
    if (!isValidTransition(fromStatus, toStatus)) {
      console.error(`[Orchestrator] Invalid transition: ${fromStatus} -> ${toStatus}`);
      return false;
    }
    
    // Update the status atomically
    const { data, error } = await supabase
      .from('invoice_line_items')
      .update({ status: toStatus })
      .eq('id', lineItemId)
      .eq('status', fromStatus) // Ensure status hasn't changed
      .eq('orchestrator_lock', lockToken) // Ensure we still hold the lock
      .select('id')
      .single();
    
    if (error || !data) {
      console.error(`[Orchestrator] Status transition failed:`, error);
      return false;
    }
    
    console.log(`[Orchestrator] ${lineItemId}: ${fromStatus} -> ${toStatus} (${reason})`);
    return true;
    
  } catch (error) {
    console.error('[Orchestrator] Transition error:', error);
    return false;
  }
}

/**
 * Validates if a status transition is allowed
 */
function isValidTransition(from: LineItemStatus, to: LineItemStatus): boolean {
  const allowedTransitions: Record<LineItemStatus, LineItemStatus[]> = {
    'NEW': ['VALIDATION_REJECTED', 'AWAITING_MATCH'],
    'VALIDATION_REJECTED': [], // Terminal state
    'AWAITING_MATCH': ['AWAITING_INGEST', 'MATCHED', 'DENIED'],
    'AWAITING_INGEST': ['AWAITING_MATCH', 'DENIED'], // Re-run matcher after ingestion
    'MATCHED': ['PRICE_VALIDATED', 'DENIED'],
    'PRICE_VALIDATED': ['NEEDS_EXPLANATION', 'READY_FOR_SUBMISSION', 'DENIED'],
    'NEEDS_EXPLANATION': ['READY_FOR_SUBMISSION', 'DENIED'],
    'READY_FOR_SUBMISSION': [], // Terminal state (success)
    'DENIED': [], // Terminal state (failure)
  };
  
  return allowedTransitions[from]?.includes(to) || false;
}

/**
 * Processes a domain event and performs appropriate status transitions
 */
export async function processDomainEvent(event: DomainEvent): Promise<boolean> {
  const { lineItemId } = event;
  
  // Check if Supabase is configured
  if (!supabase) {
    console.warn('[Orchestrator] Database not configured, cannot process domain events');
    return false;
  }
  
  // Acquire lock for this operation
  const lockToken = await acquireOrchestratorLock(lineItemId, event.type);
  if (!lockToken) {
    console.log(`[Orchestrator] Could not acquire lock for ${lineItemId} (${event.type})`);
    return false;
  }
  
  try {
    // Fetch current line item state
    const { data: lineItem, error } = await supabase
      .from('invoice_line_items')
      .select('id, status, raw_name, canonical_item_id')
      .eq('id', lineItemId)
      .single();
    
    if (error || !lineItem) {
      console.error(`[Orchestrator] Line item not found: ${lineItemId}`);
      return false;
    }
    
    const currentStatus = lineItem.status as LineItemStatus;
    let success = false;
    
    // Process event based on type
    switch (event.type) {
      case 'LINE_ITEM_ADDED':
        // New item should start validation
        if (currentStatus === 'NEW') {
          // Note: Actual validation is triggered externally
          console.log(`[Orchestrator] Item added, ready for validation: ${event.itemName}`);
          success = true;
        }
        break;
        
      case 'VALIDATED':
        if (currentStatus === 'NEW') {
          const targetStatus = event.verdict === 'APPROVED' ? 'AWAITING_MATCH' : 'VALIDATION_REJECTED';
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            reason: `Validation result: ${event.verdict}`,
            metadata: { score: event.score },
          }, lockToken);
        }
        break;
        
      case 'MATCH_MISS':
        if (currentStatus === 'AWAITING_MATCH') {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'AWAITING_INGEST',
            reason: 'No canonical match found - triggering web ingestion',
          }, lockToken);
        }
        break;
        
      case 'WEB_INGESTED':
        if (currentStatus === 'AWAITING_INGEST') {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'AWAITING_MATCH',
            reason: `Web ingestion completed - ${event.sourcesCount} sources found`,
          }, lockToken);
        }
        break;
        
      case 'MATCHED':
        if (currentStatus === 'AWAITING_MATCH') {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'MATCHED',
            reason: `Matched to canonical item: ${event.canonicalItemId}`,
            metadata: { confidence: event.confidence },
          }, lockToken);
          
          // Automatically trigger price validation after successful matching
          if (success && event.canonicalItemId) {
            try {
              const { triggerPriceValidationAfterMatch } = await import('../price-validation/price-trigger');
              await triggerPriceValidationAfterMatch({
                lineItemId,
                canonicalItemId: event.canonicalItemId,
              });
              console.log(`[Orchestrator] Price validation triggered for matched item ${lineItemId}`);
            } catch (error) {
              console.error(`[Orchestrator] Failed to trigger price validation for ${lineItemId}:`, error);
              // Don't fail the matching process if price validation trigger fails
            }
          }
        }
        break;
        
      case 'PRICE_VALIDATED':
        if (currentStatus === 'MATCHED') {
          const targetStatus = event.validated ? 'PRICE_VALIDATED' : 'DENIED';
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            reason: event.validated ? 'Price validation passed' : 'Price validation failed',
          }, lockToken);
          
          // Automatically trigger rule evaluation after successful price validation
          if (success && event.validated) {
            try {
              const { evaluateRulesForLineItem } = await import('../rule-engine/rule-service');
              
              // Get line item details for rule evaluation
              const { data: lineItem } = await supabase
                .from('invoice_line_items')
                .select('raw_name, unit_price, quantity, canonical_item_id')
                .eq('id', lineItemId)
                .single();
              
              if (lineItem) {
                await evaluateRulesForLineItem({
                  lineItemId,
                  itemName: lineItem.raw_name,
                  unitPrice: lineItem.unit_price || 0,
                  quantity: lineItem.quantity || 1,
                  canonicalItemId: lineItem.canonical_item_id,
                  priceIsValid: true,
                });
                console.log(`[Orchestrator] Rule evaluation triggered for price-validated item ${lineItemId}`);
              }
            } catch (error) {
              console.error(`[Orchestrator] Failed to trigger rule evaluation for ${lineItemId}:`, error);
              // Don't fail the price validation if rule evaluation fails
            }
          }
        }
        break;
        
      case 'NEEDS_EXPLANATION':
        if (currentStatus === 'PRICE_VALIDATED') {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'NEEDS_EXPLANATION',
            reason: event.reason,
          }, lockToken);
        }
        break;
        
      case 'EXPLANATION_SUBMITTED':
        if (currentStatus === 'NEEDS_EXPLANATION') {
          // Note: Transition to READY_FOR_SUBMISSION or DENIED happens after explanation evaluation
          console.log(`[Orchestrator] Explanation submitted for ${lineItemId}: ${event.explanationId}`);
          success = true;
          
          // Automatically trigger explanation verification
          try {
            const { explanationAgent } = await import('../explanation/explanation-agent');
            await explanationAgent.verifyExplanation({
              explanationId: event.explanationId,
              lineItemId,
            });
            console.log(`[Orchestrator] Explanation verification triggered for ${lineItemId}`);
          } catch (error) {
            console.error(`[Orchestrator] Failed to trigger explanation verification for ${lineItemId}:`, error);
            // Don't fail the domain event processing if verification fails
          }
        }
        break;
        
      case 'DENIED':
        // Can transition to DENIED from multiple states
        if (['AWAITING_MATCH', 'MATCHED', 'PRICE_VALIDATED', 'NEEDS_EXPLANATION'].includes(currentStatus)) {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'DENIED',
            reason: event.reason,
          }, lockToken);
        }
        break;
        
      case 'READY_FOR_SUBMISSION':
        if (['PRICE_VALIDATED', 'NEEDS_EXPLANATION'].includes(currentStatus)) {
          success = await transitionStatus({
            lineItemId,
            fromStatus: currentStatus,
            toStatus: 'READY_FOR_SUBMISSION',
            reason: 'All validation checks passed',
          }, lockToken);
        }
        break;
        
      default:
        console.warn(`[Orchestrator] Unknown event type: ${(event as any).type}`);
        success = false;
    }
    
    return success;
    
  } finally {
    // Always release the lock
    await releaseOrchestratorLock(lineItemId, lockToken);
  }
}

/**
 * Get the current status of a line item
 */
export async function getLineItemStatus(lineItemId: string): Promise<LineItemDetails | null> {
  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select('id, status, raw_name, canonical_item_id, orchestrator_lock, created_at')
      .eq('id', lineItemId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      id: data.id,
      status: data.status as LineItemStatus,
      rawName: data.raw_name,
      canonicalItemId: data.canonical_item_id,
      orchestratorLock: data.orchestrator_lock,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('[Orchestrator] Get status error:', error);
    return null;
  }
}

/**
 * Get line items by status for batch processing
 */
export async function getLineItemsByStatus(
  status: LineItemStatus,
  limit: number = 50
): Promise<LineItemDetails[]> {
  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select('id, status, raw_name, canonical_item_id, orchestrator_lock, created_at')
      .eq('status', status)
      .is('orchestrator_lock', null) // Only unlocked items
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      console.error('[Orchestrator] Get by status error:', error);
      return [];
    }
    
    return (data || []).map(item => ({
      id: item.id,
      status: item.status as LineItemStatus,
      rawName: item.raw_name,
      canonicalItemId: item.canonical_item_id,
      orchestratorLock: item.orchestrator_lock,
      createdAt: item.created_at,
    }));
  } catch (error) {
    console.error('[Orchestrator] Get by status error:', error);
    return [];
  }
}