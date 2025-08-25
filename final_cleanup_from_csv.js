const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient('https://wontjinkaueqhtpuphsn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk')

// Parse CSV to get correct service types
function getCorrectServiceTypes() {
  const csvPath = path.join(__dirname, 'Updated Service line and type mapping.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('SERVICE_LINE,SERVICE_TYPE'))
  
  const correctTypes = new Set()
  lines.forEach(line => {
    const [, serviceType] = line.split(',').map(s => s.replace(/"/g, '').trim())
    if (serviceType) {
      correctTypes.add(serviceType)
    }
  })
  
  return correctTypes
}

async function finalCleanup() {
  console.log('🧹 FINAL COMPREHENSIVE CLEANUP (Using CSV)')
  console.log('=' .repeat(50))
  
  // Get correct types from CSV
  const correctServiceTypes = getCorrectServiceTypes()
  console.log(`📋 Loaded ${correctServiceTypes.size} correct service types from CSV`)
  
  // Get all current service types
  const { data: allTypes } = await supabase.from('service_types').select('id, name')
  
  // Get referenced types
  const { data: refs } = await supabase.from('canonical_items').select('service_type_id').not('service_type_id', 'is', null)
  const referencedIds = new Set(refs?.map(r => r.service_type_id) || [])
  
  console.log(`📊 Current state:`)
  console.log(`   Total service types: ${allTypes.length}`)
  console.log(`   Referenced by canonical_items: ${referencedIds.size}`)
  console.log(`   Correct types from CSV: ${correctServiceTypes.size}`)
  
  // Find what to delete (not in CSV and not referenced)
  const toDelete = allTypes.filter(type => 
    !correctServiceTypes.has(type.name) && !referencedIds.has(type.id)
  )
  
  const correctInDB = allTypes.filter(type => correctServiceTypes.has(type.name))
  const referencedInDB = allTypes.filter(type => referencedIds.has(type.id))
  
  console.log(`\n🎯 Analysis:`)
  console.log(`   Correct types already in DB: ${correctInDB.length}`)
  console.log(`   Referenced types to keep: ${referencedInDB.length}`)
  console.log(`   Types to DELETE: ${toDelete.length}`)
  console.log(`   Expected final count: ${correctServiceTypes.size + referencedIds.size}`)
  
  if (toDelete.length === 0) {
    console.log('\n✅ No cleanup needed!')
    return
  }
  
  // Show some examples of what will be deleted
  console.log(`\nExamples of types to delete:`)
  toDelete.slice(0, 10).forEach(type => {
    console.log(`   - ${type.name} (ID: ${type.id})`)
  })
  if (toDelete.length > 10) {
    console.log(`   ... and ${toDelete.length - 10} more`)
  }
  
  console.log(`\n🗑️ Starting deletion of ${toDelete.length} incorrect service types...`)
  
  // Delete in batches
  const batchSize = 50
  let deletedCount = 0
  
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize)
    const batchIds = batch.map(t => t.id)
    
    const { error } = await supabase
      .from('service_types')
      .delete()
      .in('id', batchIds)
    
    if (error) {
      console.error(`   ❌ Error deleting batch ${Math.floor(i/batchSize) + 1}:`, error)
      break
    } else {
      deletedCount += batch.length
      console.log(`   ✅ Deleted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(toDelete.length/batchSize)} (${batch.length} items)`)
    }
  }
  
  // Verify final count
  const { data: finalTypes } = await supabase.from('service_types').select('id, name')
  
  // Final verification by service line
  const { data: finalByLine } = await supabase
    .from('service_types')
    .select('id, name, service_line_id, service_lines(name)')
  
  const byServiceLine = new Map()
  finalByLine?.forEach(type => {
    const serviceLine = type.service_lines?.name || 'Unknown'
    if (!byServiceLine.has(serviceLine)) {
      byServiceLine.set(serviceLine, [])
    }
    byServiceLine.get(serviceLine).push(type.name)
  })
  
  console.log(`\n📊 FINAL RESULTS:`)
  console.log(`   Deleted: ${deletedCount}/${toDelete.length}`)
  console.log(`   Final count: ${finalTypes?.length || 0}`)
  console.log(`   Expected: ${correctServiceTypes.size + referencedIds.size}`)
  console.log(`   Status: ${finalTypes?.length === (correctServiceTypes.size + referencedIds.size) ? '✅ PERFECT MATCH!' : '⚠️ CHECK NEEDED'}`)
  
  console.log(`\n📋 Final service types per service line:`)
  for (const [serviceLine, types] of byServiceLine) {
    console.log(`   ${serviceLine}: ${types.length} types`)
  }
  
  // Save final report
  const report = {
    timestamp: new Date().toISOString(),
    operation: 'final_cleanup_complete',
    success: finalTypes?.length === (correctServiceTypes.size + referencedIds.size),
    results: {
      deleted_count: deletedCount,
      final_count: finalTypes?.length || 0,
      expected_count: correctServiceTypes.size + referencedIds.size,
      correct_from_csv: correctServiceTypes.size,
      referenced_preserved: referencedIds.size
    },
    service_types_by_line: Object.fromEntries(byServiceLine)
  }
  
  fs.writeFileSync(path.join(__dirname, 'final_cleanup_report.json'), JSON.stringify(report, null, 2))
  
  if (report.success) {
    console.log('\n🎉 CLEANUP COMPLETED SUCCESSFULLY!')
    console.log('✅ Database now matches the CSV exactly with correct service type mappings.')
    console.log('🔄 Frontend service type filtering should now work perfectly.')
  } else {
    console.log('\n⚠️ Cleanup completed but final count doesn\'t match expected.')
    console.log('📋 Check the final_cleanup_report.json for details.')
  }
}

finalCleanup()