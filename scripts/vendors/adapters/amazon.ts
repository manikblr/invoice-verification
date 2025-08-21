/**
 * Amazon Vendor Adapter  
 * Limited scraping with strict rate limits and UA compliance
 */

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

interface FetchOptions {
  vendor_id: 'amazon'
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

const RATE_LIMIT_MS = 5000 // Very conservative for Amazon
const USER_AGENT = process.env.AUTOFETCH_UA || 'Mozilla/5.0 (compatible; AutofetchBot/1.0)'

export async function fetchVendorItems(opts: FetchOptions): Promise<VendorItem[]> {
  const items: VendorItem[] = []
  const perQuery = Math.ceil(opts.limit / opts.queries.length)
  
  // Amazon category mapping for better results
  const categoryMap: Record<string, string> = {
    'Plumbing': 'industrial-scientific',
    'Electrical': 'industrial-scientific', 
    'Handyman': 'tools-home-improvement'
  }
  
  for (const query of opts.queries.slice(0, 3)) { // Limit Amazon queries
    if (items.length >= opts.limit) break
    
    try {
      console.log(`  🔍 Amazon: "${query}"`)
      
      const category = categoryMap[opts.line] || 'industrial-scientific'
      const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=${category}&ref=sr_pg_1`
      
      const response = await fetch(searchUrl, {
        timeout: opts.timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
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
      
      // Amazon search result selectors (conservative approach)
      $('[data-component-type="s-search-result"]').each((i, elem) => {
        if (items.length >= opts.limit) return false
        if (i >= 10) return false // Limit per query
        
        const $elem = $(elem)
        const name = $elem.find('h2 a span').first().text().trim()
        const priceText = $elem.find('.a-price-whole').first().text().trim()
        const asin = $elem.attr('data-asin')
        
        if (!name || !asin) return
        
        // Parse price
        let price: number | undefined
        if (priceText) {
          const cleanPrice = priceText.replace(/[,$]/g, '')
          const numericPrice = parseFloat(cleanPrice)
          if (!isNaN(numericPrice)) {
            price = numericPrice
          }
        }
        
        const url = `https://www.amazon.com/dp/${asin}`
        
        items.push({
          name: name.substring(0, 200),
          price,
          sku: asin,
          url,
          line: opts.line
        })
      })
      
      console.log(`    📊 Found ${items.length} items so far`)
      
      // Conservative rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
      
    } catch (error) {
      console.warn(`    ❌ Query "${query}" failed:`, error)
    }
  }
  
  return items.slice(0, opts.limit)
}