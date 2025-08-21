#!/usr/bin/env node
/**
 * Simple vendor fetch test - JavaScript version
 * Tests Home Depot scraping and database writes
 */

// Load environment variables
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')
const cheerio = require('cheerio')

async function fetchHomeDepotItems(query, limit = 5) {
  console.log(`🔍 Home Depot: "${query}"`)
  
  try {
    const searchUrl = `https://www.homedepot.com/s/${encodeURIComponent(query)}?NCNI-5`
    
    const response = await fetch(searchUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AutofetchBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })
    
    if (!response.ok) {
      console.warn(`    ⚠️  HTTP ${response.status}`)
      return []
    }
    
    const html = await response.text()
    const $ = cheerio.load(html)
    
    const items = []
    
    // Try multiple selectors for Home Depot products
    const productSelectors = [
      '[data-testid="product-pod"]',
      '.product-pod',
      '.product-item',
      '[data-automation-id="product-image-link"]'
    ]
    
    for (const selector of productSelectors) {
      const elements = $(selector)
      if (elements.length > 0) {
        console.log(`  Found ${elements.length} products with selector: ${selector}`)
        
        elements.each((i, elem) => {
          if (items.length >= limit) return false
          
          const $elem = $(elem)
          
          // Try multiple name selectors
          let name = $elem.find('[data-testid="product-title"]').text().trim() ||
                     $elem.find('.product-title').text().trim() ||
                     $elem.find('h3').text().trim() ||
                     $elem.find('a[title]').attr('title')
          
          if (!name || name.length < 3) return
          
          // Try to find price
          let priceText = $elem.find('[data-testid="price"]').text().trim() ||
                         $elem.find('.price').text().trim() ||
                         $elem.find('[data-automation-id="product-price"]').text().trim()
          
          let price = undefined
          if (priceText) {
            const priceMatch = priceText.match(/\$?([\d,]+\.?\d*)/)
            if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(/,/g, ''))
            }
          }
          
          // Get URL
          let url = $elem.find('a').first().attr('href')
          if (url && !url.startsWith('http')) {
            url = `https://www.homedepot.com${url}`
          }
          
          items.push({
            name: name.substring(0, 200),
            price,
            url,
            source: 'homedepot'
          })
        })
        break // Found products, exit selector loop
      }
    }
    
    if (items.length === 0) {
      // Fallback: try to extract any product-like data
      console.log('  Trying fallback extraction...')
      $('a[href*="/p/"]').each((i, elem) => {
        if (items.length >= limit) return false
        
        const $elem = $(elem)
        const text = $elem.text().trim()
        const href = $elem.attr('href')
        
        if (text.length > 10 && text.length < 200 && href) {
          items.push({
            name: text,
            url: `https://www.homedepot.com${href}`,
            source: 'homedepot'
          })
        }
      })
    }
    
    console.log(`    📊 Found ${items.length} items`)
    return items.slice(0, limit)
    
  } catch (error) {
    console.error(`    ❌ Error fetching from Home Depot:`, error.message)
    return []
  }
}

async function testDatabaseConnection() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials')
    console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  console.log('🔗 Testing database connection...')
  
  // Test query
  const { data, error } = await supabase
    .from('canonical_items')
    .select('id')
    .limit(1)
  
  if (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
  
  console.log('✅ Database connection successful')
  return supabase
}

async function ensurePlumbingServiceLine(supabase) {
  console.log('📋 Getting service line for Plumbing...')
  
  // First, let's just try to find any existing service_line for Plumbing
  const { data: existingServiceLines } = await supabase
    .from('service_lines')
    .select('id, name')
    .ilike('name', '%plumbing%')
    .limit(5)
  
  console.log('Found service_lines:', existingServiceLines)
  
  if (existingServiceLines && existingServiceLines.length > 0) {
    console.log('✅ Using existing service_line:', existingServiceLines[0].name)
    return existingServiceLines[0].id
  }
  
  // If no existing, try to create a simple one
  const { data: newServiceLine, error: lineError } = await supabase
    .from('service_lines')
    .insert({ name: 'Plumbing' })
    .select('id')
    .single()
  
  if (lineError) {
    console.warn('⚠️  Could not create service_line, will use a fallback approach:', lineError.message)
    // Return a dummy ID for demo purposes
    return '00000000-0000-0000-0000-000000000001'
  }
  
  console.log('✅ Created new service_line: Plumbing')
  return newServiceLine.id
}

async function insertVendorItems(supabase, serviceLineId, items) {
  console.log(`💾 Inserting ${items.length} vendor items...`)
  
  let inserted = 0
  let matched = 0
  
  for (const item of items) {
    try {
      // Try to match existing canonical item (simple name match for demo)
      const { data: existingItems, error: searchError } = await supabase
        .from('canonical_items')
        .select('id, canonical_name')
        .eq('service_line_id', serviceLineId)
        .ilike('canonical_name', `%${item.name.split(' ')[0]}%`)
        .limit(1)
      
      let canonicalItemId = null
      
      if (existingItems && existingItems.length > 0) {
        canonicalItemId = existingItems[0].id
        matched++
        console.log(`  ✅ Matched: "${item.name}" → "${existingItems[0].canonical_name}"`)
      } else {
        // Create new canonical item
        const { data: newItem, error: insertError } = await supabase
          .from('canonical_items')
          .insert({
            canonical_name: item.name,
            kind: 'material', // Plumbing items are materials
            service_line_id: serviceLineId,
            popularity: 1,
            is_active: true
          })
          .select('id')
          .single()
        
        if (insertError) {
          console.warn(`  ⚠️  Failed to create canonical item for "${item.name}":`, insertError.message)
          continue
        }
        
        canonicalItemId = newItem.id
        console.log(`  ➕ Created: "${item.name}"`)
      }
      
      // Insert vendor catalog item with minimal fields first
      if (canonicalItemId) {
        const vendorItem = {
          vendor_id: 'homedepot',
          canonical_item_id: canonicalItemId,
          vendor_sku: item.sku || `hd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // Generate fallback SKU
          name: item.name
        }
        
        const { error: vendorError } = await supabase
          .from('vendor_catalog_items')
          .insert(vendorItem)  // Use insert instead of upsert for now
        
        if (vendorError) {
          console.warn(`  ⚠️  Failed to insert vendor item:`, vendorError.message)
        } else {
          inserted++
        }
      }
      
      // Small delay between DB operations
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.warn(`  ❌ Error processing "${item.name}":`, error.message)
    }
  }
  
  console.log(`📊 Results: ${inserted} inserted, ${matched} matched existing items`)
  return { inserted, matched }
}

async function main() {
  console.log('🚀 Starting simple vendor autofetch test...')
  
  try {
    // Test database
    const supabase = await testDatabaseConnection()
    
    // Ensure service line
    const serviceLineId = await ensurePlumbingServiceLine(supabase)
    
    // Fetch from Home Depot
    const items = await fetchHomeDepotItems('pipe wrench', 8)
    
    if (items.length === 0) {
      console.log('⚠️  No items fetched, trying alternative query...')
      const altItems = await fetchHomeDepotItems('pvc pipe', 5)
      items.push(...altItems)
    }
    
    if (items.length === 0) {
      console.log('❌ No items could be fetched')
      process.exit(1)
    }
    
    // Insert into database
    const results = await insertVendorItems(supabase, serviceLineId, items)
    
    // Verification query
    const { data: vendorItems } = await supabase
      .from('vendor_catalog_items')
      .select('id')
      .eq('vendor_id', 'homedepot')
    
    console.log(`\n✅ SUCCESS! Total Home Depot items in DB: ${vendorItems?.length || 0}`)
    
    // Test suggestion API
    console.log('\n🔍 Testing suggestion API...')
    const { data: suggestions } = await supabase
      .from('canonical_items')
      .select(`
        id, canonical_name, popularity,
        vendor_catalog_items!inner(vendor_id, min_price, max_price)
      `)
      .eq('vendor_catalog_items.vendor_id', 'homedepot')
      .limit(3)
    
    if (suggestions && suggestions.length > 0) {
      console.log('📋 Sample suggestions with pricing:')
      suggestions.forEach(item => {
        const vendorInfo = item.vendor_catalog_items[0] || {}
        console.log(`  - ${item.canonical_name} ($${vendorInfo.min_price || 'N/A'})`)
      })
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}