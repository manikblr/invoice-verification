#!/usr/bin/env ts-node
/**
 * Demo item seeding script for suggestions testing
 * Seeds ~30 maintenance items across service lines with synonyms and vendor pricing
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
)

interface DemoItem {
  name: string
  service_line: string
  kind: 'material' | 'equipment' | 'labor'
  popularity: number
  synonyms: string[]
  price_range: [number, number] // [min, max]
}

const DEMO_ITEMS: DemoItem[] = [
  // Plumbing materials (high popularity)
  { name: "PVC Pipe 1/2 inch", service_line: "Plumbing", kind: "material", popularity: 95, synonyms: ["pvc pipe", "pipe pvc", "plastic pipe"], price_range: [5, 15] },
  { name: "Teflon Tape", service_line: "Plumbing", kind: "material", popularity: 90, synonyms: ["thread tape", "ptfe tape", "plumber tape"], price_range: [2, 8] },
  { name: "Pipe Wrench 18 inch", service_line: "Plumbing", kind: "equipment", popularity: 85, synonyms: ["pipe wrench", "stillson wrench", "adjustable wrench"], price_range: [25, 65] },
  { name: "Drain Snake", service_line: "Plumbing", kind: "equipment", popularity: 80, synonyms: ["auger", "drain auger", "plumber snake"], price_range: [35, 120] },
  { name: "Anode Rod", service_line: "Plumbing", kind: "material", popularity: 75, synonyms: ["sacrificial anode", "water heater rod", "magnesium rod"], price_range: [45, 85] },
  
  // HVAC materials
  { name: "Air Filter 20x25x1", service_line: "HVAC", kind: "material", popularity: 92, synonyms: ["hvac filter", "furnace filter", "air conditioning filter"], price_range: [15, 35] },
  { name: "Refrigerant R410A", service_line: "HVAC", kind: "material", popularity: 88, synonyms: ["r410a", "puron", "freon 410a"], price_range: [120, 180] },
  { name: "Condenser Fan Motor", service_line: "HVAC", kind: "material", popularity: 70, synonyms: ["fan motor", "condenser motor", "ac motor"], price_range: [150, 350] },
  { name: "Thermostat Digital", service_line: "HVAC", kind: "material", popularity: 85, synonyms: ["digital thermostat", "programmable thermostat", "smart thermostat"], price_range: [80, 250] },
  
  // Electrical materials  
  { name: "MCB 16A Single Pole", service_line: "Electrical", kind: "material", popularity: 87, synonyms: ["circuit breaker", "mcb", "miniature breaker"], price_range: [12, 25] },
  { name: "Copper Wire 2.5mm", service_line: "Electrical", kind: "material", popularity: 93, synonyms: ["electrical wire", "copper cable", "house wire"], price_range: [3, 8] },
  { name: "LED Tube 18W", service_line: "Electrical", kind: "material", popularity: 82, synonyms: ["led tube", "fluorescent replacement", "tube light"], price_range: [18, 35] },
  { name: "Junction Box", service_line: "Electrical", kind: "material", popularity: 78, synonyms: ["electrical box", "switch box", "outlet box"], price_range: [8, 20] },
  
  // General/Common items
  { name: "Silicone Sealant", service_line: "General", kind: "material", popularity: 89, synonyms: ["silicone", "caulk", "sealant"], price_range: [6, 15] },
  { name: "Hacksaw Blade", service_line: "General", kind: "material", popularity: 84, synonyms: ["saw blade", "hacksaw", "metal cutting blade"], price_range: [4, 12] },
  { name: "Adjustable Wrench", service_line: "General", kind: "equipment", popularity: 91, synonyms: ["spanner", "adjustable spanner", "crescent wrench"], price_range: [15, 45] }
]

async function getServiceLineIds() {
  const { data, error } = await supabase
    .from('service_lines')
    .select('id, name')
  
  if (error) throw error
  
  const idMap: Record<string, number> = {}
  data?.forEach(line => {
    idMap[line.name] = line.id
  })
  
  return idMap
}

async function seedItems() {
  console.log('🌱 Starting demo items seed...')
  
  try {
    const serviceLineIds = await getServiceLineIds()
    console.log('📋 Service lines:', Object.keys(serviceLineIds))
    
    let itemsCreated = 0
    let synonymsCreated = 0
    let vendorItemsCreated = 0
    
    for (const item of DEMO_ITEMS) {
      const serviceLineId = serviceLineIds[item.service_line] || serviceLineIds['General']
      
      // Upsert canonical item
      const { data: canonicalItem, error: itemError } = await supabase
        .from('canonical_items')
        .upsert({
          canonical_name: item.name,
          kind: item.kind,
          service_line_id: serviceLineId,
          popularity: item.popularity,
          is_active: true
        }, { 
          onConflict: 'canonical_name,kind',
          ignoreDuplicates: false 
        })
        .select('id')
        .single()
      
      if (itemError) {
        console.warn(`⚠️ Failed to upsert ${item.name}:`, itemError.message)
        continue
      }
      
      itemsCreated++
      const itemId = canonicalItem.id
      
      // Upsert synonyms
      for (const synonym of item.synonyms) {
        const { error: synError } = await supabase
          .from('item_synonyms')
          .upsert({
            canonical_item_id: itemId,
            term: synonym,
            confidence: 0.9
          }, { onConflict: 'canonical_item_id,term' })
        
        if (!synError) synonymsCreated++
      }
      
      // Upsert vendor catalog item for demo vendor
      const { error: vendorError } = await supabase
        .from('vendor_catalog_items')
        .upsert({
          vendor_id: 'demo_vendor',
          canonical_item_id: itemId,
          vendor_item_name: item.name,
          min_price: item.price_range[0],
          max_price: item.price_range[1],
          is_active: true
        }, { onConflict: 'vendor_id,canonical_item_id' })
      
      if (!vendorError) vendorItemsCreated++
    }
    
    console.log(`✅ Seed complete:`)
    console.log(`   📦 Items: ${itemsCreated}/${DEMO_ITEMS.length}`)
    console.log(`   🔗 Synonyms: ${synonymsCreated}`)
    console.log(`   💰 Vendor items: ${vendorItemsCreated}`)
    
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  seedItems()
}

export { seedItems }