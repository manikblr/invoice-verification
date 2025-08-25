import { NextRequest, NextResponse } from 'next/server'
import { transparencyDB } from '@/lib/transparency-db'
import { ValidationHistoryQuery } from '@/lib/types/transparency'

export const dynamic = 'force-dynamic'

// Get validation history with filtering and pagination
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    // Parse query parameters
    const query: ValidationHistoryQuery = {
      userId: searchParams.get('userId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      status: searchParams.get('status') as any || undefined,
      serviceLine: searchParams.get('serviceLine') || undefined,
      itemName: searchParams.get('itemName') || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
      sortBy: searchParams.get('sortBy') as any || 'date',
      sortOrder: searchParams.get('sortOrder') as any || 'desc'
    }

    console.log('Fetching validation history with query:', query)
    
    const result = await transparencyDB.getValidationHistory(query)
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Error fetching validation history:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch validation history', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

// Create or update validation history entry (for admin use)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // This endpoint could be used for manual data entry or corrections
    // Implementation would depend on specific admin requirements
    
    return NextResponse.json(
      { message: 'Validation history creation not implemented yet' },
      { status: 501 }
    )
    
  } catch (error) {
    console.error('Error creating validation history:', error)
    return NextResponse.json(
      { 
        error: 'Failed to create validation history', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}