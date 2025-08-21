#!/usr/bin/env ts-node
/**
 * Fast, idempotent CSV seeder for canonical items, synonyms, and vendor catalogs
 * Auto-selects COPY (fast) vs REST (compatible) based on DATABASE_URL availability
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

// Command line args
const args = process.argv.slice(2);
const flags = {
  dir: args.find(a => a.startsWith('--dir='))?.split('=')[1] || './',
  dry: args.includes('--dry'),
  vendor: args.find(a => a.startsWith('--vendor='))?.split('=')[1] || 'demo_vendor',
  copyBatch: parseInt(args.find(a => a.startsWith('--copy-batch='))?.split('=')[1] || '5000'),
  restBatch: parseInt(args.find(a => a.startsWith('--rest-batch='))?.split('=')[1] || '500'),
};

interface CSVRow {
  [key: string]: string;
}

interface ServiceType {
  id: number;
  name: string;
  service_line_id: number;
}

interface ServiceLine {
  id: number;
  name: string;
}

/**
 * Auto-select fast path (pg COPY) vs slow path (Supabase REST)
 */
async function getClient() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl && !flags.dry) {
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      console.log('✅ Using fast path: pg COPY for bulk operations');
      return { client, mode: 'pg' as const };
    } catch (error) {
      console.warn('⚠️  pg connection failed, falling back to REST:', error.message);
    }
  }
  
  // Fallback to Supabase REST
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  );
  console.log('⚠️  Using slow path: Supabase REST with chunked upserts');
  return { client: supabase, mode: 'supabase' as const };
}

/**
 * Normalize CSV input data
 */
function normalizeRow(row: CSVRow): CSVRow {
  const normalized: CSVRow = {};
  for (const [key, value] of Object.entries(row)) {
    // Trim, collapse spaces, NFC normalize
    let clean = String(value || '').trim().replace(/\s+/g, ' ').normalize('NFC');
    // Lowercase synonyms for better matching
    if (key === 'synonym') {
      clean = clean.toLowerCase();
    }
    normalized[key] = clean;
  }
  return normalized;
}


/**
 * Get or create service line
 */
async function getOrCreateServiceLine(client: any, mode: 'pg' | 'supabase', name: string): Promise<number> {
  if (mode === 'pg') {
    const result = await client.query(`
      INSERT INTO service_lines (name) 
      VALUES ($1) 
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [name]);
    return result.rows[0].id;
  } else {
    const { data, error } = await client
      .from('service_lines')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
}

/**
 * Chunk array for batch processing
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Upsert canonical items (chunked)
 */
async function upsertCanonicalItems(
  client: any, 
  mode: 'pg' | 'supabase', 
  rows: CSVRow[], 
  serviceLineMap: Map<string, number>
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  const batchSize = mode === 'pg' ? flags.copyBatch : flags.restBatch;
  const chunks = chunk(rows, batchSize);
  
  for (const batch of chunks) {
    if (mode === 'pg') {
      // Use COPY for better performance with large datasets
      const values = batch.map(row => [
        normalizeRow(row).item_name,
        'material', // Default kind
        serviceLineMap.get(row.service_line) || null,
        parseInt(row.popularity) || 0,
        'true', // is_active
        'now()', // created_at
        'now()' // updated_at
      ]);
      
      const result = await client.query(`
        INSERT INTO canonical_items (canonical_name, kind, service_line_id, popularity, is_active, created_at, updated_at)
        SELECT * FROM unnest($1::text[], $2::item_kind[], $3::bigint[], $4::integer[], $5::boolean[], $6::timestamptz[], $7::timestamptz[])
        ON CONFLICT (canonical_name, kind) 
        DO UPDATE SET 
          service_line_id = EXCLUDED.service_line_id,
          popularity = CASE WHEN EXCLUDED.popularity > 0 THEN EXCLUDED.popularity ELSE canonical_items.popularity END,
          updated_at = now()
        RETURNING (xmax = 0) as inserted
      `, [
        values.map(v => v[0]), // names
        values.map(() => 'material'), // kinds
        values.map(v => v[2]), // service_line_ids
        values.map(v => v[3]), // popularity
        values.map(() => true), // is_active
        values.map(() => new Date().toISOString()), // created_at
        values.map(() => new Date().toISOString()), // updated_at
      ]);
      
      inserted += result.rows.filter(r => r.inserted).length;
      updated += result.rows.filter(r => !r.inserted).length;
      
    } else {
      // Use chunked REST upserts with deduplication
      const itemsMap = new Map();
      batch.forEach(row => {
        const name = normalizeRow(row).item_name;
        const key = `${name}-material`;
        if (!itemsMap.has(key)) {
          itemsMap.set(key, {
            canonical_name: name,
            kind: 'material' as const,
            service_line_id: serviceLineMap.get(row.service_line) || null,
            popularity: parseInt(row.popularity) || 0,
            is_active: true,
          });
        }
      });
      
      const items = Array.from(itemsMap.values());
      
      if (items.length > 0) {
        try {
          const { error, count } = await client
            .from('canonical_items')
            .insert(items);
            
          if (error && !error.message.includes('duplicate key value')) {
            throw error;
          }
          inserted += count || 0;
        } catch (err: any) {
          if (!err.message.includes('duplicate key value')) {
            throw err;
          }
          // Ignore duplicate key errors - items already exist
        }
      }
    }
    
    console.log(`📦 Processed ${batch.length} canonical items (batch ${chunks.indexOf(batch) + 1}/${chunks.length})`);
  }
  
  return { inserted, updated };
}

/**
 * Upsert item synonyms (chunked)
 */
async function upsertItemSynonyms(
  client: any, 
  mode: 'pg' | 'supabase', 
  rows: CSVRow[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  const batchSize = mode === 'pg' ? flags.copyBatch : flags.restBatch;
  const chunks = chunk(rows, batchSize);
  
  for (const batch of chunks) {
    if (mode === 'pg') {
      const result = await client.query(`
        INSERT INTO item_synonyms (canonical_item_id, synonym, weight)
        SELECT ci.id, s.synonym, 0.9
        FROM unnest($1::text[], $2::text[]) AS s(item_name, synonym)
        JOIN canonical_items ci ON ci.canonical_name = s.item_name AND ci.kind = 'material'
        ON CONFLICT (canonical_item_id, lower(synonym)) DO NOTHING
        RETURNING id
      `, [
        batch.map(row => row.item_name),
        batch.map(row => normalizeRow(row).synonym)
      ]);
      
      inserted += result.rowCount || 0;
      
    } else {
      // Resolve item IDs first
      const itemNames = Array.from(new Set(batch.map(row => row.item_name)));
      const { data: items, error: itemError } = await client
        .from('canonical_items')
        .select('id, canonical_name')
        .in('canonical_name', itemNames);
        
      if (itemError) throw itemError;
      
      const itemIdMap = new Map(items?.map(item => [item.canonical_name, item.id]) || []);
      
      const synonyms = batch
        .map(row => ({
          canonical_item_id: itemIdMap.get(row.item_name),
          synonym: normalizeRow(row).synonym,
          weight: 0.9
        }))
        .filter(s => s.canonical_item_id); // Only include items we found
        
      if (synonyms.length > 0) {
        const { error, count } = await client
          .from('item_synonyms')
          .upsert(synonyms, { onConflict: 'canonical_item_id,synonym', ignoreDuplicates: true });
          
        if (error) throw error;
        inserted += count || 0;
      }
    }
    
    console.log(`🔗 Processed ${batch.length} synonyms (batch ${chunks.indexOf(batch) + 1}/${chunks.length})`);
  }
  
  return { inserted, updated };
}

/**
 * Upsert vendor catalog items (chunked)  
 */
async function upsertVendorCatalogItems(
  client: any, 
  mode: 'pg' | 'supabase', 
  rows: CSVRow[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  const batchSize = mode === 'pg' ? flags.copyBatch : flags.restBatch;
  const chunks = chunk(rows, batchSize);
  
  for (const batch of chunks) {
    if (mode === 'pg') {
      const result = await client.query(`
        INSERT INTO vendor_catalog_items (vendor_id, canonical_item_id, min_price, max_price, unit, is_active)
        SELECT 
          v.vendor_id, 
          ci.id, 
          NULLIF(v.min_price, '')::numeric,
          NULLIF(v.max_price, '')::numeric,
          NULLIF(v.unit, ''),
          true
        FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS v(vendor_id, item_name, min_price, max_price, unit)
        JOIN canonical_items ci ON ci.canonical_name = v.item_name
        ON CONFLICT (vendor_id, canonical_item_id) 
        DO UPDATE SET 
          min_price = EXCLUDED.min_price,
          max_price = EXCLUDED.max_price,
          unit = EXCLUDED.unit,
          updated_at = now()
        RETURNING id
      `, [
        batch.map(row => row.vendor_id || flags.vendor),
        batch.map(row => row.item_name),
        batch.map(row => row.min_price || ''),
        batch.map(row => row.max_price || ''),
        batch.map(row => row.unit || '')
      ]);
      
      inserted += result.rowCount || 0;
      
    } else {
      // Similar pattern as synonyms - resolve item IDs first
      const itemNames = Array.from(new Set(batch.map(row => row.item_name)));
      const { data: items, error: itemError } = await client
        .from('canonical_items')
        .select('id, canonical_name')
        .in('canonical_name', itemNames);
        
      if (itemError) throw itemError;
      
      const itemIdMap = new Map(items?.map(item => [item.canonical_name, item.id]) || []);
      
      const vendorItems = batch
        .map(row => ({
          vendor_id: flags.vendor,
          canonical_item_id: itemIdMap.get(row.item_name),
          vendor_item_name: row.item_name,
          min_price: row.min_price ? parseFloat(row.min_price) : null,
          max_price: row.max_price ? parseFloat(row.max_price) : null,
          unit: row.unit || null,
          is_active: true
        }))
        .filter(v => v.canonical_item_id);
        
      if (vendorItems.length > 0) {
        const { error, count } = await client
          .from('vendor_catalog_items')
          .upsert(vendorItems, { onConflict: 'vendor_id,canonical_item_id' });
          
        if (error) throw error;
        inserted += count || 0;
      }
    }
    
    console.log(`💰 Processed ${batch.length} vendor items (batch ${chunks.indexOf(batch) + 1}/${chunks.length})`);
  }
  
  return { inserted, updated };
}

/**
 * Main seeding function
 */
async function seedFromCSV() {
  const startTime = Date.now();
  console.log('🌱 Starting CSV seeding...');
  console.log(`📁 Directory: ${flags.dir}`);
  console.log(`🏪 Vendor: ${flags.vendor}`);
  console.log(`${flags.dry ? '🧪 DRY RUN MODE' : '💾 LIVE MODE'}`);
  
  try {
    // Load CSVs
    const csvFiles = {
      items: join(flags.dir, 'seed_canonical_items.csv'),
      synonyms: join(flags.dir, 'seed_item_synonyms.csv'),
      vendor: join(flags.dir, 'seed_vendor_catalog_items.csv'),
    };
    
    for (const [name, path] of Object.entries(csvFiles)) {
      if (!existsSync(path)) {
        throw new Error(`Missing CSV file: ${path}`);
      }
    }
    
    // Parse CSVs
    const itemsData = parse(readFileSync(csvFiles.items), { columns: true, skip_empty_lines: true });
    const synonymsData = parse(readFileSync(csvFiles.synonyms), { columns: true, skip_empty_lines: true });
    const vendorData = parse(readFileSync(csvFiles.vendor), { columns: true, skip_empty_lines: true });
    
    console.log(`📊 Loaded: ${itemsData.length} items, ${synonymsData.length} synonyms, ${vendorData.length} vendor items`);
    
    if (flags.dry) {
      console.log('🧪 DRY RUN - would process data but not modify database');
      return;
    }
    
    // Get database client
    const { client, mode } = await getClient();
    
    try {
      // Ensure vendor_catalog_items table exists (if using direct pg connection)
      if (mode === 'pg') {
        await client.query(`
          CREATE TABLE IF NOT EXISTS vendor_catalog_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id TEXT NOT NULL,
            canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
            min_price NUMERIC,
            max_price NUMERIC,
            unit TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(vendor_id, canonical_item_id)
          );
        `);
      }
      // Build service line lookup map
      const serviceLineMap = new Map<string, number>();
      const uniqueLines = Array.from(new Set(itemsData.map(row => row.service_line)));
      
      for (const lineName of uniqueLines) {
        const id = await getOrCreateServiceLine(client, mode, lineName as string);
        serviceLineMap.set(lineName as string, id);
      }
      
      console.log(`📋 Resolved ${serviceLineMap.size} service lines`);
      
      // Process each CSV
      console.log('\n1️⃣ Skipping canonical items (already loaded)...');
      const itemsResult = { inserted: 0, updated: 0 }; // Skip items since they're already loaded
      
      console.log('\n2️⃣ Upserting item synonyms...');
      const synonymsResult = await upsertItemSynonyms(client, mode, synonymsData);
      
      console.log('\n3️⃣ Upserting vendor catalog items...');
      const vendorResult = await upsertVendorCatalogItems(client, mode, vendorData);
      
      // Summary
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ Seeding complete in ${elapsed}s:`);
      console.log(`   📦 Items: ${itemsResult.inserted} inserted, ${itemsResult.updated} updated`);
      console.log(`   🔗 Synonyms: ${synonymsResult.inserted} inserted, ${synonymsResult.updated} updated`);
      console.log(`   💰 Vendor items: ${vendorResult.inserted} inserted, ${vendorResult.updated} updated`);
      
    } finally {
      if (mode === 'pg') {
        await client.end();
      }
    }
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFromCSV();
}

export { seedFromCSV };