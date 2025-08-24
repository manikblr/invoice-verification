import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidationHistory } from '@/lib/validation/validation-service';

export const runtime = 'nodejs';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Create client only if environment variables are available
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

interface StatusResponse {
  success: boolean;
  lineItemId: string;
  status: string;
  stageDetails: {
    validation?: {
      verdict: string;
      score?: number;
      reasons: string[];
      validatedAt: string;
    };
    matching?: {
      canonicalItemId?: string;
      confidence?: number;
      matchedAt?: string;
    };
    pricing?: {
      validated: boolean;
      validatedAt?: string;
    };
    explanation?: {
      required: boolean;
      submitted?: boolean;
      accepted?: boolean;
      submittedAt?: string;
    };
  };
  lastUpdated: string;
  error?: string;
}

/**
 * GET /api/items/{id}/status
 * Returns the current status and stage details for a line item
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const lineItemId = params.id;
    
    // Extract tracing information from headers (implementation.md requirement)
    const userId = request.headers.get('X-User') || 'anonymous';
    const invoiceId = request.headers.get('X-Invoice-ID') || 'unknown';
    const traceId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Status API] Starting with trace: ${traceId}, user: ${userId}, invoice: ${invoiceId}, lineItem: ${lineItemId}`);
    
    // Check if Supabase is configured
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
          message: 'Supabase environment variables are missing',
        },
        { status: 503 }
      );
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(lineItemId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid line item ID format',
        },
        { status: 400 }
      );
    }
    
    // Fetch line item details
    const { data: lineItem, error: lineItemError } = await supabase
      .from('invoice_line_items')
      .select('id, status, raw_name, canonical_item_id, created_at')
      .eq('id', lineItemId)
      .single();
    
    if (lineItemError || !lineItem) {
      return NextResponse.json(
        {
          success: false,
          error: 'Line item not found',
        },
        { status: 404 }
      );
    }
    
    // Get validation history
    const validationHistory = await getValidationHistory(lineItemId);
    const latestValidation = validationHistory[0];
    
    // Get explanation history if needed
    const { data: explanations } = await supabase
      .from('line_item_explanations')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false });
    
    const latestExplanation = explanations?.[0];
    
    // Build stage details
    const stageDetails: StatusResponse['stageDetails'] = {};
    
    // Validation stage
    if (latestValidation) {
      stageDetails.validation = {
        verdict: latestValidation.verdict,
        score: latestValidation.score,
        reasons: latestValidation.reasons as string[],
        validatedAt: latestValidation.created_at,
      };
    }
    
    // Matching stage
    if (lineItem.canonical_item_id) {
      stageDetails.matching = {
        canonicalItemId: lineItem.canonical_item_id,
        // TODO: Add confidence and matchedAt when available
      };
    }
    
    // Pricing stage
    // TODO: Add pricing validation details when available
    
    // Explanation stage
    if (lineItem.status === 'NEEDS_EXPLANATION' || latestExplanation) {
      stageDetails.explanation = {
        required: lineItem.status === 'NEEDS_EXPLANATION',
        submitted: !!latestExplanation,
        accepted: latestExplanation?.accepted || undefined,
        submittedAt: latestExplanation?.created_at,
      };
    }
    
    // implementation.md specification: { status, stage_details }
    const response = {
      status: lineItem.status || 'NEW',
      stage_details: stageDetails,
      // Additional metadata
      lineItemId: lineItem.id,
      itemName: lineItem.raw_name,
      lastUpdated: lineItem.created_at,
      timestamp: new Date().toISOString(),
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[Status API] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/items/{id}/status
 * Updates the status of a line item (for testing/admin purposes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const lineItemId = params.id;
    
    // Check if Supabase is configured
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
          message: 'Supabase environment variables are missing',
        },
        { status: 503 }
      );
    }
    
    const body = await request.json();
    const { status, orchestratorLock } = body;
    
    // Validate status value
    const validStatuses = [
      'NEW', 'VALIDATION_REJECTED', 'AWAITING_MATCH', 'AWAITING_INGEST',
      'MATCHED', 'PRICE_VALIDATED', 'NEEDS_EXPLANATION', 'READY_FOR_SUBMISSION', 'DENIED'
    ];
    
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid status value',
          validStatuses,
        },
        { status: 400 }
      );
    }
    
    // Update the line item
    const updateData: any = {};
    if (status) updateData.status = status;
    if (orchestratorLock !== undefined) updateData.orchestrator_lock = orchestratorLock;
    
    const { data, error } = await supabase
      .from('invoice_line_items')
      .update(updateData)
      .eq('id', lineItemId)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update status',
          details: error.message,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      lineItemId,
      previousStatus: data.status,
      newStatus: status,
      updated: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[Status API] Update error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}