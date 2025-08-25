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
  
  console.log(`📋 CSV Analysis:`)
  console.log(`   Total service types in CSV: ${correctServiceTypes.size}`)
  console.log(`   Service lines in CSV: ${serviceLineMapping.size}`)
  
  return { correctServiceTypes, serviceLineMapping }
}

// Get current database state
async function getCurrentDatabaseState() {
  console.log('\n🔍 Fetching current database state...')
  
  const { data: serviceTypes, error } = await supabase
    .from('service_types')
    .select(`
      id,
      name,
      service_line_id,
      service_lines(name)
    `)
    .order('name')
  
  if (error) {
    console.error('❌ Error fetching service types:', error)
    return null
  }
  
  console.log(`📊 Database Analysis:`)
  console.log(`   Total service types in DB: ${serviceTypes.length}`)
  
  const currentServiceTypes = new Set()
  const dbServiceLineMapping = new Map()
  
  serviceTypes.forEach(type => {
    currentServiceTypes.add(type.name)
    const serviceLineName = type.service_lines?.name || 'Unknown'
    
    if (!dbServiceLineMapping.has(serviceLineName)) {
      dbServiceLineMapping.set(serviceLineName, new Set())
    }
    dbServiceLineMapping.get(serviceLineName).add(type.name)
  })
  
  return { currentServiceTypes, dbServiceLineMapping, serviceTypes }
}

// Check which service types are referenced by canonical_items
async function getReferencedServiceTypes() {
  console.log('\n🔗 Checking which service types are referenced by canonical_items...')
  
  const { data: references, error } = await supabase
    .from('canonical_items')
    .select('service_type_id')
    .not('service_type_id', 'is', null)
  
  if (error) {
    console.error('❌ Error fetching references:', error)
    return new Set()
  }
  
  const referencedIds = new Set(references.map(r => r.service_type_id))
  console.log(`   Service types referenced by canonical_items: ${referencedIds.size}`)
  
  return referencedIds
}

// Main analysis function
async function analyzeGap() {
  console.log('🔍 ANALYZING SERVICE TYPE MAPPING GAP')
  console.log('=' .repeat(60))
  
  // Step 1: Parse correct mapping from CSV
  const { correctServiceTypes, serviceLineMapping } = parseCorrectMapping()
  
  // Step 2: Get current database state
  const dbState = await getCurrentDatabaseState()
  if (!dbState) return
  
  const { currentServiceTypes, dbServiceLineMapping, serviceTypes } = dbState
  
  // Step 3: Check references
  const referencedIds = await getReferencedServiceTypes()
  
  console.log('\n📊 GAP ANALYSIS:')
  console.log('=' .repeat(40))
  
  // Find service types in DB but NOT in CSV (should be removed)
  const extraInDB = Array.from(currentServiceTypes).filter(name => !correctServiceTypes.has(name))
  console.log(`\n❌ Service types in DB but NOT in correct CSV (${extraInDB.length}):`)
  
  // Group extras by service line for better understanding
  const extrasByServiceLine = new Map()
  serviceTypes.forEach(type => {
    if (extraInDB.includes(type.name)) {
      const serviceLineName = type.service_lines?.name || 'Unknown'
      if (!extrasByServiceLine.has(serviceLineName)) {
        extrasByServiceLine.set(serviceLineName, [])
      }
      extrasByServiceLine.get(serviceLineName).push({
        id: type.id,
        name: type.name,
        isReferenced: referencedIds.has(type.id)
      })
    }
  })
  
  let totalReferencedExtras = 0
  let totalUnreferencedExtras = 0
  
  for (const [serviceLine, extras] of extrasByServiceLine) {
    console.log(`\n   ${serviceLine} (${extras.length} extras):`)
    extras.forEach(extra => {
      const status = extra.isReferenced ? '🔗 REFERENCED' : '🗑️ CAN DELETE'
      console.log(`     - ${extra.name} (ID: ${extra.id}) ${status}`)
      if (extra.isReferenced) {
        totalReferencedExtras++
      } else {
        totalUnreferencedExtras++
      }
    })
  }
  
  // Find service types in CSV but NOT in DB (should be added)
  const missingInDB = Array.from(correctServiceTypes).filter(name => !currentServiceTypes.has(name))
  console.log(`\n✅ Service types in CSV but NOT in DB (${missingInDB.length}):`)
  
  const missingByServiceLine = new Map()
  for (const [serviceLine, types] of serviceLineMapping) {
    for (const type of types) {
      if (missingInDB.includes(type)) {
        if (!missingByServiceLine.has(serviceLine)) {
          missingByServiceLine.set(serviceLine, [])
        }
        missingByServiceLine.get(serviceLine).push(type)
      }
    }
  }
  
  for (const [serviceLine, missing] of missingByServiceLine) {
    console.log(`\n   ${serviceLine} (${missing.length} missing):`)
    missing.forEach(name => {
      console.log(`     - ${name}`)
    })
  }
  
  // Summary
  console.log('\n📋 SUMMARY:')
  console.log('=' .repeat(30))
  console.log(`✅ Correct service types (from CSV): ${correctServiceTypes.size}`)
  console.log(`📊 Current service types (in DB): ${currentServiceTypes.size}`)
  console.log(`❌ Extra service types (should be removed): ${extraInDB.length}`)
  console.log(`   🔗 Referenced by canonical_items: ${totalReferencedExtras}`)
  console.log(`   🗑️ Safe to delete: ${totalUnreferencedExtras}`)
  console.log(`➕ Missing service types (should be added): ${missingInDB.length}`)
  
  // Save detailed report
  const report = {
    summary: {
      correctServiceTypes: correctServiceTypes.size,
      currentServiceTypes: currentServiceTypes.size,
      extraInDB: extraInDB.length,
      referencedExtras: totalReferencedExtras,
      safeToDeleteExtras: totalUnreferencedExtras,
      missingInDB: missingInDB.length
    },
    extrasByServiceLine: Object.fromEntries(extrasByServiceLine),
    missingByServiceLine: Object.fromEntries(missingByServiceLine),
    correctMapping: Object.fromEntries(serviceLineMapping)
  }
  
  const reportPath = path.join(__dirname, `service_mapping_gap_analysis_${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n📋 Detailed gap analysis saved to: ${reportPath}`)
  
  if (totalUnreferencedExtras > 0) {
    console.log(`\n🔧 RECOMMENDATION:`)
    console.log(`   1. Delete ${totalUnreferencedExtras} unreferenced extra service types`)
    console.log(`   2. Add ${missingInDB.length} missing service types from CSV`)
    console.log(`   3. Keep ${totalReferencedExtras} referenced extras (they're used by canonical_items)`)
    console.log(`   4. Final result: ${correctServiceTypes.size + totalReferencedExtras} service types`)
  }
}

// Run the analysis
if (require.main === module) {
  analyzeGap()
}

module.exports = { analyzeGap }