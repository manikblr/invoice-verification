import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  matchLineItemWithValidation, 
  matchMultipleLineItems, 
  getItemsReadyForMatching,
  MatchingRequest 
} from '@/lib/orchestration/validation-aware-matcher';

export const runtime = 'nodejs';

// Request validation schemas
const SingleMatchRequestSchema = z.object({
  lineItemId: z.string().uuid('Invalid line item ID format'),
  itemName: z.string().min(1, 'Item name is required'),
  itemDescription: z.string().optional(),
  forceMatcher: z.boolean().optional().default(false),
});

const BatchMatchRequestSchema = z.object({
  items: z.array(SingleMatchRequestSchema).min(1, 'At least one item is required'),
});

const MatchRequestSchema = z.union([
  SingleMatchRequestSchema,
  BatchMatchRequestSchema,
]);

/**
 * POST /api/items/match
 * Matches line items to canonical items (validation-aware)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = MatchRequestSchema.parse(body);
    
    let results;
    
    // Handle single vs batch matching
    if ('items' in validatedRequest) {
      // Batch matching
      const requests: MatchingRequest[] = validatedRequest.items;
      
      console.log(`[Match API] Batch matching requested for ${requests.length} items`);
      results = await matchMultipleLineItems(requests);
      
    } else {
      // Single matching
      const request: MatchingRequest = validatedRequest;
      
      console.log(`[Match API] Single matching requested for item: ${request.itemName}`);
      const result = await matchLineItemWithValidation(request);
      results = [result];
    }
    
    const duration = Date.now() - startTime;
    
    // Determine overall success and stats
    const allSuccessful = results.every(r => r.success);
    const matchedCount = results.filter(r => r.matchResult?.canonicalItemId).length;
    const missedCount = results.filter(r => r.status === 'AWAITING_INGEST').length;
    const blockedCount = results.filter(r => !r.success).length;
    
    console.log(
      `[Match API] Completed ${results.length} matching attempts in ${duration}ms: ` +
      `${matchedCount} matched, ${missedCount} missed, ${blockedCount} blocked`
    );
    
    // Return appropriate response
    if ('items' in validatedRequest) {
      // Batch response
      return NextResponse.json({
        success: allSuccessful,
        results,
        summary: {
          total: results.length,
          matched: matchedCount,
          missed: missedCount,
          blocked: blockedCount,
          durationMs: duration,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Single response
      return NextResponse.json({
        success: results[0].success,
        matching: results[0].matchResult,
        status: results[0].status,
        reason: results[0].reason,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
    
  } catch (error) {
    console.error('[Match API] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: error.format(),
        },
        { status: 400 }
      );
    }
    
    // Generic error response
    return NextResponse.json(
      {
        success: false,
        error: 'Matching service error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/items/match
 * Returns items ready for matching and system status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const includeReady = searchParams.get('include_ready') === 'true';
    
    const response: any = {
      service: 'validation_aware_matcher',
      status: 'healthy',
      version: 'v2',
      message: 'Matcher integrated with validation pipeline',
      features: [
        'Validation status checking',
        'MATCH_MISS event handling',
        'Orchestrator integration',
        'Batch processing',
        'Mock fallback for testing',
      ],
    };
    
    if (includeReady) {
      const readyItems = await getItemsReadyForMatching(limit);
      response.readyForMatching = {
        count: readyItems.length,
        items: readyItems,
      };
    }
    
    response.endpoints = {
      match: 'POST /api/items/match',
      status: 'GET /api/items/{id}/status',
      ready: 'GET /api/items/match?include_ready=true',
    };
    
    response.statusFlow = [
      'NEW → (validation) → AWAITING_MATCH',
      'AWAITING_MATCH → (matching) → MATCHED or AWAITING_INGEST',
      'AWAITING_INGEST → (web ingestion) → AWAITING_MATCH',
    ];
    
    response.timestamp = new Date().toISOString();
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[Match API] Status error:', error);
    
    return NextResponse.json(
      {
        service: 'validation_aware_matcher',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}