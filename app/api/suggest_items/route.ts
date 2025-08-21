import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const vendorId = searchParams.get('vendorId')

  // Enforce min query length
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  // Log in dev/staging (not prod)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[suggest_items] q="${q}", vendorId="${vendorId || 'none'}"`)
  }

  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.warn('[suggest_items] Supabase not configured, returning empty suggestions')
      return NextResponse.json({ suggestions: [] })
    }

    // Fuzzy search on canonical_name (not name)
    const { data: items, error } = await supabase
      .from('canonical_items')
      .select('id, canonical_name')
      .ilike('canonical_name', `%${q}%`)
      .eq('is_active', true)
      .limit(8)

    if (error) {
      // Graceful fallback on DB error
      const isProduction = process.env.NODE_ENV === 'production'
      return NextResponse.json({
        suggestions: [],
        ...(isProduction ? {} : { debug: 'db_error' })
      })
    }

    // Log results count in dev/staging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[suggest_items] Found ${items?.length || 0} results`)
    }

    // Format suggestions with basic scoring
    const suggestions = (items || []).map((item, index) => ({
      id: item.id,
      name: item.canonical_name, // Use canonical_name field
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