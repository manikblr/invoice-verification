/**
 * Validation Service - Orchestrates pre-validation and persists results
 */

import { createClient } from '@supabase/supabase-js';
import { PreValidationResult, ValidationInput } from './pre-validation';
import { performEnhancedValidation } from './llm-classifier';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Create client only if environment variables are available
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface ValidationRequest {
  lineItemId: string;
  itemName: string;
  itemDescription?: string;
  serviceLine?: string;
  serviceType?: string;
  userId?: string;
}

export interface ValidationResponse {
  success: boolean;
  result: PreValidationResult;
  validationEventId?: string;
  error?: string;
}

/**
 * Persist validation result to item_validation_events table
 */
async function persistValidationEvent(
  lineItemId: string,
  result: PreValidationResult
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('item_validation_events')
      .insert({
        line_item_id: lineItemId,
        verdict: result.verdict,
        reasons: result.reasons,
        score: result.score,
        blacklisted_term: result.blacklistedTerm,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Validation Service] Database error:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('[Validation Service] Persist error:', error);
    return null;
  }
}

/**
 * Update line item status based on validation result
 */
async function updateLineItemStatus(
  lineItemId: string,
  verdict: PreValidationResult['verdict']
): Promise<boolean> {
  try {
    let newStatus: string;
    
    switch (verdict) {
      case 'APPROVED':
        newStatus = 'AWAITING_MATCH';
        break;
      case 'REJECTED':
        newStatus = 'VALIDATION_REJECTED';
        break;
      case 'NEEDS_REVIEW':
        newStatus = 'NEW'; // Keep in NEW status for manual review
        break;
      default:
        newStatus = 'NEW';
    }

    const { error } = await supabase
      .from('invoice_line_items')
      .update({
        status: newStatus,
        orchestrator_lock: null, // Clear any existing lock
      })
      .eq('id', lineItemId);

    if (error) {
      console.error('[Validation Service] Status update error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Validation Service] Status update error:', error);
    return false;
  }
}

/**
 * Check if line item has already been validated recently
 */
async function checkExistingValidation(lineItemId: string): Promise<PreValidationResult | null> {
  try {
    const { data, error } = await supabase
      .from('item_validation_events')
      .select('verdict, reasons, score, blacklisted_term, created_at')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    // Only return existing validation if it's recent (within last hour)
    const validationAge = Date.now() - new Date(data.created_at).getTime();
    const oneHour = 60 * 60 * 1000;

    if (validationAge < oneHour) {
      return {
        verdict: data.verdict as PreValidationResult['verdict'],
        reasons: data.reasons as string[],
        score: data.score,
        blacklistedTerm: data.blacklisted_term,
      };
    }

    return null;
  } catch (error) {
    console.error('[Validation Service] Check existing validation error:', error);
    return null;
  }
}

/**
 * Main validation service function
 */
export async function validateLineItem(request: ValidationRequest): Promise<ValidationResponse> {
  const startTime = Date.now();
  
  try {
    const { lineItemId, itemName, itemDescription, serviceLine, serviceType } = request;
    
    // Check if Supabase is configured
    if (!supabase) {
      console.warn('[Validation Service] Database not configured, returning mock validation');
      return {
        success: true,
        result: {
          verdict: 'APPROVED',
          score: 0.85,
          reasons: ['Mock validation - database not configured'],
        },
        validationEventId: 'mock-validation-' + Date.now(),
      };
    }
    
    // Check for existing recent validation
    const existingValidation = await checkExistingValidation(lineItemId);
    if (existingValidation) {
      console.log(`[Validation Service] Using cached validation for ${lineItemId}`);
      return {
        success: true,
        result: existingValidation,
      };
    }

    // Prepare validation input
    const validationInput: ValidationInput = {
      name: itemName,
      description: itemDescription,
      serviceLine,
      serviceType,
    };

    // Perform enhanced validation (rule-based + LLM)
    const validationResult = await performEnhancedValidation(validationInput);

    // Persist validation event
    const validationEventId = await persistValidationEvent(lineItemId, validationResult);

    // Update line item status
    const statusUpdated = await updateLineItemStatus(lineItemId, validationResult.verdict);

    const duration = Date.now() - startTime;
    
    console.log(
      `[Validation Service] ${itemName} -> ${validationResult.verdict} ` +
      `(score: ${validationResult.score}) in ${duration}ms`
    );

    // Log any issues but don't fail the validation
    if (!validationEventId) {
      console.warn(`[Validation Service] Failed to persist validation event for ${lineItemId}`);
    }
    
    if (!statusUpdated) {
      console.warn(`[Validation Service] Failed to update status for ${lineItemId}`);
    }

    return {
      success: true,
      result: validationResult,
      validationEventId: validationEventId || undefined,
    };

  } catch (error) {
    console.error('[Validation Service] Validation error:', error);
    
    // Return safe fallback
    const fallbackResult: PreValidationResult = {
      verdict: 'NEEDS_REVIEW',
      score: 0.0,
      reasons: ['Validation service error - manual review required'],
    };

    return {
      success: false,
      result: fallbackResult,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch validation for multiple line items
 */
export async function validateMultipleLineItems(
  requests: ValidationRequest[]
): Promise<ValidationResponse[]> {
  const results: ValidationResponse[] = [];
  
  // Process validations concurrently with a limit
  const batchSize = 5;
  
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const batchPromises = batch.map(request => validateLineItem(request));
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('[Validation Service] Batch validation error:', result.reason);
        results.push({
          success: false,
          result: {
            verdict: 'NEEDS_REVIEW',
            score: 0.0,
            reasons: ['Batch validation failed'],
          },
          error: 'Batch processing error',
        });
      }
    }
  }
  
  return results;
}

/**
 * Get validation history for a line item
 */
export async function getValidationHistory(lineItemId: string) {
  try {
    const { data, error } = await supabase
      .from('item_validation_events')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Validation Service] History query error:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[Validation Service] History error:', error);
    return [];
  }
}