const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient('https://wontjinkaueqhtpuphsn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk')

function parseCSVMapping() {
  const csvPath = path.join(__dirname, 'Updated Service line and type mapping.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('SERVICE_LINE,SERVICE_TYPE'))
  
  const csvMapping = new Map()
  lines.forEach(line => {
    const [serviceLine, serviceType] = line.split(',').map(s => s.replace(/"/g, '').trim())
    if (serviceLine && serviceType) {
      csvMapping.set(serviceType, serviceLine)
    }
  })
  
  return csvMapping
}

async function correctServiceLineMappings() {
  console.log('🔧 CORRECTING SERVICE LINE MAPPINGS')
  console.log('=' .repeat(45))
  
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
    
    fs.writeFileSync('service_types_backup_mapping_fix.json', JSON.stringify(backupData, null, 2))
    console.log(`   ✅ Backup created with ${backupData.length} service types`)
    
    // Step 2: Get current state and CSV mapping
    const csvMapping = parseCSVMapping()
    const { data: serviceLines } = await supabase.from('service_lines').select('id, name')
    const { data: serviceTypes } = await supabase.from('service_types').select('id, name, service_line_id, service_lines(name)')
    
    // Create lookup maps
    const serviceLineByName = new Map()
    serviceLines.forEach(line => serviceLineByName.set(line.name, line.id))
    
    console.log('📊 Initial state:')
    console.log('   CSV mappings:', csvMapping.size)
    console.log('   DB service types:', serviceTypes.length)
    
    // Step 3: Find incorrect mappings
    const corrections = []
    
    serviceTypes.forEach(type => {
      const currentServiceLine = type.service_lines?.name
      const correctServiceLine = csvMapping.get(type.name)
      
      if (correctServiceLine && currentServiceLine !== correctServiceLine) {
        const correctLineId = serviceLineByName.get(correctServiceLine)
        if (correctLineId) {
          corrections.push({
            id: type.id,
            name: type.name,
            currentLine: currentServiceLine,
            correctLine: correctServiceLine,
            correctLineId: correctLineId
          })
        }
      }
    })
    
    console.log(`\n🎯 Found ${corrections.length} mappings to correct`)
    
    if (corrections.length === 0) {
      console.log('✅ All mappings are already correct!')
      return
    }
    
    // Step 4: Apply corrections in batches
    console.log(`\n🔄 Correcting ${corrections.length} service line mappings...`)
    
    const batchSize = 20
    let correctedCount = 0
    
    for (let i = 0; i < corrections.length; i += batchSize) {
      const batch = corrections.slice(i, i + batchSize)
      
      for (const correction of batch) {
        const { error } = await supabase
          .from('service_types')
          .update({ service_line_id: correction.correctLineId })
          .eq('id', correction.id)
        
        if (error) {
          console.error(`   ❌ Error updating ${correction.name}:`, error)
        } else {
          correctedCount++
        }
      }
      
      console.log(`   ✅ Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(corrections.length/batchSize)} (${batch.length} items)`)
    }
    
    // Step 5: Verify corrections
    console.log('\n📊 Verifying corrections...')
    const { data: updatedTypes } = await supabase
      .from('service_types')
      .select('id, name, service_line_id, service_lines(name)')
    
    // Group by service line for final report
    const finalByLine = new Map()
    updatedTypes.forEach(type => {
      const serviceLine = type.service_lines?.name || 'Unknown'
      if (!finalByLine.has(serviceLine)) {
        finalByLine.set(serviceLine, [])
      }
      finalByLine.get(serviceLine).push(type.name)
    })
    
    // Verify no more mismatches
    let remainingMismatches = 0
    updatedTypes.forEach(type => {
      const currentServiceLine = type.service_lines?.name
      const correctServiceLine = csvMapping.get(type.name)
      
      if (correctServiceLine && currentServiceLine !== correctServiceLine) {
        remainingMismatches++
      }
    })
    
    console.log(`\n🎉 MAPPING CORRECTION COMPLETE!`)
    console.log(`   Corrected: ${correctedCount}/${corrections.length}`)
    console.log(`   Remaining mismatches: ${remainingMismatches}`)
    console.log(`   Status: ${remainingMismatches === 0 ? '✅ ALL CORRECT!' : '⚠️ SOME ISSUES REMAIN'}`)
    
    console.log(`\n📋 Final service types per service line:`)
    for (const [serviceLine, types] of finalByLine) {
      console.log(`   ${serviceLine}: ${types.length} types`)
    }
    
    // Save final report
    const report = {
      timestamp: new Date().toISOString(),
      operation: 'service_line_mapping_correction',
      success: remainingMismatches === 0,
      results: {
        corrections_applied: correctedCount,
        total_corrections_needed: corrections.length,
        remaining_mismatches: remainingMismatches,
        final_service_type_count: updatedTypes.length
      },
      service_types_by_line: Object.fromEntries(finalByLine),
      correction_details: corrections.map(c => ({
        service_type: c.name,
        from: c.currentLine,
        to: c.correctLine
      }))
    }
    
    fs.writeFileSync('service_line_mapping_report.json', JSON.stringify(report, null, 2))
    
    if (report.success) {
      console.log('\n✅ SUCCESS! All service types now have correct service line mappings.')
      console.log('🎯 Database is now fully aligned with the CSV file.')
      console.log('🔄 Service type filtering by service line should work perfectly.')
    }
    
  } catch (error) {
    console.error('❌ Mapping correction failed:', error)
  }
}

correctServiceLineMappings()