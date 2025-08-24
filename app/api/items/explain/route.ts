/**
 * Explanation Submission API Endpoint
 * POST /api/items/explain
 * Phase 5: Rule Agent + Explanation Loop
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Request schema
const ExplanationRequestSchema = z.object({
  lineItemId: z.string().min(1),
  explanationText: z.string().min(10).max(5000),
  submittedBy: z.string().optional(),
});

const BatchExplanationRequestSchema = z.object({
  explanations: z.array(ExplanationRequestSchema).min(1).max(20),
});

const ExplanationSubmissionSchema = z.union([
  ExplanationRequestSchema,
  BatchExplanationRequestSchema,
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extract tracing information from headers (implementation.md requirement)
    const userId = request.headers.get('X-User') || 'anonymous';
    const invoiceId = request.headers.get('X-Invoice-ID') || 'unknown';
    const traceId = `explain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Explain API] Starting with trace: ${traceId}, user: ${userId}, invoice: ${invoiceId}`);
    
    // Validate request body
    const validatedData = ExplanationSubmissionSchema.parse(body);

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
        },
        { status: 503 }
      );
    }

    // Handle batch explanations
    if ('explanations' in validatedData) {
      console.log(`[Explanation API] Processing batch submission for ${validatedData.explanations.length} explanations`);
      
      const results = await Promise.allSettled(
        validatedData.explanations.map(explanation => 
          processExplanationSubmission(explanation.lineItemId, explanation.explanationText, explanation.submittedBy)
        )
      );

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.length - successes;

      return NextResponse.json({
        success: true,
        batch: true,
        processed: results.length,
        successful: successes,
        failed: failures,
        results: results.map((result, index) => ({
          lineItemId: validatedData.explanations[index].lineItemId,
          success: result.status === 'fulfilled',
          data: result.status === 'fulfilled' ? result.value : undefined,
          error: result.status === 'rejected' ? result.reason.message : undefined,
        })),
      });
    }

    // Handle single explanation
    const singleRequest = validatedData as z.infer<typeof ExplanationRequestSchema>;
    console.log(`[Explanation API] Processing single explanation for line item ${singleRequest.lineItemId}`);
    
    const result = await processExplanationSubmission(
      singleRequest.lineItemId,
      singleRequest.explanationText,
      singleRequest.submittedBy
    );

    // For now, return submission status. The actual acceptance will be determined by the explanation agent
    // implementation.md specification: { accepted: bool, rejected_reason? }
    return NextResponse.json({
      // Note: This is submission response. Actual acceptance determined by explanation agent.
      accepted: null, // Will be determined after agent verification
      rejected_reason: null,
      // Additional metadata
      explanationId: result.explanationId,
      verificationTriggered: result.verificationTriggered,
      message: 'Explanation submitted successfully and verification initiated',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Explanation API] Request failed:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      {
        success: false,
        error: 'Explanation submission failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving explanations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineItemId = searchParams.get('lineItemId');

    if (!lineItemId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing lineItemId parameter',
        },
        { status: 400 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
        },
        { status: 503 }
      );
    }

    const { data: explanations, error } = await supabase
      .from('line_item_explanations')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      lineItemId,
      explanations: explanations || [],
      count: explanations?.length || 0,
    });

  } catch (error) {
    console.error('[Explanation API] GET request failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve explanations',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * Process a single explanation submission
 */
async function processExplanationSubmission(
  lineItemId: string,
  explanationText: string,
  submittedBy?: string
): Promise<{ explanationId: string; verificationTriggered: boolean }> {
  
  if (!supabase) {
    throw new Error('Database not configured');
  }

  try {
    console.log(`[Explanation Processing] Submitting explanation for line item ${lineItemId}`);

    // Check if line item exists and is in NEEDS_EXPLANATION status
    const { data: lineItem, error: lineItemError } = await supabase
      .from('invoice_line_items')
      .select('id, status, raw_name')
      .eq('id', lineItemId)
      .single();

    if (lineItemError || !lineItem) {
      throw new Error(`Line item ${lineItemId} not found`);
    }

    if (lineItem.status !== 'NEEDS_EXPLANATION') {
      console.warn(`[Explanation Processing] Line item ${lineItemId} is in status ${lineItem.status}, not NEEDS_EXPLANATION`);
      // Continue anyway - user might be providing additional context
    }

    // Check if there's already a pending explanation
    const { data: existingExplanations, error: existingError } = await supabase
      .from('line_item_explanations')
      .select('id')
      .eq('line_item_id', lineItemId)
      .eq('verification_status', 'pending')
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existingExplanations && existingExplanations.length > 0) {
      throw new Error('There is already a pending explanation for this line item');
    }

    // Insert new explanation
    const { data: explanation, error: insertError } = await supabase
      .from('line_item_explanations')
      .insert({
        line_item_id: lineItemId,
        explanation_text: explanationText,
        submitted_by: submittedBy || 'anonymous',
        verification_status: 'pending',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !explanation) {
      throw insertError || new Error('Failed to insert explanation');
    }

    console.log(`[Explanation Processing] Created explanation ${explanation.id} for line item ${lineItemId}`);

    // Trigger explanation verification
    let verificationTriggered = false;
    try {
      const { processDomainEvent } = await import('@/lib/orchestration/orchestrator');
      
      verificationTriggered = await processDomainEvent({
        type: 'EXPLANATION_SUBMITTED',
        lineItemId,
        explanationId: explanation.id,
      });

      console.log(`[Explanation Processing] Domain event triggered for ${lineItemId}: ${verificationTriggered}`);
    } catch (eventError) {
      console.error(`[Explanation Processing] Failed to trigger domain event:`, eventError);
      // Don't fail the entire operation if event triggering fails
    }

    return {
      explanationId: explanation.id,
      verificationTriggered,
    };

  } catch (error) {
    console.error(`[Explanation Processing] Failed to process explanation for ${lineItemId}:`, error);
    throw error;
  }
}

// PATCH endpoint for updating explanation status (admin/testing use)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { explanationId, verificationStatus, accepted, rejectedReason } = body;

    if (!explanationId || !verificationStatus) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing explanationId or verificationStatus',
        },
        { status: 400 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database not configured',
        },
        { status: 503 }
      );
    }

    const updateData: any = {
      verification_status: verificationStatus,
      updated_at: new Date().toISOString(),
    };

    if (verificationStatus === 'accepted' || verificationStatus === 'rejected') {
      updateData.accepted = verificationStatus === 'accepted';
      if (verificationStatus === 'rejected' && rejectedReason) {
        updateData.rejected_reason = rejectedReason;
      }
    }

    const { data: explanation, error } = await supabase
      .from('line_item_explanations')
      .update(updateData)
      .eq('id', explanationId)
      .select('line_item_id')
      .single();

    if (error) {
      throw error;
    }

    // Trigger appropriate domain event
    if (verificationStatus === 'accepted') {
      const { processDomainEvent } = await import('@/lib/orchestration/orchestrator');
      await processDomainEvent({
        type: 'READY_FOR_SUBMISSION',
        lineItemId: explanation.line_item_id,
      });
    } else if (verificationStatus === 'rejected') {
      const { processDomainEvent } = await import('@/lib/orchestration/orchestrator');
      await processDomainEvent({
        type: 'DENIED',
        lineItemId: explanation.line_item_id,
        reason: rejectedReason || 'Explanation rejected',
      });
    }

    return NextResponse.json({
      success: true,
      explanationId,
      verificationStatus,
      accepted: updateData.accepted,
      message: `Explanation ${verificationStatus} successfully`,
    });

  } catch (error) {
    console.error('[Explanation API] PATCH request failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update explanation status',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}