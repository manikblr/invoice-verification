import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
)

/**
 * Get popular items within service line/type scope
 */
async function getScopedPopularItems(serviceLineId?: string, serviceTypeId?: string, startTime?: bigint) {
  let query = supabase
    .from('canonical_items')
    .select('id, canonical_name, popularity, service_line_id')
    .eq('is_active', true)
  
  if (serviceLineId) {
    query = query.eq('service_line_id', parseInt(serviceLineId))
  } else if (serviceTypeId) {
    query = query.eq('service_lines.service_type_id', parseInt(serviceTypeId))
  }
  
  const { data: items, error } = await query
    .order('popularity', { ascending: false })
    .limit(8)
  
  if (error || !items) {
    return NextResponse.json({ suggestions: [] })
  }
  
  const suggestions = items.map((item, index) => ({
    id: item.id,
    name: item.canonical_name,
    score: Math.max(0.1, 0.8 - (index * 0.1)),
    reason: 'popular' as const
  }))
  
  // Performance logging
  if (startTime && process.env.NODE_ENV !== 'production') {
    const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000
    console.log(`[suggest_items] Scoped popular: ${suggestions.length} items in ${elapsed.toFixed(1)}ms`)
  }
  
  return NextResponse.json({ suggestions })
}

export async function GET(request: Request) {
  const startTime = process.hrtime.bigint()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const vendorId = searchParams.get('vendorId')
  const serviceLineId = searchParams.get('serviceLineId')
  const serviceTypeId = searchParams.get('serviceTypeId')

  // Enforce min query length, but allow scoped popular queries
  if (!q || q.length < 2) {
    if (serviceLineId || serviceTypeId) {
      // Return top popular items in scope
      return await getScopedPopularItems(serviceLineId, serviceTypeId, startTime)
    }
    return NextResponse.json({ suggestions: [] })
  }

  // Enhanced logging in dev/staging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[suggest_items] q="${q}", vendorId="${vendorId || 'none'}", serviceLineId="${serviceLineId || 'none'}", serviceTypeId="${serviceTypeId || 'none'}"`)
  }

  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
      console.warn('[suggest_items] Supabase not configured, returning empty suggestions')
      return NextResponse.json({ suggestions: [] })
    }

    // Build query with service line/type filters
    let query = supabase
      .from('canonical_items')
      .select(`
        id, 
        canonical_name, 
        popularity,
        service_line_id,
        service_lines(id, name)
      `)
      .ilike('canonical_name', `${q}%`)
      .eq('is_active', true)
    
    // Apply service line filter
    if (serviceLineId) {
      query = query.eq('service_line_id', parseInt(serviceLineId))
    }
    
    // Apply service type filter (requires join)
    if (serviceTypeId && !serviceLineId) {
      query = query.eq('service_lines.service_type_id', parseInt(serviceTypeId))
    }
    
    const { data: items, error } = await query
      .order('popularity', { ascending: false })
      .limit(8)

    if (error) {
      // Graceful fallback on DB error
      const isProduction = process.env.NODE_ENV === 'production'
      return NextResponse.json({
        suggestions: [],
        ...(isProduction ? {} : { debug: 'db_error' })
      })
    }

    let suggestions = []
    let reason = 'fuzzy'

    if (items && items.length > 0) {
      // Format fuzzy search results with enhanced scoring
      suggestions = items.map((item, index) => {
        let score = Math.max(0.1, 1 - (index * 0.1))
        let reason = 'fuzzy'
        
        // Vendor boost (disabled until vendor_catalog_items is loaded)
        // if (vendorId && item.vendor_catalog_items?.some((v: any) => v.vendor_id === vendorId)) {
        //   score = Math.min(1.0, score * 1.2)
        //   reason = 'vendor_boost'
        // }
        
        // Service line match bonus
        if (serviceLineId && item.service_line_id === parseInt(serviceLineId)) {
          score = Math.min(1.0, score * 1.1)
          reason = reason === 'vendor_boost' ? 'vendor_boost' : 'band_bonus'
        }
        
        return {
          id: item.id,
          name: item.canonical_name,
          score: Math.max(0.0, Math.min(1.0, score)),
          reason: reason
        }
      })
    } else {
      // No fuzzy results - scope-aware fallbacks
      let fallbackItems: any[] = [];
      let fallbackError: any = null;
      let fallbackReason = 'popular';
      
      if (serviceLineId) {
        const result = await supabase
          .from('canonical_items')
          .select('id, canonical_name, popularity, service_line_id')
          .eq('is_active', true)
          .eq('service_line_id', parseInt(serviceLineId))
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
        fallbackReason = 'popular';
      } else if (serviceTypeId) {
        const result = await supabase
          .from('canonical_items')
          .select('id, canonical_name, popularity, service_line_id, service_lines!inner(service_type_id)')
          .eq('service_lines.service_type_id', parseInt(serviceTypeId))
          .eq('is_active', true)
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
        fallbackReason = 'popular';
      } else if (vendorId) {
        // Get popular items for specific vendor
        const result = await supabase
          .from('canonical_items')
          .select(`
            id, canonical_name, popularity,
            vendor_catalog_items!inner(vendor_id)
          `)
          .eq('vendor_catalog_items.vendor_id', vendorId)
          .eq('is_active', true)
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
        fallbackReason = 'vendor_popular';
      } else {
        const result = await supabase
          .from('canonical_items')
          .select('id, canonical_name, popularity, service_line_id')
          .eq('is_active', true)
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
      }


      if (!fallbackError && fallbackItems && fallbackItems.length > 0) {
        suggestions = fallbackItems.map((item, index) => ({
          id: item.id,
          name: item.canonical_name,
          score: Math.max(0.1, Math.min(1.0, 0.8 - (index * 0.1))),
          reason: fallbackReason
        }));
        reason = fallbackReason;
      }
    }

    // Performance telemetry in dev/staging
    const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000 // Convert to ms
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[suggest_items] {q:"${q}", vendorId:"${vendorId || 'none'}", lineId:"${serviceLineId || 'none'}", typeId:"${serviceTypeId || 'none'}", resultCount:${suggestions.length}, ms:${elapsed.toFixed(1)}}`)
      // Perf target: p95 < 200ms, p99 < 350ms on staging dataset
      if (elapsed > 200) {
        console.warn(`[suggest_items] SLOW QUERY: ${elapsed.toFixed(1)}ms > 200ms target`)
      }
    }

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