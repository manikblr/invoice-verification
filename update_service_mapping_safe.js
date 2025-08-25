const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Database connection using .env credentials
const supabaseUrl = 'https://wontjinkaueqhtpuphsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk'

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse the updated mapping CSV file
function parseUpdatedMapping() {
  const csvPath = path.join(__dirname, 'Updated Service line and type mapping.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('SERVICE_LINE,SERVICE_TYPE'))
  
  const mapping = new Map()
  
  lines.forEach(line => {
    const [serviceLine, serviceType] = line.split(',').map(s => s.replace(/"/g, '').trim())
    if (serviceLine && serviceType) {
      if (!mapping.has(serviceLine)) {
        mapping.set(serviceLine, new Set())
      }
      mapping.get(serviceLine).add(serviceType)
    }
  })
  
  return mapping
}

// Create backup of current data
async function createBackup() {
  console.log('📋 Creating backup of current service data...')
  
  const { data: serviceLines, error: slError } = await supabase
    .from('service_lines')
    .select('*')
    .order('id')
  
  const { data: serviceTypes, error: stError } = await supabase
    .from('service_types')
    .select('*')
    .order('id')
  
  if (slError || stError) {
    console.error('❌ Error creating backup:', slError || stError)
    return false
  }
  
  const backup = {
    timestamp: new Date().toISOString(),
    service_lines: serviceLines,
    service_types: serviceTypes
  }
  
  const backupPath = path.join(__dirname, `service_data_backup_safe_${Date.now()}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  
  console.log(`✅ Backup created: ${backupPath}`)
  console.log(`📊 Backed up ${serviceLines.length} service lines and ${serviceTypes.length} service types`)
  
  return true
}

// Clean up service lines (handle HVAC duplicate)
async function cleanupServiceLines() {
  console.log('\n🧹 Cleaning up service lines...')
  
  // Get current service lines
  const { data: currentLines, error } = await supabase
    .from('service_lines')
    .select('*')
    .order('id')
  
  if (error) {
    console.error('❌ Error fetching service lines:', error)
    return null
  }
  
  console.log(`📊 Found ${currentLines.length} current service lines`)
  
  // Handle HVAC duplicate specifically
  const hvacLines = currentLines.filter(line => 
    line.name.toLowerCase() === 'hvac' || line.name.toLowerCase() === 'hvac'
  )
  
  if (hvacLines.length > 1) {
    console.log(`🔧 Found HVAC duplicates: ${hvacLines.map(l => `${l.id}:${l.name}`).join(', ')}`)
    
    // Use the first one as primary, update others
    const primaryHvac = hvacLines[0]
    const duplicates = hvacLines.slice(1)
    
    for (const duplicate of duplicates) {
      // Move service types to primary
      const { error: moveError } = await supabase
        .from('service_types')
        .update({ service_line_id: primaryHvac.id })
        .eq('service_line_id', duplicate.id)
      
      if (moveError) {
        console.error(`❌ Error moving service types from ${duplicate.id} to ${primaryHvac.id}:`, moveError)
        continue
      }
      
      // Delete the duplicate
      const { error: deleteError } = await supabase
        .from('service_lines')
        .delete()
        .eq('id', duplicate.id)
      
      if (deleteError) {
        console.error(`❌ Error deleting duplicate service line ${duplicate.id}:`, deleteError)
      } else {
        console.log(`   ✅ Merged duplicate "${duplicate.name}" (ID ${duplicate.id}) into primary HVAC (ID ${primaryHvac.id})`)
      }
    }
    
    // Standardize the name
    const { error: updateError } = await supabase
      .from('service_lines')
      .update({ name: 'HVAC' })
      .eq('id', primaryHvac.id)
    
    if (updateError) {
      console.error(`❌ Error standardizing HVAC name:`, updateError)
    } else {
      console.log(`   ✅ Standardized name to "HVAC" for ID ${primaryHvac.id}`)
    }
  }
  
  return true
}

// Add missing service lines
async function addMissingServiceLines(updatedMapping) {
  console.log('\n➕ Checking for missing service lines...')
  
  const { data: currentLines, error } = await supabase
    .from('service_lines')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('❌ Error fetching current service lines:', error)
    return null
  }
  
  const currentNames = new Set(currentLines.map(line => line.name))
  const requiredNames = new Set(updatedMapping.keys())
  
  const missingNames = Array.from(requiredNames).filter(name => !currentNames.has(name))
  
  if (missingNames.length === 0) {
    console.log('   ✅ All required service lines already exist')
    return currentLines
  }
  
  console.log(`   📋 Adding ${missingNames.length} missing service lines:`)
  
  const newLines = []
  for (const name of missingNames) {
    const { data: newLine, error: insertError } = await supabase
      .from('service_lines')
      .insert({ name })
      .select()
      .single()
    
    if (insertError) {
      console.error(`❌ Error adding service line "${name}":`, insertError)
      continue
    }
    
    newLines.push(newLine)
    console.log(`   ✅ Added "${name}" with ID ${newLine.id}`)
  }
  
  // Return updated list
  const { data: allLines } = await supabase
    .from('service_lines')
    .select('*')
    .order('name')
  
  return allLines
}

// Update service type mappings safely
async function updateServiceTypeMappingsSafely(updatedMapping, serviceLines) {
  console.log('\n🔄 Updating service type mappings safely...')
  
  // Create service line name to ID mapping
  const serviceLineMap = new Map()
  serviceLines.forEach(line => {
    serviceLineMap.set(line.name, line.id)
  })
  
  // Get all current service types
  const { data: currentServiceTypes, error } = await supabase
    .from('service_types')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('❌ Error fetching current service types:', error)
    return false
  }
  
  console.log(`📊 Found ${currentServiceTypes.length} current service types`)
  
  // Create a map of existing service type names to their records
  const existingTypeMap = new Map()
  currentServiceTypes.forEach(type => {
    existingTypeMap.set(type.name, type)
  })
  
  // Process each service line in the updated mapping
  let updatedCount = 0
  let addedCount = 0
  
  for (const [serviceLineName, serviceTypes] of updatedMapping) {
    const serviceLineId = serviceLineMap.get(serviceLineName)
    if (!serviceLineId) {
      console.error(`❌ No service line ID found for: ${serviceLineName}`)
      continue
    }
    
    console.log(`\n🔧 Processing "${serviceLineName}" (ID: ${serviceLineId}) - ${serviceTypes.size} service types`)
    
    for (const serviceTypeName of serviceTypes) {
      if (existingTypeMap.has(serviceTypeName)) {
        // Update existing service type to correct service line
        const existingType = existingTypeMap.get(serviceTypeName)
        
        if (existingType.service_line_id !== serviceLineId) {
          const { error: updateError } = await supabase
            .from('service_types')
            .update({ service_line_id: serviceLineId })
            .eq('id', existingType.id)
          
          if (updateError) {
            console.error(`❌ Error updating "${serviceTypeName}":`, updateError)
            continue
          }
          
          updatedCount++
        }
      } else {
        // Add new service type
        const { error: insertError } = await supabase
          .from('service_types')
          .insert({
            name: serviceTypeName,
            service_line_id: serviceLineId
          })
        
        if (insertError) {
          console.error(`❌ Error adding "${serviceTypeName}":`, insertError)
          continue
        }
        
        addedCount++
      }
    }
    
    console.log(`   ✅ Processed ${serviceTypes.size} service types for "${serviceLineName}"`)
  }
  
  console.log(`\n📊 Summary:`)
  console.log(`   Updated existing service types: ${updatedCount}`)
  console.log(`   Added new service types: ${addedCount}`)
  
  return true
}

// Remove orphaned service types that are not in the updated mapping
async function removeOrphanedServiceTypes(updatedMapping) {
  console.log('\n🧹 Cleaning up orphaned service types...')
  
  // Get all required service type names
  const requiredTypes = new Set()
  for (const [, serviceTypes] of updatedMapping) {
    for (const serviceType of serviceTypes) {
      requiredTypes.add(serviceType)
    }
  }
  
  // Get current service types that are not referenced by canonical_items
  const { data: currentTypes, error } = await supabase
    .rpc('get_unreferenced_service_types')
    .then(result => result)
    .catch(() => {
      // If the function doesn't exist, get all types and we'll handle references carefully
      return supabase
        .from('service_types')
        .select('*')
    })
  
  if (error) {
    console.warn('⚠️  Could not get unreferenced service types, skipping cleanup')
    return true
  }
  
  const orphanedTypes = currentTypes.data?.filter(type => !requiredTypes.has(type.name)) || []
  
  console.log(`📊 Found ${orphanedTypes.length} potentially orphaned service types`)
  
  if (orphanedTypes.length === 0) {
    console.log('   ✅ No orphaned service types to clean up')
    return true
  }
  
  // Only delete types that are not referenced by other tables
  let deletedCount = 0
  for (const orphanedType of orphanedTypes) {
    // Check if this service type is referenced by canonical_items
    const { data: references, error: refError } = await supabase
      .from('canonical_items')
      .select('id')
      .eq('service_type_id', orphanedType.id)
      .limit(1)
    
    if (refError) {
      console.error(`❌ Error checking references for service type ${orphanedType.name}:`, refError)
      continue
    }
    
    if (references && references.length > 0) {
      console.log(`   ⚠️  Keeping "${orphanedType.name}" (ID: ${orphanedType.id}) - referenced by canonical_items`)
      continue
    }
    
    // Safe to delete
    const { error: deleteError } = await supabase
      .from('service_types')
      .delete()
      .eq('id', orphanedType.id)
    
    if (deleteError) {
      console.error(`❌ Error deleting orphaned service type "${orphanedType.name}":`, deleteError)
    } else {
      console.log(`   🗑️  Deleted orphaned "${orphanedType.name}" (ID: ${orphanedType.id})`)
      deletedCount++
    }
  }
  
  console.log(`   ✅ Deleted ${deletedCount} orphaned service types`)
  return true
}

// Validate the final mapping
async function validateMapping() {
  console.log('\n✅ Validating final mapping...')
  
  const { data: serviceLines, error: slError } = await supabase
    .from('service_lines')
    .select('*')
    .order('name')
  
  const { data: serviceTypes, error: stError } = await supabase
    .from('service_types')
    .select(`
      id, 
      name, 
      service_line_id,
      service_lines(name)
    `)
    .order('service_line_id')
    .order('name')
  
  if (slError || stError) {
    console.error('❌ Error validating mapping:', slError || stError)
    return false
  }
  
  console.log(`📊 Final counts:`)
  console.log(`   Service Lines: ${serviceLines.length}`)
  console.log(`   Service Types: ${serviceTypes.length}`)
  
  // Group by service line for validation
  const groupedTypes = new Map()
  serviceTypes.forEach(type => {
    const serviceLineName = type.service_lines?.name || 'Unknown'
    if (!groupedTypes.has(serviceLineName)) {
      groupedTypes.set(serviceLineName, [])
    }
    groupedTypes.get(serviceLineName).push(type.name)
  })
  
  console.log(`\n📋 Service types per service line:`)
  for (const [serviceLine, types] of groupedTypes) {
    console.log(`   ${serviceLine}: ${types.length} types`)
  }
  
  // Save final mapping for reference
  const finalMapping = {}
  for (const [serviceLine, types] of groupedTypes) {
    finalMapping[serviceLine] = types.sort()
  }
  
  const reportPath = path.join(__dirname, `final_service_mapping_safe_${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(finalMapping, null, 2))
  console.log(`📋 Final mapping saved to: ${reportPath}`)
  
  return true
}

// Main execution function
async function main() {
  console.log('🚀 Starting SAFE Service Line and Service Type Mapping Update')
  console.log('=' .repeat(70))
  
  try {
    // Step 1: Parse the updated mapping
    const updatedMapping = parseUpdatedMapping()
    console.log(`📋 Loaded mapping with ${updatedMapping.size} service lines and ${Array.from(updatedMapping.values()).reduce((sum, types) => sum + types.size, 0)} service types`)
    
    // Step 2: Create backup
    const backupSuccess = await createBackup()
    if (!backupSuccess) {
      console.error('❌ Backup failed. Aborting update.')
      return
    }
    
    // Step 3: Clean up service lines (duplicates)
    const cleanupSuccess = await cleanupServiceLines()
    if (!cleanupSuccess) {
      console.error('❌ Service line cleanup failed. Aborting update.')
      return
    }
    
    // Step 4: Add any missing service lines
    const allServiceLines = await addMissingServiceLines(updatedMapping)
    if (!allServiceLines) {
      console.error('❌ Could not ensure all service lines exist. Aborting update.')
      return
    }
    
    // Step 5: Update service type mappings safely
    const mappingSuccess = await updateServiceTypeMappingsSafely(updatedMapping, allServiceLines)
    if (!mappingSuccess) {
      console.error('❌ Service type mapping update failed.')
      return
    }
    
    // Step 6: Clean up orphaned service types
    const cleanupOrphansSuccess = await removeOrphanedServiceTypes(updatedMapping)
    if (!cleanupOrphansSuccess) {
      console.warn('⚠️  Orphaned service type cleanup had issues, but continuing...')
    }
    
    // Step 7: Validate final result
    const validationSuccess = await validateMapping()
    if (!validationSuccess) {
      console.error('❌ Final validation failed.')
      return
    }
    
    console.log('\n🎉 SAFE Service line and service type mapping update completed successfully!')
    console.log('=' .repeat(70))
    
  } catch (error) {
    console.error('❌ Unexpected error during update:', error)
  }
}

// Run the main function
if (require.main === module) {
  main()
}

module.exports = { main, parseUpdatedMapping, createBackup, cleanupServiceLines, updateServiceTypeMappingsSafely, validateMapping }