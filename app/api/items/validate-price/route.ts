/**
 * Price Validation API Endpoint
 * POST /api/items/validate-price
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  validateLineItemPrice, 
  validateMultipleLineItemPrices,
  PriceValidationServiceRequest 
} from '@/lib/price-validation/price-validation-service';

// Request schemas
const SinglePriceValidationSchema = z.object({
  lineItemId: z.string().min(1),
  canonicalItemId: z.string().optional(),
  unitPrice: z.number().positive(),
  currency: z.string().default('USD'),
  itemName: z.string().optional(),
});

const BatchPriceValidationSchema = z.object({
  items: z.array(SinglePriceValidationSchema).min(1).max(50),
});

const PriceValidationRequestSchema = z.union([
  SinglePriceValidationSchema,
  BatchPriceValidationSchema,
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = PriceValidationRequestSchema.parse(body);

    // Handle batch validation
    if ('items' in validatedData) {
      console.log(`[Price Validation API] Processing batch validation for ${validatedData.items.length} items`);
      
      const serviceRequests: PriceValidationServiceRequest[] = validatedData.items.map(item => ({
        lineItemId: item.lineItemId,
        canonicalItemId: item.canonicalItemId,
        unitPrice: item.unitPrice,
        currency: item.currency,
        itemName: item.itemName,
      }));

      const results = await validateMultipleLineItemPrices(serviceRequests);
      
      return NextResponse.json({
        success: true,
        batch: true,
        results,
        summary: {
          total: results.length,
          passed: results.filter(r => r.isValid).length,
          failed: results.filter(r => !r.isValid).length,
          avgConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
        },
      });
    }
    
    // Handle single validation - validatedData is SinglePriceValidationSchema type
    const singleRequest = validatedData as z.infer<typeof SinglePriceValidationSchema>;
    console.log(`[Price Validation API] Processing single validation for line item ${singleRequest.lineItemId}`);
    
    const serviceRequest: PriceValidationServiceRequest = {
      lineItemId: singleRequest.lineItemId,
      canonicalItemId: singleRequest.canonicalItemId,
      unitPrice: singleRequest.unitPrice,
      currency: singleRequest.currency,
      itemName: singleRequest.itemName,
    };

    const result = await validateLineItemPrice(serviceRequest);

    return NextResponse.json({
      success: true,
      batch: false,
      result,
      details: {
        validationMethod: result.validationResult.validationMethod,
        expectedRange: result.validationResult.expectedRange,
        variancePercent: result.validationResult.variancePercent,
        confidence: result.validationResult.confidence,
        proposalId: result.validationResult.proposalId,
        externalSourcesCount: result.validationResult.details.externalPriceSources?.length || 0,
      },
    });

  } catch (error) {
    console.error('[Price Validation API] Request failed:', error);

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
        error: 'Price validation failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving validation history
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

    const { getPriceValidationHistory } = await import('@/lib/price-validation/price-validation-service');
    const history = await getPriceValidationHistory(lineItemId);

    return NextResponse.json({
      success: true,
      lineItemId,
      history,
      count: history.length,
    });

  } catch (error) {
    console.error('[Price Validation API] GET request failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve validation history',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}