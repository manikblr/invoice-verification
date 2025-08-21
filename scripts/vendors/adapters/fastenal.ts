/**
 * Fastenal Vendor Adapter
 */

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

interface FetchOptions {
  vendor_id: 'fastenal'
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

const RATE_LIMIT_MS = 3500
const USER_AGENT = process.env.AUTOFETCH_UA || 'Mozilla/5.0 (compatible; AutofetchBot/1.0)'

export async function fetchVendorItems(opts: FetchOptions): Promise<VendorItem[]> {
  const items: VendorItem[] = []
  
  for (const query of opts.queries) {
    if (items.length >= opts.limit) break
    
    try {
      console.log(`  🔍 Fastenal: "${query}"`)
      
      const searchUrl = `https://www.fastenal.com/search?query=${encodeURIComponent(query)}`
      
      const response = await fetch(searchUrl, {
        timeout: opts.timeoutMs,
        headers: { 'User-Agent': USER_AGENT }
      })
      
      if (!response.ok) continue
      
      const html = await response.text()
      const $ = cheerio.load(html)
      
      $('.product-result').each((i, elem) => {
        if (items.length >= opts.limit) return false
        
        const $elem = $(elem)
        const name = $elem.find('.product-name').text().trim()
        const priceText = $elem.find('.price').text().trim()
        const sku = $elem.find('.part-number').text().trim()
        
        if (!name) return
        
        const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/)
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined
        
        items.push({
          name: name.substring(0, 200),
          price,
          sku: sku || undefined,
          url: $elem.find('a').first().attr('href'),
          line: opts.line
        })
      })
      
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
      
    } catch (error) {
      console.warn(`    ❌ Query "${query}" failed:`, error)
    }
  }
  
  return items.slice(0, opts.limit)
}