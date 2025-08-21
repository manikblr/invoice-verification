#!/usr/bin/env node
/**
 * Efficient batch import of FM_materials_equipment_filled.xlsx
 * Uses batch inserts for better performance
 */

require('dotenv').config()
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

async function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function getServiceLineMap(supabase) {
  console.log('🔧 Getting service line mappings...')
  
  const { data: serviceLines } = await supabase
    .from('service_lines')
    .select('id, name')
  
  const map = {}
  serviceLines?.forEach(line => {
    map[line.name.toLowerCase()] = line.id
    map[line.name] = line.id // Also store exact case
  })
  
  console.log(`📋 Found ${Object.keys(map).length / 2} service lines`)
  return map
}

async function batchInsertItems(supabase, items, batchSize = 500) {
  console.log(`📦 Batch inserting ${items.length} items in batches of ${batchSize}...`)
  
  let inserted = 0
  let errors = 0
  let duplicates = 0
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    try {
      const { data, error } = await supabase
        .from('canonical_items')
        .insert(batch)
        .select('id')
      
      if (error) {
        // Handle batch errors - might be duplicates
        if (error.message.includes('duplicate') || error.message.includes('unique constraint')) {
          duplicates += batch.length
          console.log(`  ⚠️  Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} duplicates`)
        } else {
          errors += batch.length
          console.log(`  ❌ Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`)
        }
      } else {
        inserted += data?.length || 0
        console.log(`  ✅ Batch ${Math.floor(i/batchSize) + 1}: ${data?.length || 0} inserted`)
      }
      
    } catch (batchError) {
      console.log(`  ❌ Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`)
      errors += batch.length
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  return { inserted, duplicates, errors }
}

async function main() {
  console.log('🚀 Starting efficient FM Materials & Equipment import...')
  
  try {
    // Read Excel file
    console.log('📋 Reading FM_materials_equipment_filled.xlsx...')
    const workbook = XLSX.readFile('/Users/maniksingla/invoice verification/FM_materials_equipment_filled.xlsx')
    const worksheet = workbook.Sheets['Items']
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    console.log(`📊 Found ${data.length} rows to process`)
    
    // Get Supabase client and service line mappings
    const supabase = await getSupabaseClient()
    const serviceLineMap = await getServiceLineMap(supabase)
    
    // Process and prepare items for batch insert
    console.log('🔄 Preparing items for batch insert...')
    
    const itemsToInsert = []
    const processedNames = new Set() // Avoid duplicates within this import
    
    for (const row of data) {
      const itemName = row.ITEM_NAME?.toString().trim()
      const serviceLine = row.SERVICE_LINE?.toString().trim()
      const itemKind = row.ITEM_KIND?.toString().toLowerCase().trim()
      
      // Skip invalid rows
      if (!itemName || itemName.length < 2) continue
      if (!['material', 'equipment'].includes(itemKind)) continue
      
      // Skip duplicates within this batch
      const nameKey = `${itemName}|${itemKind}`
      if (processedNames.has(nameKey)) continue
      processedNames.add(nameKey)
      
      // Determine service line ID
      let serviceLineId = serviceLineMap[serviceLine] || 
                         serviceLineMap[serviceLine?.toLowerCase()] || 
                         14 // Default to Plumbing
      
      itemsToInsert.push({
        canonical_name: itemName,
        kind: itemKind,
        service_line_id: serviceLineId,
        popularity: 1,
        is_active: true
      })
    }
    
    console.log(`📦 Prepared ${itemsToInsert.length} unique items for import`)
    
    // Show breakdown
    const kindBreakdown = itemsToInsert.reduce((acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1
      return acc
    }, {})
    
    console.log('🏷️  Kind breakdown:')
    Object.entries(kindBreakdown).forEach(([kind, count]) => {
      console.log(`   • ${kind}: ${count}`)
    })
    
    // Batch insert
    const result = await batchInsertItems(supabase, itemsToInsert)
    
    console.log('\n🎉 BATCH IMPORT COMPLETE!')
    console.log(`📊 Results:`)
    console.log(`   • ${result.inserted} items imported`)
    console.log(`   • ${result.duplicates} duplicates skipped`)
    console.log(`   • ${result.errors} errors`)
    
    // Verify total count
    const { data: totalItems } = await supabase
      .from('canonical_items')
      .select('id')
    
    console.log(`\n✅ Total canonical_items in database: ${totalItems?.length || 0}`)
    
    // Show final breakdown by kind
    const { data: finalBreakdown } = await supabase
      .from('canonical_items') 
      .select('kind')
    
    if (finalBreakdown) {
      const counts = finalBreakdown.reduce((acc, item) => {
        acc[item.kind] = (acc[item.kind] || 0) + 1
        return acc
      }, {})
      
      console.log('📈 Final database breakdown by kind:')
      Object.entries(counts).forEach(([kind, count]) => {
        console.log(`   • ${kind}: ${count}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}