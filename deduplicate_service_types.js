const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabase = createClient('https://wontjinkaueqhtpuphsn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk')

async function deduplicateServiceTypes() {
  console.log('🔧 SERVICE TYPE DEDUPLICATION')
  console.log('=' .repeat(40))
  
  try {
    // Step 1: Create backup
    console.log('📋 Creating backup...')
    const { data: backupData, error: backupError } = await supabase
      .from('service_types')
      .select('*')
    
    if (backupError) {
      console.error('   ❌ Error creating backup:', backupError)
      return
    }
    
    fs.writeFileSync('service_types_backup_dedup.json', JSON.stringify(backupData, null, 2))
    console.log(`   ✅ Backup created with ${backupData.length} service types`)
    
    // Step 2: Find duplicates and which ones to delete
    console.log('\n🔍 Identifying duplicates...')
    const { data: allTypes } = await supabase.from('service_types').select('id, name')
    const { data: refs } = await supabase.from('canonical_items').select('service_type_id').not('service_type_id', 'is', null)
    const referencedIds = new Set(refs?.map(r => r.service_type_id) || [])
    
    // Group by name
    const typesByName = new Map()
    allTypes.forEach(type => {
      if (!typesByName.has(type.name)) {
        typesByName.set(type.name, [])
      }
      typesByName.get(type.name).push(type)
    })
    
    // Find duplicates and decide which to delete
    const toDelete = []
    let duplicateGroups = 0
    
    for (const [name, types] of typesByName) {
      if (types.length > 1) {
        duplicateGroups++
        
        // Keep the first one, unless one of them is referenced
        let toKeep = types[0]
        const referencedInGroup = types.find(t => referencedIds.has(t.id))
        if (referencedInGroup) {
          toKeep = referencedInGroup
        }
        
        // Mark others for deletion
        types.forEach(type => {
          if (type.id !== toKeep.id) {
            toDelete.push(type)
          }
        })
      }
    }
    
    console.log(`   📊 Found ${duplicateGroups} duplicate groups`)
    console.log(`   🗑️ ${toDelete.length} duplicate copies to delete`)
    console.log(`   ✅ ${allTypes.length - toDelete.length} unique types to keep`)
    
    if (toDelete.length === 0) {
      console.log('\n✅ No duplicates found!')
      return
    }
    
    // Step 3: Delete duplicates in batches
    console.log(`\n🗑️ Deleting ${toDelete.length} duplicate service types...`)
    
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
    
    // Step 4: Verify final results
    console.log('\n📊 Verifying results...')
    const { data: finalTypes } = await supabase.from('service_types').select('id, name, service_line_id, service_lines(name)')
    
    const finalByLine = new Map()
    finalTypes.forEach(type => {
      const serviceLine = type.service_lines?.name || 'Unknown'
      if (!finalByLine.has(serviceLine)) {
        finalByLine.set(serviceLine, [])
      }
      finalByLine.get(serviceLine).push(type.name)
    })
    
    console.log(`\n🎉 DEDUPLICATION COMPLETE!`)
    console.log(`   Deleted: ${deletedCount}/${toDelete.length}`)
    console.log(`   Final count: ${finalTypes.length}`)
    console.log(`   Expected: 411 (410 from CSV + 1 referenced)`)
    console.log(`   Status: ${finalTypes.length === 411 ? '✅ PERFECT!' : '⚠️ CHECK NEEDED'}`)
    
    console.log(`\n📋 Final service types per service line:`)
    for (const [serviceLine, types] of finalByLine) {
      console.log(`   ${serviceLine}: ${types.length} types`)
    }
    
    // Save final report
    const report = {
      timestamp: new Date().toISOString(),
      operation: 'deduplication_complete',
      success: finalTypes.length === 411,
      results: {
        deleted_duplicates: deletedCount,
        final_count: finalTypes.length,
        expected_count: 411,
        duplicate_groups_processed: duplicateGroups
      },
      service_types_by_line: Object.fromEntries(finalByLine)
    }
    
    fs.writeFileSync('deduplication_report.json', JSON.stringify(report, null, 2))
    
    if (report.success) {
      console.log('\n✅ SUCCESS! Database now has exactly 411 unique service types.')
      console.log('🔄 Service type filtering should now work perfectly.')
    }
    
  } catch (error) {
    console.error('❌ Deduplication failed:', error)
  }
}

deduplicateServiceTypes()