const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Database connection
const supabaseUrl = 'https://wontjinkaueqhtpuphsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvbnRqaW5rYXVlcWh0cHVwaHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5NDg2MywiZXhwIjoyMDcxMDcwODYzfQ.ayZG8fRtczb0p5_l7S9wnrXaM_P1r2AQ9neYjBV0dRk'

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse the correct CSV mapping
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

async function createSQLMigration() {
  console.log('🔧 Creating SQL migration script...\n')
  
  // Parse correct mapping
  const { correctServiceTypes, serviceLineMapping } = parseCorrectMapping()
  console.log(`📋 Correct mapping has ${correctServiceTypes.size} service types`)
  
  // Get current database state
  const { data: serviceLines, error: slError } = await supabase
    .from('service_lines')
    .select('id, name')
    .order('name')
    
  const { data: serviceTypes, error: stError } = await supabase
    .from('service_types')
    .select('id, name, service_line_id')
    .order('id')
    
  if (slError || stError) {
    console.error('Error fetching data:', slError || stError)
    return
  }
  
  // Create service line name to ID mapping
  const serviceLineMap = new Map()
  serviceLines.forEach(line => {
    serviceLineMap.set(line.name, line.id)
  })
  
  // Get referenced service type IDs
  const { data: references } = await supabase
    .from('canonical_items')
    .select('service_type_id')
    .not('service_type_id', 'is', null)
    
  const referencedIds = new Set(references?.map(r => r.service_type_id) || [])
  
  // Find service types to delete (not in CSV and not referenced)
  const toDelete = []
  const toKeep = []
  const currentNames = new Set()
  
  serviceTypes.forEach(type => {
    currentNames.add(type.name)
    if (!correctServiceTypes.has(type.name)) {
      if (referencedIds.has(type.id)) {
        toKeep.push(type)
        console.log(`⚠️  Keeping referenced type: "${type.name}" (ID: ${type.id})`)
      } else {
        toDelete.push(type.id)
      }
    }
  })
  
  // Find service types to add (in CSV but not in DB)
  const toAdd = []
  for (const [serviceLine, serviceTypeSet] of serviceLineMapping) {
    const serviceLineId = serviceLineMap.get(serviceLine)
    if (!serviceLineId) {
      console.error(`❌ No service line ID found for: ${serviceLine}`)
      continue
    }
    
    for (const serviceTypeName of serviceTypeSet) {
      if (!currentNames.has(serviceTypeName)) {
        toAdd.push({
          name: serviceTypeName,
          service_line_id: serviceLineId,
          service_line_name: serviceLine
        })
      }
    }
  }
  
  console.log(`\n📊 Migration Summary:`)
  console.log(`   Service types to DELETE: ${toDelete.length}`)
  console.log(`   Service types to ADD: ${toAdd.length}`)
  console.log(`   Service types to KEEP (referenced): ${toKeep.length}`)
  console.log(`   Expected final count: ${correctServiceTypes.size + toKeep.length}`)
  
  // Generate SQL migration
  let sql = `-- Service Type Mapping Correction Migration
-- Generated: ${new Date().toISOString()}
-- 
-- This migration corrects the service type mappings to match the 
-- "Updated Service line and type mapping.csv" file exactly.
--
-- Summary:
--   - Deletes ${toDelete.length} incorrect service types
--   - Adds ${toAdd.length} missing service types  
--   - Preserves ${toKeep.length} referenced service types
--   - Target: ${correctServiceTypes.size + toKeep.length} total service types
--

BEGIN;

-- Create backup table
CREATE TABLE IF NOT EXISTS service_types_backup_migration AS 
SELECT * FROM service_types;

`
  
  if (toDelete.length > 0) {
    sql += `-- Delete incorrect service types (not referenced by canonical_items)\n`
    sql += `DELETE FROM service_types WHERE id IN (\n`
    
    // Split into chunks to avoid overly long SQL statements
    const chunkSize = 100
    for (let i = 0; i < toDelete.length; i += chunkSize) {
      const chunk = toDelete.slice(i, i + chunkSize)
      if (i > 0) sql += `,\n`
      sql += `  ${chunk.join(', ')}`
    }
    sql += `\n);\n\n`
  }
  
  if (toAdd.length > 0) {
    sql += `-- Add missing service types from CSV\n`
    sql += `INSERT INTO service_types (name, service_line_id) VALUES\n`
    
    const insertValues = toAdd.map(type => 
      `  ('${type.name.replace(/'/g, "''")}', ${type.service_line_id}) -- ${type.service_line_name}`
    )
    
    sql += insertValues.join(',\n')
    sql += `;\n\n`
  }
  
  sql += `-- Verify final counts
SELECT 
  sl.name AS service_line,
  COUNT(st.id) AS service_type_count
FROM service_lines sl
LEFT JOIN service_types st ON st.service_line_id = sl.id
GROUP BY sl.id, sl.name
ORDER BY sl.name;

-- Overall summary
SELECT 
  COUNT(*) as total_service_types,
  COUNT(DISTINCT service_line_id) as service_lines_with_types
FROM service_types;

COMMIT;

-- Rollback script (if needed):
-- DELETE FROM service_types;
-- INSERT INTO service_types SELECT * FROM service_types_backup_migration;
-- DROP TABLE service_types_backup_migration;
`

  // Save SQL migration
  const sqlPath = path.join(__dirname, `fix_service_mapping_${Date.now()}.sql`)
  fs.writeFileSync(sqlPath, sql)
  
  console.log(`\n✅ SQL migration created: ${sqlPath}`)
  console.log(`\n📋 To execute:`)
  console.log(`   1. Review the generated SQL file`)
  console.log(`   2. Execute in Supabase SQL editor or via psql`)
  console.log(`   3. Verify the results`)
  
  // Also save a summary report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      current_service_types: serviceTypes.length,
      target_service_types: correctServiceTypes.size,
      to_delete: toDelete.length,
      to_add: toAdd.length,
      to_keep_referenced: toKeep.length,
      final_expected: correctServiceTypes.size + toKeep.length
    },
    service_types_to_delete: toDelete,
    service_types_to_add: toAdd,
    referenced_types_to_keep: toKeep
  }
  
  const reportPath = path.join(__dirname, `migration_report_${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  
  console.log(`📋 Detailed report saved: ${reportPath}`)
  
  return sqlPath
}

// Run the migration generator
if (require.main === module) {
  createSQLMigration()
}

module.exports = { createSQLMigration }