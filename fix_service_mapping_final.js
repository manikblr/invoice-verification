const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Database connection
const supabaseUrl = 'https://wontjinkaueqhtpuphsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk'

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse the CORRECT mapping CSV file
function parseCorrectMapping() {
  const csvPath = path.join(__dirname, 'Updated Service line and type mapping.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('SERVICE_LINE,SERVICE_TYPE'))
  
  const correctServiceTypes = new Set()
  const serviceLineMapping = new Map()
  
  lines.forEach(line => {
    const [serviceLine, serviceType] = line.split(',').map(s => s.replace(/"/g, '').trim())
    if (serviceLine && serviceType) {
      correctServiceTypes.add(serviceType)
      
      if (!serviceLineMapping.has(serviceLine)) {
        serviceLineMapping.set(serviceLine, new Set())
      }
      serviceLineMapping.get(serviceLine).add(serviceType)
    }
  })
  
  return { correctServiceTypes, serviceLineMapping }
}

// Create final backup
async function createFinalBackup() {
  console.log('📋 Creating final backup before cleanup...')
  
  const { data: serviceTypes, error } = await supabase
    .from('service_types')
    .select('*')
    .order('id')
  
  if (error) {
    console.error('❌ Error creating backup:', error)
    return false
  }
  
  const backup = {
    timestamp: new Date().toISOString(),
    operation: 'final_cleanup_before',
    service_types_count: serviceTypes.length,
    service_types: serviceTypes
  }
  
  const backupPath = path.join(__dirname, `service_mapping_final_backup_${Date.now()}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  
  console.log(`✅ Final backup created: ${backupPath}`)
  console.log(`📊 Backed up ${serviceTypes.length} service types`)
  
  return true
}

// Delete extra service types (that are not in the correct CSV)
async function deleteExtraServiceTypes() {
  console.log('\n🗑️ Deleting extra service types not in the correct CSV...')
  
  const { correctServiceTypes } = parseCorrectMapping()
  
  // Get all current service types
  const { data: serviceTypes, error } = await supabase
    .from('service_types')
    .select('id, name')
  
  if (error) {
    console.error('❌ Error fetching service types:', error)
    return false
  }
  
  // Find service types to delete (not in correct CSV)
  const toDelete = serviceTypes.filter(type => !correctServiceTypes.has(type.name))
  console.log(`📊 Found ${toDelete.length} service types to delete`)
  
  // Check which ones are referenced by canonical_items
  const { data: references, error: refError } = await supabase
    .from('canonical_items')
    .select('service_type_id')
    .not('service_type_id', 'is', null)
  
  if (refError) {
    console.error('❌ Error checking references:', refError)
    return false
  }
  
  const referencedIds = new Set(references.map(r => r.service_type_id))
  
  let deletedCount = 0
  let skippedCount = 0
  
  // Delete in batches to avoid overwhelming the database
  const batchSize = 50
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize)
    
    console.log(`\n🔧 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(toDelete.length/batchSize)}...`)
    
    for (const type of batch) {
      if (referencedIds.has(type.id)) {
        console.log(`   ⚠️ Skipping "${type.name}" (ID: ${type.id}) - referenced by canonical_items`)
        skippedCount++
        continue
      }
      
      const { error: deleteError } = await supabase
        .from('service_types')
        .delete()
        .eq('id', type.id)
      
      if (deleteError) {
        console.error(`   ❌ Error deleting "${type.name}" (ID: ${type.id}):`, deleteError)
      } else {
        console.log(`   🗑️ Deleted "${type.name}" (ID: ${type.id})`)
        deletedCount++
      }
    }
  }
  
  console.log(`\n📊 Deletion Summary:`)
  console.log(`   Successfully deleted: ${deletedCount}`)
  console.log(`   Skipped (referenced): ${skippedCount}`)
  
  return true
}

// Add missing service types from the CSV
async function addMissingServiceTypes() {
  console.log('\n➕ Adding missing service types from CSV...')
  
  const { correctServiceTypes, serviceLineMapping } = parseCorrectMapping()
  
  // Get current service lines
  const { data: serviceLines, error: slError } = await supabase
    .from('service_lines')
    .select('*')
  
  if (slError) {
    console.error('❌ Error fetching service lines:', slError)
    return false
  }
  
  const serviceLineMap = new Map()
  serviceLines.forEach(line => {
    serviceLineMap.set(line.name, line.id)
  })
  
  // Get current service types
  const { data: currentTypes, error: stError } = await supabase
    .from('service_types')
    .select('name')
  
  if (stError) {
    console.error('❌ Error fetching current service types:', stError)
    return false
  }
  
  const currentTypeNames = new Set(currentTypes.map(t => t.name))
  
  // Find missing service types
  const missingTypes = []
  for (const [serviceLine, serviceTypes] of serviceLineMapping) {
    const serviceLineId = serviceLineMap.get(serviceLine)
    if (!serviceLineId) {
      console.error(`❌ No service line ID found for: ${serviceLine}`)
      continue
    }
    
    for (const serviceType of serviceTypes) {
      if (!currentTypeNames.has(serviceType)) {
        missingTypes.push({
          name: serviceType,
          service_line_id: serviceLineId,
          service_line_name: serviceLine
        })
      }
    }
  }
  
  console.log(`📊 Found ${missingTypes.length} missing service types to add`)
  
  if (missingTypes.length === 0) {
    console.log('   ✅ No missing service types to add')
    return true
  }
  
  // Group by service line for better logging
  const byServiceLine = new Map()
  missingTypes.forEach(type => {
    if (!byServiceLine.has(type.service_line_name)) {
      byServiceLine.set(type.service_line_name, [])
    }
    byServiceLine.get(type.service_line_name).push(type)
  })
  
  let addedCount = 0
  
  // Add missing types in batches
  const batchSize = 50
  for (let i = 0; i < missingTypes.length; i += batchSize) {
    const batch = missingTypes.slice(i, i + batchSize)
    
    console.log(`\n🔧 Adding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(missingTypes.length/batchSize)}...`)
    
    const { error: insertError } = await supabase
      .from('service_types')
      .insert(batch.map(type => ({ name: type.name, service_line_id: type.service_line_id })))
    
    if (insertError) {
      console.error(`❌ Error inserting batch:`, insertError)
    } else {
      console.log(`   ✅ Added ${batch.length} service types`)
      addedCount += batch.length
    }
  }
  
  console.log(`\n📊 Added ${addedCount} missing service types`)
  
  return true
}

// Final validation
async function validateFinalState() {
  console.log('\n✅ Validating final database state...')
  
  const { correctServiceTypes } = parseCorrectMapping()
  
  const { data: serviceTypes, error } = await supabase
    .from('service_types')
    .select(`
      id,
      name,
      service_line_id,
      service_lines(name)
    `)
    .order('service_line_id')
    .order('name')
  
  if (error) {
    console.error('❌ Error validating final state:', error)
    return false
  }
  
  const currentNames = new Set(serviceTypes.map(t => t.name))
  
  // Check coverage
  const correctInDB = Array.from(correctServiceTypes).filter(name => currentNames.has(name))
  const extraInDB = serviceTypes.filter(type => !correctServiceTypes.has(type.name))
  
  console.log(`\n📊 Final Validation Results:`)
  console.log(`   Total service types in DB: ${serviceTypes.length}`)
  console.log(`   Correct types from CSV in DB: ${correctInDB.length}/${correctServiceTypes.size}`)
  console.log(`   Extra types still in DB: ${extraInDB.length}`)
  
  if (extraInDB.length > 0) {
    console.log(`\n   Extra types (likely referenced by canonical_items):`)
    extraInDB.forEach(type => {
      console.log(`     - ${type.name} (${type.service_lines?.name})`)
    })
  }
  
  // Group by service line for final report
  const groupedTypes = new Map()
  serviceTypes.forEach(type => {
    const serviceLineName = type.service_lines?.name || 'Unknown'
    if (!groupedTypes.has(serviceLineName)) {
      groupedTypes.set(serviceLineName, [])
    }
    groupedTypes.get(serviceLineName).push(type.name)
  })
  
  console.log(`\n📋 Final service types per service line:`)
  for (const [serviceLine, types] of groupedTypes) {
    console.log(`   ${serviceLine}: ${types.length} types`)
  }
  
  // Save final report
  const finalReport = {
    timestamp: new Date().toISOString(),
    operation: 'final_cleanup_complete',
    summary: {
      total_service_types: serviceTypes.length,
      correct_from_csv: correctInDB.length,
      expected_from_csv: correctServiceTypes.size,
      extra_types: extraInDB.length
    },
    service_types_by_line: Object.fromEntries(groupedTypes)
  }
  
  const reportPath = path.join(__dirname, `final_service_mapping_report_${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2))
  console.log(`📋 Final report saved to: ${reportPath}`)
  
  return correctInDB.length === correctServiceTypes.size
}

// Main cleanup function
async function cleanupServiceMapping() {
  console.log('🚀 FINAL SERVICE MAPPING CLEANUP')
  console.log('=' .repeat(50))
  console.log('This will make the database match the CSV exactly (410 types)')
  console.log('')
  
  try {
    // Step 1: Create backup
    const backupSuccess = await createFinalBackup()
    if (!backupSuccess) {
      console.error('❌ Backup failed. Aborting cleanup.')
      return
    }
    
    // Step 2: Delete extra service types
    const deleteSuccess = await deleteExtraServiceTypes()
    if (!deleteSuccess) {
      console.error('❌ Deletion failed. Aborting.')
      return
    }
    
    // Step 3: Add missing service types
    const addSuccess = await addMissingServiceTypes()
    if (!addSuccess) {
      console.error('❌ Addition failed.')
      return
    }
    
    // Step 4: Validate final state
    const validationSuccess = await validateFinalState()
    
    if (validationSuccess) {
      console.log('\n🎉 SERVICE MAPPING CLEANUP COMPLETED SUCCESSFULLY!')
      console.log('Database now matches the CSV with correct service type mappings.')
    } else {
      console.log('\n⚠️ Cleanup completed with some discrepancies.')
      console.log('Check the final report for details.')
    }
    
    console.log('=' .repeat(50))
    
  } catch (error) {
    console.error('❌ Unexpected error during cleanup:', error)
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupServiceMapping()
}

module.exports = { cleanupServiceMapping }