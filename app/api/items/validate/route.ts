import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateLineItem, validateMultipleLineItems, ValidationRequest } from '@/lib/validation/validation-service';

export const runtime = 'nodejs';

// Request validation schemas
const SingleValidationRequestSchema = z.object({
  lineItemId: z.string().uuid('Invalid line item ID format'),
  itemName: z.string().min(1, 'Item name is required'),
  itemDescription: z.string().optional(),
  serviceLine: z.string().optional(),
  serviceType: z.string().optional(),
  scopeOfWork: z.string().optional(),
  userId: z.string().optional(),
});

const BatchValidationRequestSchema = z.object({
  items: z.array(SingleValidationRequestSchema).min(1, 'At least one item is required'),
});

const ValidationRequestSchema = z.union([
  SingleValidationRequestSchema,
  BatchValidationRequestSchema,
]);

/**
 * POST /api/items/validate
 * Validates line items using the pre-validation agent
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = ValidationRequestSchema.parse(body);
    
    // Extract tracing information from headers (implementation.md requirement)
    const userId = request.headers.get('X-User') || 'anonymous';
    const invoiceId = request.headers.get('X-Invoice-ID') || 'unknown';
    const traceId = `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Validate API] Starting validation with trace: ${traceId}, user: ${userId}, invoice: ${invoiceId}`);
    
    let results;
    
    // Handle single vs batch validation
    if ('items' in validatedRequest) {
      // Batch validation
      const requests: ValidationRequest[] = validatedRequest.items.map(item => ({
        lineItemId: item.lineItemId,
        itemName: item.itemName,
        itemDescription: item.itemDescription,
        serviceLine: item.serviceLine,
        serviceType: item.serviceType,
        scopeOfWork: item.scopeOfWork,
        userId: item.userId || userId,
      }));
      
      console.log(`[Validate API] Batch validation requested for ${requests.length} items`);
      results = await validateMultipleLineItems(requests);
      
    } else {
      // Single validation
      const singleRequest = validatedRequest as typeof SingleValidationRequestSchema._output;
      const request: ValidationRequest = {
        lineItemId: singleRequest.lineItemId,
        itemName: singleRequest.itemName,
        itemDescription: singleRequest.itemDescription,
        serviceLine: singleRequest.serviceLine,
        serviceType: singleRequest.serviceType,
        scopeOfWork: singleRequest.scopeOfWork,
        userId: singleRequest.userId || userId,
      };
      
      console.log(`[Validate API] Single validation requested for item: ${request.itemName}`);
      const result = await validateLineItem(request);
      results = [result];
    }
    
    const duration = Date.now() - startTime;
    
    // Determine overall success
    const allSuccessful = results.every(r => r.success);
    const approvedCount = results.filter(r => r.result.verdict === 'APPROVED').length;
    const rejectedCount = results.filter(r => r.result.verdict === 'REJECTED').length;
    const reviewCount = results.filter(r => r.result.verdict === 'NEEDS_REVIEW').length;
    
    console.log(
      `[Validate API] Completed ${results.length} validations in ${duration}ms: ` +
      `${approvedCount} approved, ${rejectedCount} rejected, ${reviewCount} need review`
    );
    
    // Return appropriate response matching implementation.md specification
    if ('items' in validatedRequest) {
      // Batch response
      return NextResponse.json({
        success: allSuccessful,
        results: results.map(r => ({
          // implementation.md specification: { verdict, reasons, score }
          verdict: r.result.verdict,
          reasons: r.result.reasons,
          score: r.result.score,
          // Additional metadata
          lineItemId: r.lineItemId,
          validationEventId: r.validationEventId,
          blacklistedTerm: r.result.blacklistedTerm,
        })),
        summary: {
          total: results.length,
          approved: approvedCount,
          rejected: rejectedCount,
          needsReview: reviewCount,
          durationMs: duration,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Single response matching implementation.md specification
      const result = results[0].result;
      return NextResponse.json({
        // implementation.md specification: { verdict, reasons, score }
        verdict: result.verdict,
        reasons: result.reasons,
        score: result.score,
        // Additional metadata
        validationEventId: results[0].validationEventId,
        blacklistedTerm: result.blacklistedTerm,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    }
    
  } catch (error) {
    console.error('[Validate API] Error:', error);
    
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
        error: 'Validation service error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/items/validate
 * Returns validation system status and test cases
 */
export async function GET() {
  return NextResponse.json({
    service: 'pre_validation_agent',
    status: 'healthy',
    version: 'v2',
    message: 'Pre-validation agent with rule-based + LLM classification',
    endpoints: {
      validate: 'POST /api/items/validate',
      status: 'GET /api/items/{id}/status',
    },
    features: [
      'Blacklist term detection',
      'Structural validation',
      'LLM content classification',
      'Database persistence',
      'Batch processing',
      'Langfuse tracing',
    ],
    testCases: [
      {
        name: 'Valid FM Material',
        example: {
          lineItemId: '123e4567-e89b-12d3-a456-426614174000',
          itemName: '1/2 inch PVC pipe',
          itemDescription: 'White PVC pipe for plumbing installation',
          serviceLine: 'Plumbing',
          serviceType: 'Installation',
          scopeOfWork: 'Replace old plumbing fixtures in office building',
        },
        expectedVerdict: 'APPROVED',
      },
      {
        name: 'Personal Item (Rejected)',
        example: {
          lineItemId: '123e4567-e89b-12d3-a456-426614174001',
          itemName: 'Coffee and lunch',
          itemDescription: 'Personal meal expenses',
        },
        expectedVerdict: 'REJECTED',
      },
      {
        name: 'Labor Cost (Rejected)',
        example: {
          lineItemId: '123e4567-e89b-12d3-a456-426614174002',
          itemName: 'Technician hourly rate',
          itemDescription: 'Labor charges for service call',
        },
        expectedVerdict: 'REJECTED',
      },
      {
        name: 'Ambiguous Item',
        example: {
          lineItemId: '123e4567-e89b-12d3-a456-426614174003',
          itemName: 'Replacement part',
          itemDescription: 'Generic replacement component',
        },
        expectedVerdict: 'NEEDS_REVIEW',
      },
    ],
    timestamp: new Date().toISOString(),
  });
}