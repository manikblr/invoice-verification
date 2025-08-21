#!/usr/bin/env node
/**
 * Focused import of Equipment items from FM data
 * Also imports materials that don't match existing items exactly
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

async function getExistingItems(supabase) {
  console.log('📋 Loading existing items for duplicate detection...')
  
  const { data: items } = await supabase
    .from('canonical_items')
    .select('canonical_name, kind')
  
  const existingSet = new Set()
  items?.forEach(item => {
    existingSet.add(`${item.canonical_name.toLowerCase()}|${item.kind}`)
  })
  
  console.log(`🔍 Loaded ${existingSet.size} existing items for comparison`)
  return existingSet
}

async function getServiceLineMap(supabase) {
  const { data: serviceLines } = await supabase
    .from('service_lines')
    .select('id, name')
  
  const map = {}
  serviceLines?.forEach(line => {
    map[line.name.toLowerCase()] = line.id
    map[line.name] = line.id
  })
  
  return map
}

async function main() {
  console.log('🚀 Starting focused Equipment & new Materials import...')
  
  try {
    // Read Excel file
    const workbook = XLSX.readFile('/Users/maniksingla/invoice verification/FM_materials_equipment_filled.xlsx')
    const worksheet = workbook.Sheets['Items']
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    console.log(`📊 Processing ${data.length} rows from FM file`)
    
    // Get database state
    const supabase = await getSupabaseClient()
    const existingItems = await getExistingItems(supabase)
    const serviceLineMap = await getServiceLineMap(supabase)
    
    // Process items
    const itemsToInsert = []
    const stats = { equipment: 0, material: 0, duplicates: 0, invalid: 0 }
    
    for (const row of data) {
      const itemName = row.ITEM_NAME?.toString().trim()
      const serviceLine = row.SERVICE_LINE?.toString().trim()
      const itemKind = row.ITEM_KIND?.toString().toLowerCase().trim()
      
      // Skip invalid
      if (!itemName || itemName.length < 2) {
        stats.invalid++
        continue
      }
      
      if (!['material', 'equipment'].includes(itemKind)) {
        stats.invalid++
        continue
      }
      
      // Check for duplicates
      const itemKey = `${itemName.toLowerCase()}|${itemKind}`
      if (existingItems.has(itemKey)) {
        stats.duplicates++
        continue
      }
      
      // Determine service line
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
      
      stats[itemKind]++
    }
    
    console.log('📈 Processing stats:')
    console.log(`   • Equipment items to add: ${stats.equipment}`)
    console.log(`   • Material items to add: ${stats.material}`)
    console.log(`   • Duplicates skipped: ${stats.duplicates}`)
    console.log(`   • Invalid rows skipped: ${stats.invalid}`)
    
    if (itemsToInsert.length === 0) {
      console.log('⚠️  No new items to import')
      return
    }
    
    // Insert in batches
    console.log(`\n📦 Inserting ${itemsToInsert.length} new items...`)
    
    let inserted = 0
    let errors = 0
    const batchSize = 100
    
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
      const batch = itemsToInsert.slice(i, i + batchSize)
      
      try {
        const { data, error } = await supabase
          .from('canonical_items')
          .insert(batch)
          .select('id')
        
        if (error) {
          console.log(`  ❌ Batch error: ${error.message}`)
          errors += batch.length
        } else {
          inserted += data?.length || 0
          console.log(`  ✅ Batch ${Math.floor(i/batchSize) + 1}: ${data?.length || 0} inserted`)
        }
        
      } catch (batchError) {
        console.log(`  ❌ Batch error: ${batchError.message}`)
        errors += batch.length
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('\n🎉 FOCUSED IMPORT COMPLETE!')
    console.log(`📊 Results:`)
    console.log(`   • ${inserted} new items imported`)
    console.log(`   • ${errors} errors`)
    
    // Show final database state
    const { data: finalEquipment } = await supabase
      .from('canonical_items')
      .select('id')
      .eq('kind', 'equipment')
    
    const { data: finalMaterials } = await supabase
      .from('canonical_items')
      .select('id') 
      .eq('kind', 'material')
      
    console.log('\n📈 Final database totals:')
    console.log(`   • Equipment: ${finalEquipment?.length || 0}`)
    console.log(`   • Materials: ${finalMaterials?.length || 0}`)
    console.log(`   • Total: ${(finalEquipment?.length || 0) + (finalMaterials?.length || 0)}`)
    
    if (inserted > 0) {
      // Show some sample new equipment items
      const { data: sampleEquipment } = await supabase
        .from('canonical_items')
        .select('canonical_name, service_lines(name)')
        .eq('kind', 'equipment')
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (sampleEquipment?.length > 0) {
        console.log('\n🔧 Sample new equipment items:')
        sampleEquipment.forEach(item => {
          const serviceLine = item.service_lines?.name || 'Unknown'
          console.log(`   • ${item.canonical_name} (${serviceLine})`)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}