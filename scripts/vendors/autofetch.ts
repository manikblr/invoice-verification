#!/usr/bin/env ts-node
/**
 * Vendor Autofetch - Direct writes to production tables
 * Pulls item names + prices from 6 vendors for Plumbing/Electrical/Handyman
 */

import { createClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'

// Vendor adapters - use require for CommonJS compatibility  
const VENDOR_FETCHERS: Record<VendorId, any> = {} as any

type ServiceLine = 'Plumbing' | 'Electrical' | 'Handyman'
type VendorId = 'grainger' | 'msc' | 'zoro' | 'fastenal' | 'amazon' | 'homedepot'

interface VendorItem {
  name: string
  price?: number
  unit?: string
  sku?: string
  url?: string
  line: string
}

interface CliArgs {
  vendors: VendorId[]
  lines: ServiceLine[]
  limit: number
  qps: number
  timeoutMs: number
}

// Lazy load vendor fetchers
async function getVendorFetcher(vendor_id: VendorId) {
  if (!VENDOR_FETCHERS[vendor_id]) {
    try {
      const module = await import(`./adapters/${vendor_id}`)
      VENDOR_FETCHERS[vendor_id] = module.fetchVendorItems
    } catch (error) {
      console.error(`Failed to load ${vendor_id} adapter:`, error)
      throw error
    }
  }
  return VENDOR_FETCHERS[vendor_id]
}

const SEED_QUERIES: Record<ServiceLine, string[]> = {
  Plumbing: ['pipe wrench', 'pvc pipe', 'teflon tape', 'pipe fitting', 'ball valve'],
  Electrical: ['mc breaker', 'copper wire', 'junction box', 'electrical outlet', 'wire nut'],
  Handyman: ['silicone sealant', 'hacksaw blade', 'anchor bolt', 'screwdriver set', 'level tool']
}

// Database client selection
async function getDbClient() {
  if (process.env.DATABASE_URL) {
    const client = new PgClient({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    return { client, mode: 'pg' as const }
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { client: supabase, mode: 'supabase' as const }
}

// DB Helper: Ensure service line exists
async function ensureLine(lineName: ServiceLine, db: any): Promise<{service_type_id: string, service_line_id: string}> {
  const slug = lineName.toLowerCase()
  
  if (db.mode === 'pg') {
    // First ensure service_type
    const typeResult = await db.client.query(`
      INSERT INTO service_types (name, slug) 
      VALUES ($1, $2) 
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name 
      RETURNING id
    `, [lineName, slug])
    
    const service_type_id = typeResult.rows[0].id
    
    // Then ensure service_line
    const lineResult = await db.client.query(`
      INSERT INTO service_lines (service_type_id, name, slug, active) 
      VALUES ($1, $2, $3, true) 
      ON CONFLICT (service_type_id, slug) DO UPDATE SET name=EXCLUDED.name 
      RETURNING id
    `, [service_type_id, lineName, slug])
    
    return { service_type_id, service_line_id: lineResult.rows[0].id }
  }
  
  // Supabase fallback
  const { data: typeData, error: typeError } = await db.client
    .from('service_types')
    .upsert({ name: lineName, slug }, { onConflict: 'slug' })
    .select('id')
    .single()
  
  if (typeError) throw typeError
  
  const { data: lineData, error: lineError } = await db.client
    .from('service_lines')
    .upsert({ 
      service_type_id: typeData.id, 
      name: lineName, 
      slug, 
      active: true 
    }, { onConflict: 'service_type_id,slug' })
    .select('id')
    .single()
  
  if (lineError) throw lineError
  
  return { service_type_id: typeData.id, service_line_id: lineData.id }
}

// DB Helper: Resolve item by name/synonym/fuzzy match
async function resolveItemId(name: string, service_line_id: string, db: any): Promise<{item_id?: string, match: 'exact'|'synonym'|'fuzzy'|'none', confidence: number}> {
  const normalizedName = name.trim().replace(/\s+/g, ' ').normalize('NFC')
  
  if (db.mode === 'pg') {
    // Exact match
    let result = await db.client.query(`
      SELECT id FROM canonical_items 
      WHERE LOWER(canonical_name) = LOWER($1) AND service_line_id = $2
    `, [normalizedName, service_line_id])
    
    if (result.rows.length > 0) {
      return { item_id: result.rows[0].id, match: 'exact', confidence: 1.0 }
    }
    
    // Synonym match
    result = await db.client.query(`
      SELECT ci.id FROM canonical_items ci
      JOIN item_synonyms s ON s.canonical_item_id = ci.id
      WHERE LOWER(s.synonym) = LOWER($1) AND ci.service_line_id = $2
    `, [normalizedName, service_line_id])
    
    if (result.rows.length > 0) {
      return { item_id: result.rows[0].id, match: 'synonym', confidence: 0.95 }
    }
    
    // Fuzzy match
    result = await db.client.query(`
      SELECT id, SIMILARITY(canonical_name, $1) as score 
      FROM canonical_items 
      WHERE service_line_id = $2 AND SIMILARITY(canonical_name, $1) >= 0.86
      ORDER BY score DESC LIMIT 1
    `, [normalizedName, service_line_id])
    
    if (result.rows.length > 0) {
      return { item_id: result.rows[0].id, match: 'fuzzy', confidence: result.rows[0].score }
    }
    
    return { match: 'none', confidence: 0.0 }
  }
  
  // Supabase fallback - exact match only for simplicity
  const { data, error } = await db.client
    .from('canonical_items')
    .select('id')
    .ilike('canonical_name', normalizedName)
    .eq('service_line_id', service_line_id)
    .limit(1)
    .single()
  
  if (!error && data) {
    return { item_id: data.id, match: 'exact', confidence: 1.0 }
  }
  
  return { match: 'none', confidence: 0.0 }
}

// DB Helper: Upsert vendor catalog row
async function upsertVendorRow(vendor_id: VendorId, item_id: string, patch: {price?: number, unit?: string, sku?: string, url?: string}, db: any): Promise<void> {
  if (db.mode === 'pg') {
    await db.client.query(`
      INSERT INTO vendor_catalog_items (vendor_id, canonical_item_id, min_price, max_price, unit, sku, url, last_seen_at)
      VALUES ($1, $2, $3, $3, $4, $5, $6, NOW())
      ON CONFLICT (vendor_id, canonical_item_id) DO UPDATE SET
        min_price = LEAST(vendor_catalog_items.min_price, EXCLUDED.min_price),
        max_price = GREATEST(vendor_catalog_items.max_price, EXCLUDED.max_price),
        unit = COALESCE(EXCLUDED.unit, vendor_catalog_items.unit),
        sku = COALESCE(EXCLUDED.sku, vendor_catalog_items.sku),
        url = COALESCE(EXCLUDED.url, vendor_catalog_items.url),
        last_seen_at = NOW()
    `, [vendor_id, item_id, patch.price || 0, patch.unit, patch.sku, patch.url])
  } else {
    // Supabase upsert
    await db.client
      .from('vendor_catalog_items')
      .upsert({
        vendor_id,
        canonical_item_id: item_id,
        min_price: patch.price || 0,
        max_price: patch.price || 0,
        unit: patch.unit,
        sku: patch.sku,
        url: patch.url,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'vendor_id,canonical_item_id' })
  }
}

// DB Helper: Bump item popularity
async function bumpPopularity(item_id: string, by: number, db: any): Promise<void> {
  if (db.mode === 'pg') {
    await db.client.query(`
      UPDATE canonical_items 
      SET popularity = GREATEST(popularity, popularity + $2)
      WHERE id = $1
    `, [item_id, by])
  } else {
    // Note: Supabase doesn't support GREATEST in updates easily, so just increment
    await db.client.rpc('increment_popularity', { item_id, amount: by })
  }
}

// Get seed queries for a service line
async function getSeedQueries(line: ServiceLine, db: any): Promise<string[]> {
  const { service_line_id } = await ensureLine(line, db)
  
  if (db.mode === 'pg') {
    const result = await db.client.query(`
      SELECT canonical_name FROM canonical_items 
      WHERE service_line_id = $1 AND popularity > 0
      ORDER BY popularity DESC LIMIT 10
    `, [service_line_id])
    
    if (result.rows.length >= 3) {
      return result.rows.map((r: any) => r.canonical_name)
    }
  }
  
  return SEED_QUERIES[line]
}

// Process items from a vendor for a service line
async function processVendorItems(
  vendor_id: VendorId, 
  line: ServiceLine, 
  items: VendorItem[], 
  db: any
): Promise<{matched: number, proposed: number, errors: number, unmatched: string[]}> {
  const { service_line_id } = await ensureLine(line, db)
  
  let matched = 0, proposed = 0, errors = 0
  const unmatched: string[] = []
  
  for (const item of items) {
    try {
      const resolution = await resolveItemId(item.name, service_line_id, db)
      
      if (resolution.item_id) {
        await upsertVendorRow(vendor_id, resolution.item_id, {
          price: item.price,
          unit: item.unit,
          sku: item.sku,
          url: item.url
        }, db)
        
        await bumpPopularity(resolution.item_id, 1, db)
        matched++
      } else {
        // TODO: Create agent_proposal for unmatched items
        proposed++
        unmatched.push(item.name)
      }
    } catch (error) {
      console.error(`Error processing item ${item.name}:`, error)
      errors++
    }
  }
  
  return { matched, proposed, errors, unmatched: unmatched.slice(0, 5) }
}

// Parse CLI arguments
function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const result: Partial<CliArgs> = {}
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '')
    const value = args[i + 1]
    
    switch (key) {
      case 'vendors':
        result.vendors = value?.split(',') as VendorId[]
        break
      case 'lines':
        result.lines = value?.split(',') as ServiceLine[]
        break
      case 'limit':
        result.limit = parseInt(value || '150')
        break
      case 'qps':
        result.qps = parseFloat(value || '0.3')
        break
      case 'timeoutMs':
        result.timeoutMs = parseInt(value || '12000')
        break
    }
  }
  
  return {
    vendors: result.vendors || ['grainger', 'msc', 'zoro', 'fastenal', 'amazon', 'homedepot'],
    lines: result.lines || ['Plumbing', 'Electrical', 'Handyman'],
    limit: result.limit || 150,
    qps: result.qps || 0.3,
    timeoutMs: result.timeoutMs || 12000
  }
}

// Main execution
async function main() {
  const args = parseArgs()
  const db = await getDbClient()
  
  console.log(`🚀 Starting vendor autofetch for ${args.vendors.length} vendors × ${args.lines.length} lines`)
  
  const results: Record<string, Record<string, any>> = {}
  
  for (const vendor_id of args.vendors) {
    results[vendor_id] = {}
    const fetcher = await getVendorFetcher(vendor_id)
    
    for (const line of args.lines) {
      console.log(`📦 Processing ${vendor_id} → ${line}`)
      
      try {
        const queries = await getSeedQueries(line, db)
        const items = await fetcher({
          vendor_id,
          line,
          queries,
          limit: args.limit,
          qps: args.qps,
          timeoutMs: args.timeoutMs
        })
        
        const result = await processVendorItems(vendor_id, line, items, db)
        results[vendor_id][line] = result
        
        console.log(`  ✅ ${result.matched} matched, ${result.proposed} proposed, ${result.errors} errors`)
        
        // Rate limiting between vendor×line combinations
        await new Promise(resolve => setTimeout(resolve, 1000 / args.qps))
        
      } catch (error) {
        console.error(`  ❌ Failed ${vendor_id} × ${line}:`, error)
        results[vendor_id][line] = { matched: 0, proposed: 0, errors: 1, unmatched: [] }
      }
    }
  }
  
  // Summary report
  console.log('\n📊 SUMMARY:')
  for (const [vendor_id, vendorResults] of Object.entries(results)) {
    console.log(`\n${vendor_id.toUpperCase()}:`)
    for (const [line, result] of Object.entries(vendorResults)) {
      console.log(`  ${line}: ${result.matched}M/${result.proposed}P/${result.errors}E`)
      if (result.unmatched?.length > 0) {
        console.log(`    Unmatched: ${result.unmatched.join(', ')}`)
      }
    }
  }
  
  if (db.mode === 'pg') {
    await db.client.end()
  }
}

if (require.main === module) {
  main().catch(console.error)
}