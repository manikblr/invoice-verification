/**
 * Price Validation Trigger Service
 * Automatically triggers price validation after successful matching
 */

import { validateLineItemPrice } from './price-validation-service';
import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface PriceValidationTriggerRequest {
  lineItemId: string;
  canonicalItemId: string;
}

/**
 * Trigger price validation after successful matching
 */
export async function triggerPriceValidationAfterMatch(
  request: PriceValidationTriggerRequest
): Promise<boolean> {
  const { lineItemId, canonicalItemId } = request;

  try {
    console.log(`[Price Trigger] Starting price validation for matched line item ${lineItemId}`);

    if (!supabase) {
      console.warn('[Price Trigger] Database not configured, cannot retrieve line item details');
      return false;
    }

    // Get line item details including price information
    const { data: lineItem, error } = await supabase
      .from('invoice_line_items')
      .select(`
        id,
        raw_name,
        quantity,
        unit_price,
        line_total,
        currency,
        unit_of_measure
      `)
      .eq('id', lineItemId)
      .single();

    if (error || !lineItem) {
      console.error(`[Price Trigger] Failed to retrieve line item ${lineItemId}:`, error);
      return false;
    }

    // Check if the line item has price information
    if (!lineItem.unit_price || lineItem.unit_price <= 0) {
      console.warn(`[Price Trigger] Line item ${lineItemId} has no valid unit price, skipping validation`);
      
      // Still trigger domain event to indicate no price available
      const { processDomainEvent } = await import('../orchestration/orchestrator');
      await processDomainEvent({
        type: 'PRICE_VALIDATED',
        lineItemId,
        validated: true, // Accept items without price info
      });
      
      return true;
    }

    // Trigger price validation
    const validationRequest = {
      lineItemId,
      canonicalItemId,
      unitPrice: lineItem.unit_price,
      currency: lineItem.currency || 'USD',
      itemName: lineItem.raw_name,
    };

    await validateLineItemPrice(validationRequest);

    console.log(`[Price Trigger] Price validation triggered successfully for ${lineItemId}`);
    return true;

  } catch (error) {
    console.error(`[Price Trigger] Failed to trigger price validation for ${lineItemId}:`, error);
    return false;
  }
}

/**
 * Batch trigger price validation for multiple matched items
 */
export async function triggerPriceValidationBatch(
  requests: PriceValidationTriggerRequest[]
): Promise<{ success: number; failed: number }> {
  
  console.log(`[Price Trigger] Starting batch price validation for ${requests.length} items`);

  let successCount = 0;
  let failedCount = 0;

  // Process in smaller batches to avoid overwhelming the system
  const batchSize = 3;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(request => triggerPriceValidationAfterMatch(request))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value === true) {
        successCount++;
      } else {
        failedCount++;
        if (result.status === 'rejected') {
          console.error('[Price Trigger] Batch validation error:', result.reason);
        }
      }
    }

    // Small delay between batches
    if (i + batchSize < requests.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[Price Trigger] Batch validation completed: ${successCount} successful, ${failedCount} failed`);

  return { success: successCount, failed: failedCount };
}

/**
 * Get line items that need price validation (status = MATCHED)
 */
export async function getItemsNeedingPriceValidation(limit: number = 20): Promise<PriceValidationTriggerRequest[]> {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select('id, canonical_item_id')
      .eq('status', 'MATCHED')
      .not('canonical_item_id', 'is', null)
      .is('orchestrator_lock', null) // Only unlocked items
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Price Trigger] Query error:', error);
      return [];
    }

    return (data || []).map(item => ({
      lineItemId: item.id,
      canonicalItemId: item.canonical_item_id,
    }));

  } catch (error) {
    console.error('[Price Trigger] Query error:', error);
    return [];
  }
}

/**
 * Auto-trigger price validation for items that have been matched but not price validated
 * This can be called periodically by a cron job or background process
 */
export async function autoTriggerPriceValidation(): Promise<void> {
  try {
    console.log('[Price Trigger] Starting auto price validation scan');

    const itemsToValidate = await getItemsNeedingPriceValidation(50);
    
    if (itemsToValidate.length === 0) {
      console.log('[Price Trigger] No items need price validation');
      return;
    }

    console.log(`[Price Trigger] Found ${itemsToValidate.length} items needing price validation`);

    const results = await triggerPriceValidationBatch(itemsToValidate);
    
    console.log(`[Price Trigger] Auto validation completed: ${results.success} successful, ${results.failed} failed`);

  } catch (error) {
    console.error('[Price Trigger] Auto validation error:', error);
  }
}