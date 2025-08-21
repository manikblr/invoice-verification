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

    // Build enhanced query with vendor catalog data
    let query = supabase
      .from('canonical_items')
      .select(`
        id, 
        canonical_name, 
        popularity,
        kind,
        service_line_id,
        service_lines(id, name),
        vendor_catalog_items(vendor_id, name, vendor_sku)
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
    
    // If we have fewer than 4 results, try synonym search as well
    let synonymItems: any[] = []
    if (items && items.length < 4 && q.length >= 3) {
      const { data: synonymResults } = await supabase
        .from('canonical_items')
        .select(`
          id, canonical_name, popularity, kind, service_line_id,
          service_lines(name),
          vendor_catalog_items(vendor_id, name, vendor_sku),
          item_synonyms!inner(synonym)
        `)
        .ilike('item_synonyms.synonym', `${q}%`)
        .eq('is_active', true)
        .order('popularity', { ascending: false })
        .limit(4)
      
      if (synonymResults) {
        synonymItems = synonymResults.filter(item => 
          !items?.some(existing => existing.id === item.id) // Avoid duplicates
        )
      }
    }

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

    // Combine primary and synonym results
    const allItems = [...(items || []), ...synonymItems]

    if (allItems && allItems.length > 0) {
      // Enhanced scoring with vendor data and item kind
      suggestions = allItems.map((item: any, index) => {
        let score = Math.max(0.1, 1 - (index * 0.1))
        let reason = index < (items?.length || 0) ? 'fuzzy' : 'synonym'
        
        // Vendor boost - now enabled with real data
        if (vendorId && item.vendor_catalog_items?.some((v: any) => v.vendor_id === vendorId)) {
          score = Math.min(1.0, score * 1.3) // Stronger boost for vendor matches
          reason = 'vendor_boost'
        }
        
        // Service line match bonus
        if (serviceLineId && item.service_line_id === parseInt(serviceLineId)) {
          score = Math.min(1.0, score * 1.1)
          reason = reason === 'vendor_boost' ? 'vendor_boost' : 'service_line_bonus'
        }
        
        // Equipment items get slight boost (usually more valuable/specific)
        if (item.kind === 'equipment') {
          score = Math.min(1.0, score * 1.05)
          reason = reason === 'vendor_boost' ? 'vendor_boost' : 
                   reason === 'service_line_bonus' ? 'service_line_bonus' : 'equipment_boost'
        }
        
        // High popularity boost
        if (item.popularity && item.popularity > 10) {
          score = Math.min(1.0, score * 1.08)
        }
        
        // Build result with enhanced metadata
        const result: any = {
          id: item.id,
          name: item.canonical_name,
          score: Math.max(0.0, Math.min(1.0, score)),
          reason: reason
        }
        
        // Add vendor info if available
        if (item.vendor_catalog_items && item.vendor_catalog_items.length > 0) {
          result.vendors = item.vendor_catalog_items.map((v: any) => ({
            vendor_id: v.vendor_id,
            vendor_name: v.name
          }))
        }
        
        // Add kind for UI differentiation
        if (item.kind) {
          result.kind = item.kind
        }
        
        // Add service line context
        if (item.service_lines) {
          result.service_line = item.service_lines.name
        }
        
        return result
      })
    } else {
      // No fuzzy results - scope-aware fallbacks
      let fallbackItems: any[] = [];
      let fallbackError: any = null;
      let fallbackReason = 'popular';
      
      if (serviceLineId) {
        const result = await supabase
          .from('canonical_items')
          .select(`
            id, canonical_name, popularity, kind, service_line_id,
            service_lines(name),
            vendor_catalog_items(vendor_id, name, vendor_sku)
          `)
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
          .select(`
            id, canonical_name, popularity, kind, service_line_id,
            service_lines!inner(service_type_id, name),
            vendor_catalog_items(vendor_id, name, vendor_sku)
          `)
          .eq('service_lines.service_type_id', parseInt(serviceTypeId))
          .eq('is_active', true)
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
        fallbackReason = 'popular';
      } else if (vendorId) {
        // Get popular items for specific vendor with enhanced data
        const result = await supabase
          .from('canonical_items')
          .select(`
            id, canonical_name, popularity, kind,
            service_lines(name),
            vendor_catalog_items!inner(vendor_id, name, vendor_sku)
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
          .select(`
            id, canonical_name, popularity, kind, service_line_id,
            service_lines(name),
            vendor_catalog_items(vendor_id, name, vendor_sku)
          `)
          .eq('is_active', true)
          .order('popularity', { ascending: false })
          .limit(8);
        fallbackItems = result.data || [];
        fallbackError = result.error;
      }


      if (!fallbackError && fallbackItems && fallbackItems.length > 0) {
        suggestions = fallbackItems.map((item: any, index) => {
          let score = Math.max(0.1, Math.min(1.0, 0.8 - (index * 0.1)))
          
          // Apply same scoring boosts as fuzzy results
          if (vendorId && item.vendor_catalog_items?.some((v: any) => v.vendor_id === vendorId)) {
            score = Math.min(1.0, score * 1.3)
          }
          
          if (item.kind === 'equipment') {
            score = Math.min(1.0, score * 1.05)
          }
          
          // Build enhanced result
          const result: any = {
            id: item.id,
            name: item.canonical_name,
            score: Math.max(0.1, Math.min(1.0, score)),
            reason: fallbackReason
          }
          
          // Add metadata
          if (item.vendor_catalog_items && item.vendor_catalog_items.length > 0) {
            result.vendors = item.vendor_catalog_items.map((v: any) => ({
              vendor_id: v.vendor_id,
              vendor_name: v.name
            }))
          }
          
          if (item.kind) {
            result.kind = item.kind
          }
          
          if (item.service_lines) {
            result.service_line = item.service_lines.name
          }
          
          return result
        });
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