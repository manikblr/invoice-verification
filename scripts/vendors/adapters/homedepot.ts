/**
 * Home Depot Vendor Adapter
 * Uses public search API with JSON responses
 */

import fetch from 'node-fetch'

interface FetchOptions {
  vendor_id: 'homedepot'
  line: 'Plumbing' | 'Electrical' | 'Handyman'
  queries: string[]
  limit: number
  qps: number
  timeoutMs: number
}

interface VendorItem {
  name: string
  price?: number
  unit?: string
  sku?: string
  url?: string
  line: string
}

const RATE_LIMIT_MS = 2000 // Home Depot specific
const USER_AGENT = process.env.AUTOFETCH_UA || 'Mozilla/5.0 (compatible; AutofetchBot/1.0)'

export async function fetchVendorItems(opts: FetchOptions): Promise<VendorItem[]> {
  const items: VendorItem[] = []
  const perQuery = Math.ceil(opts.limit / opts.queries.length)
  
  for (const query of opts.queries) {
    if (items.length >= opts.limit) break
    
    try {
      console.log(`  🔍 HomeDepot: "${query}"`)
      
      // Home Depot search API endpoint
      const searchUrl = `https://www.homedepot.com/s/${encodeURIComponent(query)}?NCNI-5`
      
      const response = await fetch(searchUrl, {
        timeout: opts.timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      })
      
      if (!response.ok) {
        console.warn(`    ⚠️  HTTP ${response.status}`)
        continue
      }
      
      const html = await response.text()
      
      // Extract JSON data from page (Home Depot embeds product data)
      const jsonMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});/)
      if (!jsonMatch) {
        console.warn(`    ⚠️  No product data found`)
        continue
      }
      
      try {
        const apolloState = JSON.parse(jsonMatch[1])
        
        // Parse Apollo state for products
        Object.entries(apolloState).forEach(([key, data]: [string, any]) => {
          if (items.length >= opts.limit) return
          
          if (key.startsWith('Product:') && data.identifiers?.productId) {
            const name = data.identifiers?.productLabel || data.basicInfo?.productTitle
            if (!name) return
            
            let price: number | undefined
            if (data.pricing?.originalPrice) {
              price = parseFloat(data.pricing.originalPrice)
            } else if (data.pricing?.specialPrice) {
              price = parseFloat(data.pricing.specialPrice)
            }
            
            const sku = data.identifiers.productId
            const url = data.identifiers?.canonicalUrl 
              ? `https://www.homedepot.com${data.identifiers.canonicalUrl}`
              : undefined
            
            items.push({
              name: name.substring(0, 200),
              price,
              sku,
              url,
              line: opts.line
            })
          }
        })
      } catch (parseError) {
        console.warn(`    ⚠️  JSON parse failed:`, parseError)
      }
      
      console.log(`    📊 Found ${items.length} items so far`)
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
      
    } catch (error) {
      console.warn(`    ❌ Query "${query}" failed:`, error)
    }
  }
  
  return items.slice(0, opts.limit)
}