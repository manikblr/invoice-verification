/**
 * Price Validation Service
 * Orchestrates price validation and triggers domain events
 */

import { priceValidator, PriceValidationRequest, PriceValidationResult } from './price-validator';
import { processDomainEvent } from '../orchestration/orchestrator';
import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface PriceValidationServiceRequest {
  lineItemId: string;
  canonicalItemId?: string;
  unitPrice: number;
  currency?: string;
  itemName?: string;
}

export interface PriceValidationServiceResult {
  lineItemId: string;
  isValid: boolean;
  confidence: number;
  validationResult: PriceValidationResult;
  eventTriggered: boolean;
}

/**
 * Validate price for a line item and trigger appropriate domain events
 */
export async function validateLineItemPrice(
  request: PriceValidationServiceRequest
): Promise<PriceValidationServiceResult> {
  const { lineItemId, canonicalItemId, unitPrice, currency = 'USD', itemName } = request;

  console.log(`[Price Validation Service] Starting price validation for line item ${lineItemId}`);

  try {
    // Perform price validation using the validator
    const validationRequest: PriceValidationRequest = {
      lineItemId,
      canonicalItemId,
      unitPrice,
      currency,
      itemName,
    };

    const validationResult = await priceValidator.validatePrice(validationRequest);

    // Determine if price is acceptable based on validation method and confidence
    const isAcceptable = determineAcceptability(validationResult);

    // Log validation event to database
    await logPriceValidationEvent(lineItemId, validationResult, isAcceptable);

    // Trigger appropriate domain event
    let eventTriggered = false;
    try {
      eventTriggered = await processDomainEvent({
        type: 'PRICE_VALIDATED',
        lineItemId,
        validated: isAcceptable,
      });
    } catch (error) {
      console.error(`[Price Validation Service] Failed to trigger domain event:`, error);
    }

    console.log(`[Price Validation Service] Price validation completed for ${lineItemId}: ${isAcceptable ? 'PASSED' : 'FAILED'} (confidence: ${validationResult.confidence})`);

    return {
      lineItemId,
      isValid: isAcceptable,
      confidence: validationResult.confidence,
      validationResult,
      eventTriggered,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Price Validation Service] Validation failed for ${lineItemId}:`, error);

    // Log error event
    await logPriceValidationError(lineItemId, errorMsg);

    // Trigger failure event
    let eventTriggered = false;
    try {
      eventTriggered = await processDomainEvent({
        type: 'PRICE_VALIDATED',
        lineItemId,
        validated: false,
      });
    } catch (eventError) {
      console.error(`[Price Validation Service] Failed to trigger error event:`, eventError);
    }

    throw error;
  }
}

/**
 * Batch validate multiple line items
 */
export async function validateMultipleLineItemPrices(
  requests: PriceValidationServiceRequest[]
): Promise<PriceValidationServiceResult[]> {
  
  console.log(`[Price Validation Service] Starting batch validation for ${requests.length} line items`);

  const results: PriceValidationServiceResult[] = [];

  // Process in parallel with concurrency limit
  const concurrency = 5;
  const batches = [];
  for (let i = 0; i < requests.length; i += concurrency) {
    batches.push(requests.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(request => validateLineItemPrice(request))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('[Price Validation Service] Batch validation error:', result.reason);
        // Create error result for failed item
        const errorResult: PriceValidationServiceResult = {
          lineItemId: 'unknown',
          isValid: false,
          confidence: 0,
          validationResult: {
            isValid: false,
            validationMethod: 'no_reference',
            unitPrice: 0,
            confidence: 0,
            details: {},
          },
          eventTriggered: false,
        };
        results.push(errorResult);
      }
    }
  }

  console.log(`[Price Validation Service] Batch validation completed: ${results.filter(r => r.isValid).length}/${results.length} passed`);

  return results;
}

/**
 * Determine if a price validation result is acceptable
 */
function determineAcceptability(validationResult: PriceValidationResult): boolean {
  const { isValid, validationMethod, confidence, variancePercent } = validationResult;

  // For canonical range validation, use strict acceptance
  if (validationMethod === 'canonical_range') {
    return isValid;
  }

  // For external provisional validation, use confidence-based acceptance
  if (validationMethod === 'external_provisional') {
    // Accept if validation passed or if confidence is reasonable and variance is not extreme
    return isValid || (confidence >= 0.4 && (variancePercent || 0) <= 0.5);
  }

  // For no reference validation, accept with low confidence warning
  if (validationMethod === 'no_reference') {
    return true; // Accept but flag for review
  }

  return false;
}

/**
 * Log price validation event to database
 */
async function logPriceValidationEvent(
  lineItemId: string,
  validationResult: PriceValidationResult,
  isAcceptable: boolean
): Promise<void> {
  
  if (!supabase) {
    console.warn('[Price Validation Service] Database not configured, skipping event log');
    return;
  }

  try {
    const eventData = {
      agent_run_id: null, // Not associated with agent run
      line_item_id: lineItemId,
      event_type: 'PRICE_VALIDATION',
      event_data: {
        validation_method: validationResult.validationMethod,
        is_valid: validationResult.isValid,
        is_acceptable: isAcceptable,
        unit_price: validationResult.unitPrice,
        expected_range: validationResult.expectedRange,
        variance_percent: validationResult.variancePercent,
        confidence: validationResult.confidence,
        canonical_item_id: validationResult.canonicalItemId,
        proposal_id: validationResult.proposalId,
        external_sources_count: validationResult.details.externalPriceSources?.length,
        outlier_score: validationResult.details.outlierScore,
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('item_validation_events')
      .insert(eventData);

    if (error) {
      console.error('[Price Validation Service] Failed to log validation event:', error);
    } else {
      console.log(`[Price Validation Service] Logged validation event for ${lineItemId}`);
    }

  } catch (error) {
    console.error('[Price Validation Service] Error logging validation event:', error);
  }
}

/**
 * Log price validation error
 */
async function logPriceValidationError(lineItemId: string, errorMessage: string): Promise<void> {
  if (!supabase) {
    return;
  }

  try {
    const eventData = {
      agent_run_id: null,
      line_item_id: lineItemId,
      event_type: 'PRICE_VALIDATION_ERROR',
      event_data: {
        error_message: errorMessage,
        is_acceptable: false,
      },
      created_at: new Date().toISOString(),
    };

    await supabase
      .from('item_validation_events')
      .insert(eventData);

  } catch (error) {
    console.error('[Price Validation Service] Error logging validation error:', error);
  }
}

/**
 * Get price validation history for a line item
 */
export async function getPriceValidationHistory(lineItemId: string): Promise<any[]> {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('item_validation_events')
      .select('*')
      .eq('line_item_id', lineItemId)
      .in('event_type', ['PRICE_VALIDATION', 'PRICE_VALIDATION_ERROR'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Price Validation Service] Failed to get validation history:', error);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error('[Price Validation Service] Error getting validation history:', error);
    return [];
  }
}