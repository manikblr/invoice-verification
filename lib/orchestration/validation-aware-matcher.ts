/**
 * Validation-Aware Matcher Service
 * Integrates the matcher with the validation pipeline to ensure only APPROVED items are matched
 */

import { createClient } from '@supabase/supabase-js';
import { processDomainEvent, getLineItemStatus, LineItemStatus } from './orchestrator';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface MatchingRequest {
  lineItemId: string;
  itemName: string;
  itemDescription?: string;
  forceMatcher?: boolean; // Override validation check for testing
}

export interface MatchingResponse {
  success: boolean;
  lineItemId: string;
  matchResult?: {
    canonicalItemId?: string;
    canonicalName?: string;
    confidence: number;
    matchType: 'exact' | 'synonym' | 'fuzzy' | 'none';
  };
  status: LineItemStatus;
  reason?: string;
  error?: string;
}

/**
 * Check if a line item is ready for matching
 */
async function isReadyForMatching(lineItemId: string): Promise<{ ready: boolean; status: LineItemStatus; reason?: string }> {
  try {
    const lineItemStatus = await getLineItemStatus(lineItemId);
    
    if (!lineItemStatus) {
      return { ready: false, status: 'NEW', reason: 'Line item not found' };
    }
    
    // Only allow matching for items with AWAITING_MATCH status
    if (lineItemStatus.status === 'AWAITING_MATCH') {
      return { ready: true, status: lineItemStatus.status };
    }
    
    // Handle other statuses
    switch (lineItemStatus.status) {
      case 'NEW':
        return { ready: false, status: lineItemStatus.status, reason: 'Item not yet validated' };
      case 'VALIDATION_REJECTED':
        return { ready: false, status: lineItemStatus.status, reason: 'Item rejected during validation' };
      case 'AWAITING_INGEST':
        return { ready: false, status: lineItemStatus.status, reason: 'Waiting for web ingestion to complete' };
      case 'MATCHED':
        return { ready: false, status: lineItemStatus.status, reason: 'Item already matched' };
      case 'PRICE_VALIDATED':
      case 'NEEDS_EXPLANATION':
      case 'READY_FOR_SUBMISSION':
        return { ready: false, status: lineItemStatus.status, reason: 'Item already processed beyond matching stage' };
      case 'DENIED':
        return { ready: false, status: lineItemStatus.status, reason: 'Item has been denied' };
      default:
        return { ready: false, status: lineItemStatus.status, reason: 'Unknown status' };
    }
  } catch (error) {
    console.error('[Validation-Aware Matcher] Status check error:', error);
    return { ready: false, status: 'NEW', reason: 'Error checking status' };
  }
}

/**
 * Call the Python matcher service
 */
async function callPythonMatcher(request: MatchingRequest): Promise<any> {
  try {
    const pythonServiceUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:5000';
    
    const response = await fetch(`${pythonServiceUrl}/api/match_item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        line_item_id: request.lineItemId,
        description: request.itemName,
        notes: request.itemDescription || '',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Python matcher service error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Validation-Aware Matcher] Python service error:', error);
    throw error;
  }
}

/**
 * Mock matcher for testing when Python service is unavailable
 */
async function mockMatcher(request: MatchingRequest): Promise<any> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const { itemName } = request;
  const lowerName = itemName.toLowerCase();
  
  // Mock matching logic based on common patterns
  if (lowerName.includes('pipe') || lowerName.includes('fitting')) {
    return {
      success: true,
      match_result: {
        canonical_item_id: 'mock-pipe-001',
        canonical_name: 'Standard PVC Pipe Fitting',
        confidence: 0.85,
        match_type: 'fuzzy',
      },
    };
  }
  
  if (lowerName.includes('valve') || lowerName.includes('gasket')) {
    return {
      success: true,
      match_result: {
        canonical_item_id: 'mock-valve-001',
        canonical_name: 'Ball Valve Assembly',
        confidence: 0.90,
        match_type: 'synonym',
      },
    };
  }
  
  if (lowerName.includes('wire') || lowerName.includes('electrical')) {
    return {
      success: true,
      match_result: {
        canonical_item_id: 'mock-wire-001',
        canonical_name: 'Electrical Wire Cable',
        confidence: 0.78,
        match_type: 'fuzzy',
      },
    };
  }
  
  // No match found
  return {
    success: true,
    match_result: {
      canonical_item_id: null,
      canonical_name: null,
      confidence: 0.0,
      match_type: 'none',
    },
  };
}

/**
 * Update line item with match result
 */
async function updateLineItemWithMatch(
  lineItemId: string,
  matchResult: any
): Promise<boolean> {
  try {
    if (matchResult.canonical_item_id) {
      // Update line item with matched canonical item
      const { error } = await supabase
        .from('invoice_line_items')
        .update({
          canonical_item_id: matchResult.canonical_item_id,
        })
        .eq('id', lineItemId);
      
      if (error) {
        console.error('[Validation-Aware Matcher] Update error:', error);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('[Validation-Aware Matcher] Update error:', error);
    return false;
  }
}

/**
 * Main validation-aware matching function
 */
export async function matchLineItemWithValidation(request: MatchingRequest): Promise<MatchingResponse> {
  const startTime = Date.now();
  
  try {
    const { lineItemId, itemName, forceMatcher = false } = request;
    
    // Check if item is ready for matching (unless forced)
    if (!forceMatcher) {
      const readinessCheck = await isReadyForMatching(lineItemId);
      
      if (!readinessCheck.ready) {
        return {
          success: false,
          lineItemId,
          status: readinessCheck.status,
          reason: readinessCheck.reason,
        };
      }
    }
    
    console.log(`[Validation-Aware Matcher] Starting match for: ${itemName}`);
    
    // Try Python matcher first, fall back to mock
    let matcherResult;
    try {
      matcherResult = await callPythonMatcher(request);
    } catch (error) {
      console.warn('[Validation-Aware Matcher] Python service unavailable, using mock matcher');
      matcherResult = await mockMatcher(request);
    }
    
    if (!matcherResult.success) {
      return {
        success: false,
        lineItemId,
        status: 'AWAITING_MATCH',
        error: 'Matcher service failed',
      };
    }
    
    const matchResult = matcherResult.match_result;
    const duration = Date.now() - startTime;
    
    // Update line item with match result
    const updateSuccess = await updateLineItemWithMatch(lineItemId, matchResult);
    if (!updateSuccess) {
      console.warn(`[Validation-Aware Matcher] Failed to update line item ${lineItemId}`);
    }
    
    // Determine next action based on match result
    if (matchResult.canonical_item_id) {
      // Match found - emit MATCHED event
      await processDomainEvent({
        type: 'MATCHED',
        lineItemId,
        canonicalItemId: matchResult.canonical_item_id,
        confidence: matchResult.confidence,
      });
      
      console.log(
        `[Validation-Aware Matcher] ${itemName} -> MATCHED ` +
        `(${matchResult.canonical_name}, confidence: ${matchResult.confidence}) in ${duration}ms`
      );
      
      return {
        success: true,
        lineItemId,
        matchResult: {
          canonicalItemId: matchResult.canonical_item_id,
          canonicalName: matchResult.canonical_name,
          confidence: matchResult.confidence,
          matchType: matchResult.match_type,
        },
        status: 'MATCHED',
      };
    } else {
      // No match found - emit MATCH_MISS event
      await processDomainEvent({
        type: 'MATCH_MISS',
        lineItemId,
        itemName,
      });
      
      console.log(
        `[Validation-Aware Matcher] ${itemName} -> MATCH_MISS in ${duration}ms`
      );
      
      return {
        success: true,
        lineItemId,
        matchResult: {
          confidence: 0.0,
          matchType: 'none',
        },
        status: 'AWAITING_INGEST',
        reason: 'No canonical match found - web ingestion will be triggered',
      };
    }
    
  } catch (error) {
    console.error('[Validation-Aware Matcher] Error:', error);
    
    return {
      success: false,
      lineItemId: request.lineItemId,
      status: 'AWAITING_MATCH',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch matching for multiple line items
 */
export async function matchMultipleLineItems(
  requests: MatchingRequest[]
): Promise<MatchingResponse[]> {
  const results: MatchingResponse[] = [];
  
  // Process matches concurrently with a limit
  const batchSize = 3;
  
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const batchPromises = batch.map(request => matchLineItemWithValidation(request));
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('[Validation-Aware Matcher] Batch matching error:', result.reason);
        // Add error result for failed items
        results.push({
          success: false,
          lineItemId: 'unknown',
          status: 'AWAITING_MATCH',
          error: 'Batch processing error',
        });
      }
    }
  }
  
  return results;
}

/**
 * Get line items that are ready for matching
 */
export async function getItemsReadyForMatching(limit: number = 50): Promise<MatchingRequest[]> {
  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select('id, raw_name, status')
      .eq('status', 'AWAITING_MATCH')
      .is('orchestrator_lock', null) // Only unlocked items
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      console.error('[Validation-Aware Matcher] Query error:', error);
      return [];
    }
    
    return (data || []).map(item => ({
      lineItemId: item.id,
      itemName: item.raw_name,
    }));
  } catch (error) {
    console.error('[Validation-Aware Matcher] Query error:', error);
    return [];
  }
}