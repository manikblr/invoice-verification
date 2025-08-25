import { NextRequest, NextResponse } from 'next/server'
import { transparencyDB } from '@/lib/transparency-db'

export const dynamic = 'force-dynamic'

// Get detailed validation information for a specific invoice
export async function GET(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const { invoiceId } = params
    
    console.log(`Fetching validation details for invoice: ${invoiceId}`)
    
    // Get complete validation trace
    const trace = await transparencyDB.getValidationTrace(invoiceId)
    
    if (!trace) {
      return NextResponse.json(
        { error: 'Validation not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: trace
    })
    
  } catch (error) {
    console.error('Error fetching validation details:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch validation details', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

// Update validation (for corrections or additional information)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const { invoiceId } = params
    const updates = await req.json()
    
    console.log(`Updating validation for invoice: ${invoiceId}`)
    
    // Get the session first
    const session = await transparencyDB.getValidationSession(invoiceId)
    if (!session) {
      return NextResponse.json(
        { error: 'Validation session not found' },
        { status: 404 }
      )
    }
    
    // Update session with new data
    await transparencyDB.updateValidationSession(session.id, {
      ...updates,
      updatedAt: new Date().toISOString()
    })
    
    return NextResponse.json({
      success: true,
      message: 'Validation updated successfully'
    })
    
  } catch (error) {
    console.error('Error updating validation:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update validation', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

// Delete validation (for cleanup or privacy)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const { invoiceId } = params
    
    console.log(`Deleting validation for invoice: ${invoiceId}`)
    
    // Get the session first
    const session = await transparencyDB.getValidationSession(invoiceId)
    if (!session) {
      return NextResponse.json(
        { error: 'Validation session not found' },
        { status: 404 }
      )
    }
    
    // Delete session (cascade will handle related records)
    // Note: This would require implementing delete method in TransparencyDB
    
    return NextResponse.json(
      { message: 'Validation deletion not implemented yet' },
      { status: 501 }
    )
    
  } catch (error) {
    console.error('Error deleting validation:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete validation', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}