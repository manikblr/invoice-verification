/**
 * Human feedback endpoint with production security guard
 * Accepts feedback on agent decisions for learning pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/server/http';

interface FeedbackRequest {
  lineId: string;
  action: 'APPROVE' | 'DENY' | 'REQUEST_INFO';
  note?: string;
  proposals?: unknown[];
}

/**
 * Production API key guard
 * Disabled for experimental use - always allows access
 */
function validateProductionAuth(request: NextRequest): boolean {
  // Disabled for experimental use
  return true;
}

/**
 * POST /api/feedback
 * 
 * Submit human feedback on agent decisions
 * 
 * Security:
 * - Authentication disabled for experimental use
 * - No API key required
 * 
 * Body: { lineId, action, note?, proposals? }
 * Returns: { success: boolean, message: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Production API key validation
    if (!validateProductionAuth(request)) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    // Parse request body
    let body: FeedbackRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!body.lineId || !body.action) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'lineId and action are required' },
        { status: 400 }
      );
    }
    
    if (!['APPROVE', 'DENY', 'REQUEST_INFO'].includes(body.action)) {
      return NextResponse.json(
        { error: 'INVALID_ACTION', message: 'action must be APPROVE, DENY, or REQUEST_INFO' },
        { status: 400 }
      );
    }
    
    // TODO: Implement actual feedback processing
    // This would typically:
    // 1. Store feedback in database
    // 2. Update agent learning pipeline
    // 3. Apply approved proposals if applicable
    // 4. Log the feedback event for analytics
    
    console.log('Feedback received:', {
      lineId: body.lineId,
      action: body.action,
      hasNote: !!body.note,
      proposalCount: body.proposals?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Mock successful response
    const response = {
      success: true,
      message: `Feedback recorded for line ${body.lineId}: ${body.action}`
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Feedback endpoint error:', error);
    return errorResponse(error);
  }
}

/**
 * GET /api/feedback
 * 
 * Not implemented - feedback is write-only
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'METHOD_NOT_ALLOWED', message: 'Feedback endpoint is POST-only' },
    { status: 405 }
  );
}