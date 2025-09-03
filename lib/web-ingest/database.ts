/**
 * Database service for web-ingested items
 * Handles upserting external sources and auto-linking to canonical items
 */

import { createClient } from '@supabase/supabase-js';
import { IngestResult } from './queue';
import { normalizeExternalItem, NormalizedExternalItem } from './normalizer';
import { classifyItem, ItemClassification, ClassificationInput } from './item-classifier';
import { aggregatePricesFromSources, PriceRangeData } from './price-aggregator';

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

export interface CanonicalItemRecord {
  id: string;
  kind: 'material' | 'equipment';
  canonicalName: string;
  defaultUom?: string;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  classification?: ItemClassification;
}

/**
 * Create canonical items from classified web search results
 */
export async function createCanonicalItemsFromWebResults(
  externalItems: ExternalItemRecord[], 
  classifications: ItemClassification[],
  createPriceRanges: boolean = true
): Promise<CanonicalItemRecord[]> {
  if (!supabase) {
    console.warn('[Web Ingest Database] Supabase not configured, skipping canonical item creation');
    return [];
  }

  if (externalItems.length === 0 || classifications.length !== externalItems.length) {
    console.warn('[Web Ingest Database] Mismatched external items and classifications');
    return [];
  }

  try {
    const canonicalItems: CanonicalItemRecord[] = [];

    for (let i = 0; i < externalItems.length; i++) {
      const externalItem = externalItems[i];
      const classification = classifications[i];

      try {
        // Normalize the canonical name
        const canonicalName = normalizeCanonicalName(externalItem.itemName);
        
        // Check if canonical item already exists (case-insensitive)
        const { data: existingItem } = await supabase
          .from('canonical_items')
          .select('id, kind, canonical_name')
          .ilike('canonical_name', canonicalName)
          .eq('kind', classification.kind)
          .single();

        if (existingItem) {
          console.log(`[Web Ingest Database] Canonical item already exists: ${existingItem.canonical_name} (${existingItem.kind})`);
          
          canonicalItems.push({
            id: existingItem.id,
            kind: existingItem.kind as 'material' | 'equipment',
            canonicalName: existingItem.canonical_name,
            defaultUom: externalItem.normalizedUnitOfMeasure || undefined,
            tags: [], // Existing tags would need to be fetched separately
            isActive: true,
            createdAt: new Date(),
            classification
          });
          continue;
        }

        // Create new canonical item
        const tags = generateTagsForItem(externalItem.itemName, classification.kind, externalItem.sourceVendor);
        
        const newCanonicalItem = {
          kind: classification.kind,
          canonical_name: canonicalName,
          default_uom: externalItem.normalizedUnitOfMeasure || getDefaultUomForKind(classification.kind),
          tags: JSON.stringify(tags),
          is_active: true,
        };

        const { data: createdItem, error: createError } = await supabase
          .from('canonical_items')
          .insert(newCanonicalItem)
          .select()
          .single();

        if (createError) {
          console.error(`[Web Ingest Database] Failed to create canonical item for ${externalItem.itemName}:`, createError);
          continue;
        }

        if (createdItem) {
          canonicalItems.push({
            id: createdItem.id,
            kind: createdItem.kind as 'material' | 'equipment',
            canonicalName: createdItem.canonical_name,
            defaultUom: createdItem.default_uom,
            tags,
            isActive: createdItem.is_active,
            createdAt: new Date(createdItem.created_at),
            classification
          });

          console.log(`[Web Ingest Database] Created canonical ${classification.kind}: ${canonicalName} (confidence: ${classification.confidence})`);

          // Create price range from web-sourced prices
          if (createPriceRanges) {
            await createPriceRangeFromWebSources(createdItem.id, externalItems, i);
          }
        }

      } catch (itemError) {
        console.error(`[Web Ingest Database] Error processing external item ${externalItem.id}:`, itemError);
        continue;
      }
    }

    console.log(`[Web Ingest Database] Created/found ${canonicalItems.length} canonical items from ${externalItems.length} external items`);
    return canonicalItems;

  } catch (error) {
    console.error('[Web Ingest Database] Error creating canonical items:', error);
    throw error;
  }
}

/**
 * Normalize item name for canonical storage
 */
function normalizeCanonicalName(itemName: string): string {
  return itemName
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim()
    .substring(0, 100);        // Limit length
}

/**
 * Generate searchable tags for an item
 */
function generateTagsForItem(itemName: string, kind: 'material' | 'equipment', vendor: string): string[] {
  const tags: string[] = [];
  
  // Add kind tag
  tags.push(kind);
  
  // Add vendor tag
  tags.push(vendor.toLowerCase());
  
  // Extract meaningful words from item name
  const words = itemName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !isStopWord(word));
  
  tags.push(...words.slice(0, 5)); // Limit to 5 words
  
  // Add category-specific tags based on keywords
  const categoryTags = getCategoryTags(itemName, kind);
  tags.push(...categoryTags);
  
  // Remove duplicates
  return Array.from(new Set(tags));
}

/**
 * Get category tags based on item characteristics
 */
function getCategoryTags(itemName: string, kind: 'material' | 'equipment'): string[] {
  const name = itemName.toLowerCase();
  const tags: string[] = [];
  
  if (kind === 'material') {
    if (/pipe|plumb|water/i.test(name)) tags.push('plumbing');
    if (/wire|electric|outlet|switch/i.test(name)) tags.push('electrical');
    if (/hvac|air|filter|duct/i.test(name)) tags.push('hvac');
    if (/screw|bolt|fastener|hardware/i.test(name)) tags.push('fasteners');
    if (/clean|chemical|lubricant/i.test(name)) tags.push('chemicals');
  } else if (kind === 'equipment') {
    if (/drill|saw|tool/i.test(name)) tags.push('power-tools');
    if (/wrench|hammer|hand/i.test(name)) tags.push('hand-tools');
    if (/meter|gauge|test/i.test(name)) tags.push('measurement');
    if (/safety|protect/i.test(name)) tags.push('safety');
    if (/light|lamp|fixture/i.test(name)) tags.push('lighting');
  }
  
  return tags;
}

/**
 * Check if word is a stop word
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'inch', 'pack', 'set', 'piece']);
  return stopWords.has(word.toLowerCase());
}

/**
 * Get default unit of measure for item kind
 */
function getDefaultUomForKind(kind: 'material' | 'equipment'): string {
  switch (kind) {
    case 'material':
      return 'each'; // Most materials are counted as individual pieces
    case 'equipment':
      return 'each'; // Equipment is typically rented/counted as individual items
    default:
      return 'each';
  }
}

/**
 * Create price range from web-sourced external items
 */
async function createPriceRangeFromWebSources(
  canonicalItemId: string,
  externalItems: ExternalItemRecord[],
  currentIndex: number
): Promise<void> {
  if (!supabase) {
    console.warn('[Web Ingest Database] Supabase not configured, skipping price range creation');
    return;
  }

  try {
    // Get prices from related external items (same search batch)
    const relatedItems = externalItems.slice(
      Math.max(0, currentIndex - 2),
      Math.min(externalItems.length, currentIndex + 3)
    );

    // Aggregate prices from multiple sources
    const priceRange = aggregatePricesFromSources(relatedItems, canonicalItemId);
    
    if (!priceRange || priceRange.sampleSize === 0) {
      console.log(`[Web Ingest Database] No valid prices to create range for canonical item ${canonicalItemId}`);
      return;
    }

    // Check if price range already exists
    const { data: existingRange } = await supabase
      .from('item_price_ranges')
      .select('id')
      .eq('canonical_item_id', canonicalItemId)
      .eq('currency', priceRange.currency)
      .single();

    if (existingRange) {
      // Update existing range with new data
      const { error: updateError } = await supabase
        .from('item_price_ranges')
        .update({
          min_price: priceRange.minPrice,
          max_price: priceRange.maxPrice,
          source: `Web Search (${priceRange.vendors.join(', ')})`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRange.id);

      if (updateError) {
        console.error(`[Web Ingest Database] Failed to update price range:`, updateError);
      } else {
        console.log(`[Web Ingest Database] Updated price range for ${canonicalItemId}: $${priceRange.minPrice.toFixed(2)} - $${priceRange.maxPrice.toFixed(2)}`);
      }
    } else {
      // Create new price range
      const { error: createError } = await supabase
        .from('item_price_ranges')
        .insert({
          canonical_item_id: canonicalItemId,
          currency: priceRange.currency,
          min_price: priceRange.minPrice,
          max_price: priceRange.maxPrice,
          source: `Web Search (${priceRange.vendors.join(', ')})`,
        });

      if (createError) {
        console.error(`[Web Ingest Database] Failed to create price range:`, createError);
      } else {
        console.log(`[Web Ingest Database] Created price range for ${canonicalItemId}: $${priceRange.minPrice.toFixed(2)} - $${priceRange.maxPrice.toFixed(2)} (${priceRange.sampleSize} prices, ${priceRange.confidence.toFixed(2)} confidence)`);
      }
    }
  } catch (error) {
    console.error(`[Web Ingest Database] Error creating price range for ${canonicalItemId}:`, error);
  }
}

/**
 * Enhanced web ingest pipeline with material/equipment classification
 */
export async function processWebIngestResults(results: IngestResult[]): Promise<{
  externalItems: ExternalItemRecord[];
  canonicalItems: CanonicalItemRecord[];
  canonicalLinks: CanonicalItemLink[];
  classifications: ItemClassification[];
}> {
  console.log(`[Web Ingest Database] Processing ${results.length} ingest results with classification`);

  // Step 1: Upsert external items
  const externalItems = await upsertExternalItems(results);
  
  // Step 2: Classify items as material or equipment
  const classificationInputs: ClassificationInput[] = externalItems.map(item => ({
    itemName: item.itemName,
    vendor: item.sourceVendor,
    sourceUrl: item.sourceUrl,
    price: item.lastPrice,
    unitOfMeasure: item.unitOfMeasure,
    packQty: item.packQty
  }));
  
  const classifications = await Promise.all(
    classificationInputs.map(input => classifyItem(input))
  );
  
  // Step 3: Create canonical items with classification
  const canonicalItems = await createCanonicalItemsFromWebResults(externalItems, classifications);
  
  // Step 4: Auto-link external items to canonical items
  const canonicalLinks = await autoLinkToCanonicalItems(externalItems);

  console.log(`[Web Ingest Database] Pipeline complete: ${externalItems.length} external items, ${canonicalItems.length} canonical items, ${canonicalLinks.length} links`);

  return {
    externalItems,
    canonicalItems,
    canonicalLinks,
    classifications,
  };
}