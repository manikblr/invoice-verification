import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const vendorId = searchParams.get('vendorId')

  // Enforce min query length
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  try {
    // Basic fuzzy search on canonical items
    const { data: items, error } = await supabase
      .from('canonical_items')
      .select('id, name')
      .ilike('name', `%${q}%`)
      .limit(8)

    if (error) {
      // Graceful fallback on DB error
      const isProduction = process.env.NODE_ENV === 'production'
      return NextResponse.json({
        suggestions: [],
        ...(isProduction ? {} : { debug: 'db_error' })
      })
    }

    // Format suggestions with basic scoring
    const suggestions = (items || []).map((item, index) => ({
      id: item.id,
      name: item.name,
      score: Math.max(0.1, 1 - (index * 0.1)), // Simple ranking score
      reason: 'fuzzy' as const
    }))

    return NextResponse.json({ suggestions })
  } catch (error) {
    // Fail-safe: return empty array on any error
    const isProduction = process.env.NODE_ENV === 'production'
    return NextResponse.json({
      suggestions: [],
      ...(isProduction ? {} : { debug: 'db_error' })
    })
  }
}