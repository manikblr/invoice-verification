/**
 * Web Ingester - Coordinates vendor-specific scraping strategies
 * Deterministic parsing without LLM dependency
 */

import { IngestResult } from './queue';
// TODO: Replace with actual tracing when available
async function trace(name: string, data: any, traceId?: string): Promise<string> {
  console.log(`[Trace ${name}]`, data);
  return traceId || `trace_${Date.now()}`;
}

export interface IngestRequest {
  itemName: string;
  itemDescription?: string;
  vendorHints?: string[]; // Preferred vendors to try first
}

export interface VendorStrategy {
  name: string;
  enabled: boolean;
  searchUrl: (query: string) => string;
  parse: (html: string, url: string) => Promise<ParsedItem[]>;
  rateLimit: number; // ms between requests
  priority: number; // Higher = try first
}

export interface ParsedItem {
  vendor: string;
  sourceUrl: string;
  sourceSku?: string;
  itemName: string;
  unitOfMeasure?: string;
  packQty?: number;
  priceString?: string;
  parsedPrice?: number;
  priceCurrency?: string;
  availability?: any;
  raw: any;
}

/**
 * Main web ingest function
 */
export async function performWebIngest(request: IngestRequest): Promise<IngestResult[]> {
  const startTime = Date.now();
  const { itemName, itemDescription, vendorHints } = request;

  // Check feature flag
  if (!isWebIngestEnabled()) {
    console.log('[Web Ingest] Feature disabled via FEATURE_WEB_INGEST flag');
    return [];
  }

  const traceId = await trace('web_ingest_v1', {
    item_name: itemName,
    item_description: itemDescription,
    vendor_hints: vendorHints,
  });

  try {
    console.log(`[Web Ingest] Starting ingest for: ${itemName}`);

    // Get available vendor strategies
    const strategies = getEnabledVendorStrategies();
    
    // Prioritize strategies based on hints and priority
    const prioritizedStrategies = prioritizeStrategies(strategies, vendorHints);

    const results: IngestResult[] = [];
    const errors: string[] = [];

    // Try each strategy in sequence (not parallel to respect rate limits)
    for (const strategy of prioritizedStrategies) {
      try {
        console.log(`[Web Ingest] Trying strategy: ${strategy.name}`);
        
        const strategyResults = await executeVendorStrategy(strategy, itemName);
        
        if (strategyResults.length > 0) {
          const processedResults = await processRawResults(strategyResults);
          results.push(...processedResults);
          console.log(`[Web Ingest] ${strategy.name} found ${strategyResults.length} results`);
        } else {
          console.log(`[Web Ingest] ${strategy.name} found no results`);
        }

        // Add rate limiting between vendors
        if (strategy.rateLimit > 0) {
          await sleep(strategy.rateLimit);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${strategy.name}: ${errorMsg}`);
        console.error(`[Web Ingest] ${strategy.name} failed: ${errorMsg}`);
        
        // Continue with next strategy
        continue;
      }
    }

    const durationMs = Date.now() - startTime;

    await trace('web_ingest_v1', {
      item_name: itemName,
      results_count: results.length,
      strategies_tried: prioritizedStrategies.map(s => s.name),
      duration_ms: durationMs,
      errors: errors.length > 0 ? errors : undefined,
    }, traceId);

    console.log(`[Web Ingest] Completed ingest for "${itemName}" in ${durationMs}ms: ${results.length} results`);

    return results;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Web Ingest] Fatal error for "${itemName}":`, error);

    await trace('web_ingest_v1', {
      item_name: itemName,
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    }, traceId);

    throw error;
  }
}

/**
 * Execute a vendor-specific strategy
 */
async function executeVendorStrategy(strategy: VendorStrategy, itemName: string): Promise<ParsedItem[]> {
  const searchUrl = strategy.searchUrl(itemName);
  
  // Import vendor-specific fetcher
  const { fetchWithPlaywright } = await import('./fetcher');
  
  const html = await fetchWithPlaywright(searchUrl, strategy.name);
  
  if (!html || html.length < 100) {
    throw new Error(`No valid HTML content received from ${strategy.name}`);
  }

  return await strategy.parse(html, searchUrl);
}

/**
 * Process raw parsed results into normalized IngestResult format
 */
async function processRawResults(rawResults: ParsedItem[]): Promise<IngestResult[]> {
  const { normalizeUom, computeLastPrice } = await import('./normalizer');
  
  const results: IngestResult[] = [];

  for (const raw of rawResults) {
    try {
      // Normalize UoM and compute per-unit price
      const normalizedUom = normalizeUom(raw.unitOfMeasure);
      const lastPrice = computeLastPrice(raw.parsedPrice, raw.packQty || 1);
      
      // Calculate confidence based on data completeness
      let confidence = 0.5; // Base score
      
      if (raw.sourceSku) confidence += 0.2;
      if (raw.parsedPrice && raw.parsedPrice > 0) confidence += 0.2;
      if (raw.unitOfMeasure) confidence += 0.1;
      if (raw.itemName && raw.itemName.length > 5) confidence += 0.1;
      
      // Cap at 1.0
      confidence = Math.min(confidence, 1.0);

      const result: IngestResult = {
        vendor: raw.vendor,
        sourceUrl: raw.sourceUrl,
        sourceSku: raw.sourceSku,
        itemName: raw.itemName,
        unitOfMeasure: normalizedUom,
        packQty: raw.packQty,
        lastPrice,
        lastPriceCurrency: raw.priceCurrency || 'USD',
        availability: raw.availability,
        raw: raw.raw,
        confidence,
        parseDurationMs: 0, // Set by caller
      };

      results.push(result);

    } catch (error) {
      console.error(`[Web Ingest] Failed to process result from ${raw.vendor}:`, error);
      continue;
    }
  }

  return results;
}

/**
 * Get enabled vendor strategies
 */
function getEnabledVendorStrategies(): VendorStrategy[] {
  const strategies: VendorStrategy[] = [];

  // Import and add Grainger strategy
  try {
    const { graingerStrategy } = require('./vendors/grainger');
    if (graingerStrategy.enabled) {
      strategies.push(graingerStrategy);
    }
  } catch (error) {
    console.warn('[Web Ingest] Grainger strategy not available');
  }

  // Import and add Home Depot strategy
  try {
    const { homeDepotStrategy } = require('./vendors/home-depot');
    if (homeDepotStrategy.enabled) {
      strategies.push(homeDepotStrategy);
    }
  } catch (error) {
    console.warn('[Web Ingest] Home Depot strategy not available');
  }

  return strategies;
}

/**
 * Prioritize strategies based on hints and base priority
 */
function prioritizeStrategies(strategies: VendorStrategy[], hints?: string[]): VendorStrategy[] {
  return strategies
    .map(strategy => ({
      ...strategy,
      adjustedPriority: strategy.priority + (hints?.includes(strategy.name) ? 100 : 0),
    }))
    .sort((a, b) => b.adjustedPriority - a.adjustedPriority);
}

/**
 * Check if web ingest feature is enabled
 */
function isWebIngestEnabled(): boolean {
  return process.env.FEATURE_WEB_INGEST === 'true';
}

/**
 * Simple sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}