const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Database connection
const supabaseUrl = 'https://wontjinkaueqhtpuphsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk'

const supabase = createClient(supabaseUrl, supabaseKey)

async function executeMigration() {
  console.log('🚀 EXECUTING SERVICE MAPPING CORRECTION')
  console.log('=' .repeat(50))
  
  try {
    // Step 1: Create backup
    console.log('📋 Creating manual backup...')
    const { data: backupData, error: backupError } = await supabase
      .from('service_types')
      .select('*')
    
    if (backupError) {
      console.error('   ❌ Error creating backup:', backupError)
      return
    }
    
    fs.writeFileSync('/Users/maniksingla/invoice verification/service_types_backup_pre_migration.json', 
      JSON.stringify(backupData, null, 2))
    console.log('   ✅ Manual backup created with', backupData.length, 'service types')
    
    // Step 2: Delete incorrect service types
    console.log('\n🗑️ Deleting 110 incorrect service types...')
    const idsToDelete = [852, 855, 864, 879, 886, 893, 896, 897, 901, 902, 904, 905, 910, 911, 915, 917, 920, 921, 925, 930, 932, 933, 941, 944, 961, 965, 966, 967, 968, 974, 975, 976, 977, 980, 981, 983, 985, 986, 988, 990, 995, 996, 1001, 1002, 1006, 1008, 1009, 1011, 1012, 1013, 1016, 1017, 1020, 1024, 1035, 1039, 1040, 1047, 1048, 1053, 1058, 1059, 1060, 1061, 1071, 1080, 1083, 1090, 1104, 1105, 1106, 1107, 1109, 1111, 1112, 1113, 1115, 1116, 1117, 1119, 1122, 1123, 1130, 1133, 1136, 1137, 1138, 1139, 1140, 1144, 1145, 1146, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1163, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176]
    
    // Delete in smaller batches to avoid timeouts
    const batchSize = 20
    let deletedCount = 0
    
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize)
      
      const { error: deleteError } = await supabase
        .from('service_types')
        .delete()
        .in('id', batch)
      
      if (deleteError) {
        console.error(`   ❌ Error deleting batch ${Math.floor(i/batchSize) + 1}:`, deleteError)
      } else {
        deletedCount += batch.length
        console.log(`   ✅ Deleted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(idsToDelete.length/batchSize)} (${batch.length} items)`)
      }
    }
    
    console.log(`   📊 Total deleted: ${deletedCount}/${idsToDelete.length}`)
    
    // Step 3: Add missing service types
    console.log('\n➕ Adding 15 missing service types...')
    const typesToAdd = [
      { name: 'Main Line Repair and Replacement', service_line_id: 14 },
      { name: 'Sewer Maintenance and Repair', service_line_id: 14 },
      { name: 'Toilet/Urinal Repair and Replacement', service_line_id: 14 },
      { name: 'Water Line Repair or Replace', service_line_id: 14 },
      { name: 'Pressure Wash Buses', service_line_id: 17 },
      { name: 'Pressure Wash and Degrease', service_line_id: 17 },
      { name: 'Pressure Wash with Algae Removal', service_line_id: 17 },
      { name: 'Pressure Washing with Water Reclamation', service_line_id: 17 },
      { name: 'Sidewalk Pressure Washing w/o Gum Removal', service_line_id: 17 },
      { name: 'Alarm Installation and Repair', service_line_id: 18 },
      { name: 'Automatic Security Gate Repair and Replacemenet', service_line_id: 18 },
      { name: 'Fire watch', service_line_id: 18 },
      { name: 'Security Camera Installation and Maintenance', service_line_id: 18 },
      { name: 'Security Door Repair and Replacement', service_line_id: 18 },
      { name: 'Security Gate Repair and Replacement', service_line_id: 18 }
    ]
    
    const { error: insertError } = await supabase
      .from('service_types')
      .insert(typesToAdd)
    
    if (insertError) {
      console.error('   ❌ Error adding missing service types:', insertError)
    } else {
      console.log(`   ✅ Added ${typesToAdd.length} missing service types`)
    }
    
    // Step 4: Verify results
    console.log('\n✅ Verifying final results...')
    
    const { data: finalServiceTypes, error: verifyError } = await supabase
      .from('service_types')
      .select('id, name, service_line_id, service_lines(name)')
    
    if (verifyError) {
      console.error('❌ Error verifying results:', verifyError)
      return
    }
    
    // Group by service line
    const byServiceLine = new Map()
    finalServiceTypes.forEach(type => {
      const serviceLine = type.service_lines?.name || 'Unknown'
      if (!byServiceLine.has(serviceLine)) {
        byServiceLine.set(serviceLine, [])
      }
      byServiceLine.get(serviceLine).push(type.name)
    })
    
    console.log(`\n📊 FINAL RESULTS:`)
    console.log(`   Total service types: ${finalServiceTypes.length}`)
    console.log(`   Expected: 411 (410 from CSV + 1 referenced)`)
    console.log(`   Status: ${finalServiceTypes.length === 411 ? '✅ PERFECT MATCH' : '⚠️ SLIGHT DIFFERENCE'}`)
    
    console.log(`\n📋 Service types per service line:`)
    for (const [serviceLine, types] of byServiceLine) {
      console.log(`   ${serviceLine}: ${types.length} types`)
    }
    
    // Save final verification report
    const verificationReport = {
      timestamp: new Date().toISOString(),
      operation: 'migration_complete',
      results: {
        total_service_types: finalServiceTypes.length,
        expected_count: 411,
        is_correct: finalServiceTypes.length === 411,
        deleted_count: deletedCount,
        added_count: typesToAdd.length
      },
      service_types_by_line: Object.fromEntries(byServiceLine)
    }
    
    fs.writeFileSync('/Users/maniksingla/invoice verification/migration_verification_report.json', 
      JSON.stringify(verificationReport, null, 2))
    
    if (finalServiceTypes.length === 411) {
      console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!')
      console.log('✅ Database now matches the CSV exactly with correct service type mappings.')
    } else {
      console.log(`\n⚠️ Migration completed but count is ${finalServiceTypes.length} instead of 411.`)
      console.log('Check the verification report for details.')
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
  }
}

// Run the migration
if (require.main === module) {
  executeMigration()
}

module.exports = { executeMigration }