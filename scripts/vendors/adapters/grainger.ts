/**
 * Grainger Vendor Adapter
 * Uses search API endpoint with stable selectors
 */

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

interface FetchOptions {
  vendor_id: 'grainger'
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

const RATE_LIMIT_MS = 3500 // Grainger-specific rate limit
const USER_AGENT = process.env.AUTOFETCH_UA || 'Mozilla/5.0 (compatible; AutofetchBot/1.0)'

export async function fetchVendorItems(opts: FetchOptions): Promise<VendorItem[]> {
  const items: VendorItem[] = []
  const perQuery = Math.ceil(opts.limit / opts.queries.length)
  
  for (const query of opts.queries) {
    if (items.length >= opts.limit) break
    
    try {
      console.log(`  🔍 Grainger: "${query}"`)
      
      const searchUrl = `https://www.grainger.com/search?searchQuery=${encodeURIComponent(query)}&searchType=productSearch`
      
      const response = await fetch(searchUrl, {
        timeout: opts.timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      })
      
      if (!response.ok) {
        console.warn(`    ⚠️  HTTP ${response.status}`)
        continue
      }
      
      const html = await response.text()
      const $ = cheerio.load(html)
      
      // Grainger product selectors - these may need updates
      $('.search-results .search-results-products .product-card').each((i, elem) => {
        if (items.length >= opts.limit) return false
        
        const $elem = $(elem)
        const name = $elem.find('[data-testid="product-title"]').text().trim()
        const priceText = $elem.find('[data-testid="product-price"]').text().trim()
        const sku = $elem.find('[data-testid="product-id"]').text().trim()
        const relativeUrl = $elem.find('a').first().attr('href')
        
        if (!name) return
        
        // Parse price
        let price: number | undefined
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/)
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(/,/g, ''))
        }
        
        // Build full URL
        const url = relativeUrl ? `https://www.grainger.com${relativeUrl}` : undefined
        
        items.push({
          name: name.substring(0, 200), // Truncate long names
          price,
          sku: sku || undefined,
          url,
          line: opts.line
        })
      })
      
      console.log(`    📊 Found ${items.length} items so far`)
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
      
    } catch (error) {
      console.warn(`    ❌ Query "${query}" failed:`, error)
    }
  }
  
  return items.slice(0, opts.limit)
}