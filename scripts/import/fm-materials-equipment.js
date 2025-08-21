#!/usr/bin/env node
/**
 * Import FM_materials_equipment_filled.xlsx to database
 * Maps Materials and Equipment to canonical_items with appropriate kinds
 */

require('dotenv').config()
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

async function examineExcelFile() {
  console.log('📋 Examining FM_materials_equipment_filled.xlsx...')
  
  const workbook = XLSX.readFile('/Users/maniksingla/invoice verification/FM_materials_equipment_filled.xlsx')
  
  console.log('📄 Sheets found:', workbook.SheetNames)
  
  // Examine each sheet
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    console.log(`\n📊 Sheet: ${sheetName}`)
    console.log(`   Rows: ${data.length}`)
    
    if (data.length > 0) {
      console.log('   Columns:', Object.keys(data[0]))
      console.log('   Sample row:', data[0])
    }
  }
  
  return workbook
}

async function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase credentials')
  }
  
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function ensureServiceLines(supabase, serviceLineNames) {
  console.log('🔧 Ensuring service lines exist...')
  
  const serviceLineMap = {}
  
  for (const lineName of serviceLineNames) {
    // Check if exists
    const { data: existing } = await supabase
      .from('service_lines')
      .select('id')
      .ilike('name', lineName)
      .single()
    
    if (existing) {
      serviceLineMap[lineName] = existing.id
      console.log(`  ✅ Found: ${lineName} (ID: ${existing.id})`)
    } else {
      // Create new service line
      const { data: newLine, error } = await supabase
        .from('service_lines')
        .insert({ name: lineName })
        .select('id')
        .single()
      
      if (error) {
        console.warn(`  ⚠️  Could not create ${lineName}:`, error.message)
        // Use a fallback - find any existing line
        const { data: fallback } = await supabase
          .from('service_lines')
          .select('id')
          .limit(1)
          .single()
        
        serviceLineMap[lineName] = fallback?.id || 14 // Default to Plumbing (ID 14)
      } else {
        serviceLineMap[lineName] = newLine.id
        console.log(`  ➕ Created: ${lineName} (ID: ${newLine.id})`)
      }
    }
  }
  
  return serviceLineMap
}

async function importSheet(supabase, worksheet, sheetName, serviceLineMap) {
  console.log(`\n🔄 Importing sheet: ${sheetName}`)
  
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
  
  if (data.length === 0) {
    console.log('  ⚠️  No data to import')
    return { imported: 0, errors: 0 }
  }
  
  console.log(`  📊 Processing ${data.length} rows...`)
  
  let imported = 0
  let errors = 0
  let duplicates = 0
  
  // Determine item kind based on sheet name
  const itemKind = sheetName.toLowerCase().includes('material') ? 'material' : 
                   sheetName.toLowerCase().includes('equipment') ? 'equipment' : 'material'
  
  console.log(`  🏷️  Item kind: ${itemKind}`)
  
  // Try to identify name and service line columns
  const sampleRow = data[0]
  const columnNames = Object.keys(sampleRow)
  
  // Common column name patterns
  const nameColumns = columnNames.filter(col => 
    ['name', 'item', 'description', 'title', 'product'].some(pattern => 
      col.toLowerCase().includes(pattern)
    )
  )
  
  const serviceLineColumns = columnNames.filter(col =>
    ['service', 'line', 'category', 'type', 'group'].some(pattern =>
      col.toLowerCase().includes(pattern)
    )
  )
  
  console.log('  📝 Detected name columns:', nameColumns)
  console.log('  🏢 Detected service line columns:', serviceLineColumns)
  
  const nameColumn = nameColumns[0] || columnNames[0] // Fallback to first column
  const serviceLineColumn = serviceLineColumns[0]
  
  console.log(`  🎯 Using name column: ${nameColumn}`)
  console.log(`  🎯 Using service line column: ${serviceLineColumn}`)
  
  for (const row of data) {
    try {
      const itemName = row[nameColumn]?.toString().trim()
      
      if (!itemName || itemName.length < 2) {
        continue // Skip empty or very short names
      }
      
      // Determine service line
      let serviceLineId = 14 // Default to Plumbing
      
      if (serviceLineColumn && row[serviceLineColumn]) {
        const serviceLineName = row[serviceLineColumn].toString().trim()
        serviceLineId = serviceLineMap[serviceLineName] || serviceLineId
      }
      
      // Try to insert canonical item
      const { data: inserted, error } = await supabase
        .from('canonical_items')
        .insert({
          canonical_name: itemName,
          kind: itemKind,
          service_line_id: serviceLineId,
          popularity: 1,
          is_active: true
        })
        .select('id')
      
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('already exists')) {
          duplicates++
        } else {
          console.warn(`    ❌ Error with "${itemName}": ${error.message}`)
          errors++
        }
      } else {
        imported++
        if (imported % 100 === 0) {
          console.log(`    📈 Processed ${imported} items...`)
        }
      }
      
      // Small delay to avoid overwhelming the database
      if (imported % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
    } catch (error) {
      console.warn(`    ❌ Processing error:`, error.message)
      errors++
    }
  }
  
  console.log(`  ✅ Results: ${imported} imported, ${duplicates} duplicates, ${errors} errors`)
  return { imported, duplicates, errors }
}

async function main() {
  console.log('🚀 Starting FM Materials & Equipment import...')
  
  try {
    // Examine the Excel file
    const workbook = await examineExcelFile()
    
    // Get Supabase client
    const supabase = await getSupabaseClient()
    
    // Get unique service lines mentioned in the data
    const allServiceLines = new Set()
    
    // Scan all sheets for service line patterns
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
      
      if (data.length > 0) {
        const columnNames = Object.keys(data[0])
        const serviceLineColumns = columnNames.filter(col =>
          ['service', 'line', 'category', 'type', 'group'].some(pattern =>
            col.toLowerCase().includes(pattern)
          )
        )
        
        for (const row of data.slice(0, 50)) { // Sample first 50 rows
          for (const col of serviceLineColumns) {
            const value = row[col]?.toString().trim()
            if (value && value.length > 2) {
              allServiceLines.add(value)
            }
          }
        }
      }
    }
    
    // Add common service lines we know exist
    allServiceLines.add('Plumbing')
    allServiceLines.add('Electrical') 
    allServiceLines.add('HVAC')
    allServiceLines.add('Handyman')
    
    console.log('🎯 Service lines to ensure:', Array.from(allServiceLines))
    
    // Ensure service lines exist
    const serviceLineMap = await ensureServiceLines(supabase, Array.from(allServiceLines))
    
    // Import each sheet
    let totalImported = 0
    let totalErrors = 0
    let totalDuplicates = 0
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      const result = await importSheet(supabase, worksheet, sheetName, serviceLineMap)
      
      totalImported += result.imported
      totalErrors += result.errors
      totalDuplicates += result.duplicates || 0
    }
    
    console.log('\n🎉 IMPORT COMPLETE!')
    console.log(`📊 Total Results:`)
    console.log(`   • ${totalImported} items imported`)
    console.log(`   • ${totalDuplicates} duplicates skipped`) 
    console.log(`   • ${totalErrors} errors`)
    
    // Verify the import
    const { data: totalItems } = await supabase
      .from('canonical_items')
      .select('id')
    
    console.log(`\n✅ Total canonical_items in database: ${totalItems?.length || 0}`)
    
    // Show breakdown by kind
    const { data: breakdown } = await supabase
      .from('canonical_items')
      .select('kind')
    
    if (breakdown) {
      const counts = breakdown.reduce((acc, item) => {
        acc[item.kind] = (acc[item.kind] || 0) + 1
        return acc
      }, {})
      
      console.log('📈 Breakdown by kind:')
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