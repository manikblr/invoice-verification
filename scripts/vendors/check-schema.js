#!/usr/bin/env node
/**
 * Quick schema check for vendor_catalog_items table
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

async function checkSchema() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  console.log('🔍 Checking vendor_catalog_items schema...')
  
  // Try to get table info
  const { data, error } = await supabase
    .from('vendor_catalog_items')
    .select('*')
    .limit(0)
  
  if (error) {
    console.log('❌ Error:', error.message)
    
    // Try a different approach - create the table if it doesn't exist
    console.log('🔧 Attempting to create vendor_catalog_items table...')
    
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS vendor_catalog_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          vendor_id TEXT NOT NULL,
          canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
          min_price NUMERIC,
          max_price NUMERIC,
          unit TEXT,
          sku TEXT,
          url TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(vendor_id, canonical_item_id)
        );
      `
    })
    
    if (createError) {
      console.log('❌ Create error:', createError.message)
    } else {
      console.log('✅ Table created or already exists')
    }
  } else {
    console.log('✅ vendor_catalog_items table exists')
  }
  
  // Check canonical_items count
  const { data: itemsData } = await supabase
    .from('canonical_items')
    .select('id')
  
  console.log(`📊 Current canonical_items count: ${itemsData?.length || 0}`)
  
  // Check service_lines
  const { data: linesData } = await supabase
    .from('service_lines')
    .select('id, name')
  
  console.log('📋 Available service_lines:', linesData)
}

checkSchema().catch(console.error)