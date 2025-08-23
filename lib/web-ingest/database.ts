/**
 * Database service for web-ingested items
 * Handles upserting external sources and auto-linking to canonical items
 */

import { createClient } from '@supabase/supabase-js';
import { IngestResult } from './queue';
import { normalizeExternalItem, NormalizedExternalItem } from './normalizer';

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Create client only if environment variables are available
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface ExternalItemRecord {
  id: number;
  sourceVendor: string;
  sourceUrl: string;
  sourceSku?: string;
  itemName: string;
  unitOfMeasure?: string;
  packQty?: number;
  normalizedUnitOfMeasure?: string;
  normalizedMultiplier?: number;
  lastPrice?: number;
  lastPriceCurrency: string;
  availability?: any;
  raw: any;
  createdAt: Date;
}

export interface CanonicalItemLink {
  id: number;
  canonicalItemId: string;
  externalSourceId: number;
  confidence: number;
  createdAt: Date;
}

/**
 * Upsert ingested items to external_item_sources table
 */
export async function upsertExternalItems(results: IngestResult[]): Promise<ExternalItemRecord[]> {
  if (!supabase) {
    console.warn('[Web Ingest Database] Supabase not configured, skipping upsert');
    return [];
  }

  if (results.length === 0) {
    return [];
  }

  try {
    const records: ExternalItemRecord[] = [];

    for (const result of results) {
      // Normalize the result
      const normalized = normalizeExternalItem(result.vendor, result.sourceUrl, result);

      // Prepare database record
      const dbRecord = {
        source_vendor: normalized.sourceVendor,
        source_url: normalized.sourceUrl,
        source_sku: normalized.sourceSku,
        item_name: normalized.itemName,
        unit_of_measure: normalized.unitOfMeasure,
        pack_qty: normalized.packQty,
        normalized_unit_of_measure: normalized.normalizedUnitOfMeasure,
        normalized_multiplier: normalized.normalizedMultiplier,
        last_price: normalized.lastPrice,
        last_price_currency: normalized.lastPriceCurrency,
        availability: result.availability,
        raw: normalized.raw,
        price_last_seen_at: new Date().toISOString(),
      };

      // Upsert (insert or update based on unique constraint: source_vendor + source_url)
      const { data, error } = await supabase
        .from('external_item_sources')
        .upsert(dbRecord, { 
          onConflict: 'source_vendor,source_url',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        console.error(`[Web Ingest Database] Failed to upsert item from ${result.vendor}:`, error);
        continue;
      }

      if (data) {
        records.push({
          id: data.id,
          sourceVendor: data.source_vendor,
          sourceUrl: data.source_url,
          sourceSku: data.source_sku,
          itemName: data.item_name,
          unitOfMeasure: data.unit_of_measure,
          packQty: data.pack_qty,
          normalizedUnitOfMeasure: data.normalized_unit_of_measure,
          normalizedMultiplier: data.normalized_multiplier,
          lastPrice: data.last_price,
          lastPriceCurrency: data.last_price_currency,
          availability: data.availability,
          raw: data.raw,
          createdAt: new Date(data.created_at),
        });

        console.log(`[Web Ingest Database] Upserted external item ${data.id}: ${data.item_name}`);
      }
    }

    console.log(`[Web Ingest Database] Successfully upserted ${records.length}/${results.length} external items`);
    return records;

  } catch (error) {
    console.error('[Web Ingest Database] Error upserting external items:', error);
    throw error;
  }
}

/**
 * Auto-link external items to canonical items using fuzzy matching
 */
export async function autoLinkToCanonicalItems(externalItems: ExternalItemRecord[]): Promise<CanonicalItemLink[]> {
  if (!supabase) {
    console.warn('[Web Ingest Database] Supabase not configured, skipping auto-linking');
    return [];
  }

  if (externalItems.length === 0) {
    return [];
  }

  try {
    const links: CanonicalItemLink[] = [];

    for (const externalItem of externalItems) {
      try {
        // Find potential canonical matches using fuzzy search
        const canonicalMatches = await findCanonicalMatches(externalItem);

        if (canonicalMatches.length > 0) {
          // Take the best match (highest confidence)
          const bestMatch = canonicalMatches[0];

          // Check if link already exists
          const { data: existingLink } = await supabase
            .from('canonical_item_links')
            .select('id')
            .eq('canonical_item_id', bestMatch.canonicalItemId)
            .eq('external_source_id', externalItem.id)
            .single();

          if (!existingLink) {
            // Create new link
            const { data: linkData, error: linkError } = await supabase
              .from('canonical_item_links')
              .insert({
                canonical_item_id: bestMatch.canonicalItemId,
                external_source_id: externalItem.id,
                confidence: bestMatch.confidence,
              })
              .select()
              .single();

            if (linkError) {
              console.error(`[Web Ingest Database] Failed to create link for external item ${externalItem.id}:`, linkError);
              continue;
            }

            if (linkData) {
              links.push({
                id: linkData.id,
                canonicalItemId: linkData.canonical_item_id,
                externalSourceId: linkData.external_source_id,
                confidence: linkData.confidence,
                createdAt: new Date(linkData.created_at),
              });

              console.log(`[Web Ingest Database] Linked external item ${externalItem.id} to canonical ${bestMatch.canonicalItemId} (confidence: ${bestMatch.confidence})`);
            }
          } else {
            console.log(`[Web Ingest Database] Link already exists for external item ${externalItem.id}`);
          }
        } else {
          console.log(`[Web Ingest Database] No canonical matches found for external item ${externalItem.id}: ${externalItem.itemName}`);
        }

      } catch (itemError) {
        console.error(`[Web Ingest Database] Error processing external item ${externalItem.id}:`, itemError);
        continue;
      }
    }

    console.log(`[Web Ingest Database] Created ${links.length} new canonical links`);
    return links;

  } catch (error) {
    console.error('[Web Ingest Database] Error auto-linking to canonical items:', error);
    throw error;
  }
}

interface CanonicalMatch {
  canonicalItemId: string;
  canonicalName: string;
  confidence: number;
}

/**
 * Find potential canonical item matches using fuzzy search
 */
async function findCanonicalMatches(externalItem: ExternalItemRecord): Promise<CanonicalMatch[]> {
  if (!supabase) {
    return [];
  }

  try {
    const searchQuery = externalItem.itemName.toLowerCase();
    
    // This is a simplified matching algorithm
    // In a real implementation, you might use:
    // - Full-text search with PostgreSQL's tsvector
    // - Fuzzy string matching with pg_trgm extension
    // - Machine learning similarity models
    
    // For now, we'll do a basic name similarity search
    const { data: canonicalItems, error } = await supabase
      .from('items') // Assuming canonical items are in 'items' table
      .select('id, name, description')
      .ilike('name', `%${searchQuery.split(' ')[0]}%`) // Match first word
      .limit(10);

    if (error) {
      console.error('[Web Ingest Database] Error searching canonical items:', error);
      return [];
    }

    if (!canonicalItems || canonicalItems.length === 0) {
      return [];
    }

    // Calculate confidence scores based on name similarity
    const matches: CanonicalMatch[] = canonicalItems
      .map(item => ({
        canonicalItemId: item.id,
        canonicalName: item.name,
        confidence: calculateNameSimilarity(externalItem.itemName, item.name),
      }))
      .filter(match => match.confidence > 0.6) // Only keep high-confidence matches
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending

    return matches;

  } catch (error) {
    console.error('[Web Ingest Database] Error finding canonical matches:', error);
    return [];
  }
}

/**
 * Calculate similarity between two item names (simplified algorithm)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const clean1 = name1.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const clean2 = name2.toLowerCase().replace(/[^\w\s]/g, '').trim();

  // Simple word overlap calculation
  const words1Array = clean1.split(/\s+/);
  const words2Array = clean2.split(/\s+/);
  const words1 = new Set(words1Array);
  const words2 = new Set(words2Array);
  
  const intersectionArray = words1Array.filter(x => words2.has(x));
  const unionArray = Array.from(new Set([...words1Array, ...words2Array]));
  
  const intersection = new Set(intersectionArray);
  const union = new Set(unionArray);
  
  // Jaccard similarity coefficient
  const similarity = intersection.size / union.size;
  
  // Boost score if one name contains the other
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    return Math.min(similarity + 0.2, 1.0);
  }
  
  return similarity;
}

/**
 * Get external items by vendor
 */
export async function getExternalItemsByVendor(vendor: string, limit = 50): Promise<ExternalItemRecord[]> {
  if (!supabase) {
    console.warn('[Web Ingest Database] Supabase not configured');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('external_item_sources')
      .select('*')
      .eq('source_vendor', vendor)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[Web Ingest Database] Error fetching external items for ${vendor}:`, error);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error(`[Web Ingest Database] Error fetching external items for ${vendor}:`, error);
    return [];
  }
}

/**
 * Complete web ingest pipeline: upsert items and create links
 */
export async function processWebIngestResults(results: IngestResult[]): Promise<{
  externalItems: ExternalItemRecord[];
  canonicalLinks: CanonicalItemLink[];
}> {
  console.log(`[Web Ingest Database] Processing ${results.length} ingest results`);

  const externalItems = await upsertExternalItems(results);
  const canonicalLinks = await autoLinkToCanonicalItems(externalItems);

  return {
    externalItems,
    canonicalLinks,
  };
}