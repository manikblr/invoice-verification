/**
 * Price Validation Service
 * Validates line item prices against canonical ranges and external sources
 * Supports provisional pricing from web-ingested data
 */

import { createClient } from '@supabase/supabase-js';

// TODO: Replace with actual tracing when available
async function trace(name: string, data: any, traceId?: string): Promise<string> {
  console.log(`[Trace ${name}]`, data);
  return traceId || `trace_${Date.now()}`;
}

export interface PriceValidationRequest {
  lineItemId: string;
  canonicalItemId?: string;
  unitPrice: number;
  currency: string;
  itemName?: string;
}

export interface PriceValidationResult {
  isValid: boolean;
  validationMethod: 'canonical_range' | 'external_provisional' | 'no_reference';
  canonicalItemId?: string;
  unitPrice: number;
  expectedRange?: [number, number];
  variancePercent?: number;
  confidence: number; // 0-1, how confident we are in the validation
  proposalId?: string;
  details: {
    canonicalPriceRange?: PriceRange;
    externalPriceSources?: ExternalPriceSource[];
    provisionalRange?: [number, number];
    outlierScore?: number;
  };
}

export interface PriceRange {
  canonicalItemId: string;
  currency: string;
  minPrice: number;
  maxPrice: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalPriceSource {
  id: string;
  sourceVendor: string;
  itemName: string;
  lastPrice: number;
  lastPriceCurrency: string;
  unitOfMeasure?: string;
  packQty: number;
  createdAt: Date;
  canonicalItemId?: string;
}

export interface ProvisionalPriceRange {
  minPrice: number;
  maxPrice: number;
  sampleSize: number;
  confidence: number;
  sources: string[];
}

export class PriceValidator {
  private supabase: any;
  private varianceThreshold = 0.20; // 20% variance threshold
  private provisionalToleranceMultiplier = 1.5; // More tolerance for external sources

  constructor() {
    // Initialize Supabase client with graceful fallback
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
    }
  }

  /**
   * Validate a line item price using multiple validation methods
   */
  async validatePrice(request: PriceValidationRequest): Promise<PriceValidationResult> {
    const startTime = Date.now();
    const { lineItemId, canonicalItemId, unitPrice, currency, itemName } = request;

    const traceId = await trace('price_validator_v1', {
      line_item_id: lineItemId,
      canonical_item_id: canonicalItemId,
      unit_price: unitPrice,
      currency,
    });

    try {
      console.log(`[Price Validator] Validating price for line item ${lineItemId}: $${unitPrice}`);

      // Strategy 1: Canonical price range validation (highest confidence)
      if (canonicalItemId) {
        const canonicalResult = await this.validateAgainstCanonicalRange(
          canonicalItemId, unitPrice, currency, lineItemId
        );
        
        if (canonicalResult) {
          await trace('price_validator_v1', {
            validation_method: 'canonical_range',
            is_valid: canonicalResult.isValid,
            variance_percent: canonicalResult.variancePercent,
            duration_ms: Date.now() - startTime,
          }, traceId);
          
          return canonicalResult;
        }
      }

      // Strategy 2: External price sources (provisional validation)
      const externalSources = await this.getExternalPriceSources(canonicalItemId, itemName);
      
      if (externalSources.length > 0) {
        const provisionalResult = await this.validateAgainstExternalSources(
          externalSources, unitPrice, currency, lineItemId, canonicalItemId
        );
        
        await trace('price_validator_v1', {
          validation_method: 'external_provisional',
          is_valid: provisionalResult.isValid,
          external_sources_count: externalSources.length,
          confidence: provisionalResult.confidence,
          duration_ms: Date.now() - startTime,
        }, traceId);
        
        return provisionalResult;
      }

      // Strategy 3: No reference data available
      const noReferenceResult: PriceValidationResult = {
        isValid: true, // Accept when no reference data
        validationMethod: 'no_reference',
        canonicalItemId,
        unitPrice,
        confidence: 0.1, // Very low confidence
        details: {},
      };

      await trace('price_validator_v1', {
        validation_method: 'no_reference',
        is_valid: true,
        confidence: 0.1,
        duration_ms: Date.now() - startTime,
      }, traceId);

      return noReferenceResult;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Price Validator] Validation failed for ${lineItemId}:`, error);

      await trace('price_validator_v1', {
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      }, traceId);

      throw error;
    }
  }

  /**
   * Validate against canonical price ranges (Strategy 1)
   */
  private async validateAgainstCanonicalRange(
    canonicalItemId: string,
    unitPrice: number,
    currency: string,
    lineItemId: string
  ): Promise<PriceValidationResult | null> {
    
    if (!this.supabase) {
      return null; // Database not configured
    }

    try {
      const { data: priceRanges, error } = await this.supabase
        .from('item_price_ranges')
        .select('*')
        .eq('canonical_item_id', canonicalItemId)
        .eq('currency', currency)
        .limit(1)
        .single();

      if (error || !priceRanges) {
        console.log(`[Price Validator] No canonical price range for ${canonicalItemId} in ${currency}`);
        return null;
      }

      const priceRange: PriceRange = {
        canonicalItemId: priceRanges.canonical_item_id,
        currency: priceRanges.currency,
        minPrice: priceRanges.min_price,
        maxPrice: priceRanges.max_price,
        source: priceRanges.source,
        createdAt: new Date(priceRanges.created_at),
        updatedAt: new Date(priceRanges.updated_at),
      };

      const isWithinRange = unitPrice >= priceRange.minPrice && unitPrice <= priceRange.maxPrice;
      const variancePercent = this.calculateVariancePercent(unitPrice, priceRange.minPrice, priceRange.maxPrice);

      let proposalId: string | undefined;

      // Create PRICE_RANGE_ADJUST proposal if variance is significant
      if (variancePercent > this.varianceThreshold) {
        proposalId = await this.createPriceRangeAdjustProposal(
          canonicalItemId, priceRange, unitPrice, variancePercent
        );
      }

      return {
        isValid: isWithinRange,
        validationMethod: 'canonical_range',
        canonicalItemId,
        unitPrice,
        expectedRange: [priceRange.minPrice, priceRange.maxPrice],
        variancePercent,
        confidence: 0.9, // High confidence for canonical data
        proposalId,
        details: {
          canonicalPriceRange: priceRange,
        },
      };

    } catch (error) {
      console.error(`[Price Validator] Failed to validate against canonical range:`, error);
      return null;
    }
  }

  /**
   * Validate against external price sources (Strategy 2)
   */
  private async validateAgainstExternalSources(
    externalSources: ExternalPriceSource[],
    unitPrice: number,
    currency: string,
    lineItemId: string,
    canonicalItemId?: string
  ): Promise<PriceValidationResult> {

    // Filter sources by currency and convert to common currency if needed
    const relevantSources = externalSources.filter(source => 
      source.lastPriceCurrency === currency || source.lastPriceCurrency === 'USD'
    );

    if (relevantSources.length === 0) {
      return {
        isValid: true,
        validationMethod: 'external_provisional',
        canonicalItemId,
        unitPrice,
        confidence: 0.2,
        details: { externalPriceSources: externalSources },
      };
    }

    // Calculate provisional price range from external sources
    const prices = relevantSources.map(s => s.lastPrice).sort((a, b) => a - b);
    const provisionalRange = this.calculateProvisionalRange(prices);

    const isWithinProvisionalRange = unitPrice >= provisionalRange.minPrice && 
                                     unitPrice <= provisionalRange.maxPrice;

    // Calculate outlier score (how far from median)
    const median = prices[Math.floor(prices.length / 2)];
    const outlierScore = Math.abs(unitPrice - median) / median;

    // Use more tolerant threshold for provisional validation
    const adjustedThreshold = this.varianceThreshold * this.provisionalToleranceMultiplier;
    const variancePercent = this.calculateVariancePercent(
      unitPrice, provisionalRange.minPrice, provisionalRange.maxPrice
    );

    return {
      isValid: isWithinProvisionalRange || variancePercent <= adjustedThreshold,
      validationMethod: 'external_provisional',
      canonicalItemId,
      unitPrice,
      expectedRange: [provisionalRange.minPrice, provisionalRange.maxPrice],
      variancePercent,
      confidence: this.calculateProvisionalConfidence(relevantSources.length, outlierScore),
      details: {
        externalPriceSources: relevantSources,
        provisionalRange: [provisionalRange.minPrice, provisionalRange.maxPrice],
        outlierScore,
      },
    };
  }

  /**
   * Get external price sources for validation
   */
  private async getExternalPriceSources(
    canonicalItemId?: string, 
    itemName?: string
  ): Promise<ExternalPriceSource[]> {
    
    if (!this.supabase) {
      return [];
    }

    try {
      let query = this.supabase
        .from('external_item_sources')
        .select('*')
        .not('last_price', 'is', null)
        .gt('last_price', 0)
        .order('created_at', { ascending: false })
        .limit(20);

      // Strategy 1: Find by canonical item link
      if (canonicalItemId) {
        const { data: linkedSources } = await query
          .in('id', 
            this.supabase
              .from('canonical_item_links')
              .select('external_source_id')
              .eq('canonical_item_id', canonicalItemId)
          );

        if (linkedSources && linkedSources.length > 0) {
          return this.mapToExternalPriceSource(linkedSources);
        }
      }

      // Strategy 2: Fuzzy name matching if no canonical links
      if (itemName && itemName.length > 3) {
        const { data: nameMatchSources } = await query
          .textSearch('item_name', itemName.split(' ').join(' | '));

        if (nameMatchSources && nameMatchSources.length > 0) {
          return this.mapToExternalPriceSource(nameMatchSources.slice(0, 10));
        }
      }

      return [];

    } catch (error) {
      console.error('[Price Validator] Failed to get external price sources:', error);
      return [];
    }
  }

  /**
   * Calculate provisional price range from external sources
   */
  private calculateProvisionalRange(prices: number[]): ProvisionalPriceRange {
    if (prices.length === 0) {
      return { minPrice: 0, maxPrice: 0, sampleSize: 0, confidence: 0, sources: [] };
    }

    if (prices.length === 1) {
      const price = prices[0];
      return {
        minPrice: price * 0.8, // 20% buffer below
        maxPrice: price * 1.2, // 20% buffer above
        sampleSize: 1,
        confidence: 0.3,
        sources: [],
      };
    }

    // Use IQR (Interquartile Range) method for robust range calculation
    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);
    const q1 = prices[q1Index];
    const q3 = prices[q3Index];
    const iqr = q3 - q1;

    // Extend range by 1.5 * IQR for outlier detection
    const minPrice = Math.max(0, q1 - 1.5 * iqr);
    const maxPrice = q3 + 1.5 * iqr;

    const confidence = Math.min(0.7, 0.3 + (prices.length * 0.05)); // Max 0.7 confidence

    return {
      minPrice,
      maxPrice,
      sampleSize: prices.length,
      confidence,
      sources: [],
    };
  }

  /**
   * Calculate confidence score for provisional validation
   */
  private calculateProvisionalConfidence(sampleSize: number, outlierScore: number): number {
    let confidence = 0.3; // Base confidence for external sources

    // Increase confidence with more samples
    confidence += Math.min(0.3, sampleSize * 0.05);

    // Decrease confidence if price is an outlier
    confidence -= Math.min(0.2, outlierScore * 0.5);

    return Math.max(0.1, Math.min(0.7, confidence));
  }

  /**
   * Calculate variance percentage
   */
  private calculateVariancePercent(price: number, minPrice: number, maxPrice: number): number {
    if (price >= minPrice && price <= maxPrice) {
      return 0; // Within range
    }

    if (price < minPrice) {
      return (minPrice - price) / minPrice;
    } else {
      return (price - maxPrice) / maxPrice;
    }
  }

  /**
   * Create PRICE_RANGE_ADJUST proposal
   */
  private async createPriceRangeAdjustProposal(
    canonicalItemId: string,
    currentRange: PriceRange,
    observedPrice: number,
    variancePercent: number
  ): Promise<string | undefined> {
    
    if (!this.supabase) {
      return undefined;
    }

    try {
      const reason = observedPrice < currentRange.minPrice 
        ? `Price $${observedPrice} below current min $${currentRange.minPrice}`
        : `Price $${observedPrice} above current max $${currentRange.maxPrice}`;

      // Suggest range adjustment with 5% buffer
      const newMinPrice = observedPrice < currentRange.minPrice 
        ? observedPrice * 0.95 
        : currentRange.minPrice;
      const newMaxPrice = observedPrice > currentRange.maxPrice 
        ? observedPrice * 1.05 
        : currentRange.maxPrice;

      const proposalPayload = {
        canonical_item_id: canonicalItemId,
        old_range: [currentRange.minPrice, currentRange.maxPrice],
        new_range: [newMinPrice, newMaxPrice],
        reason,
        variance_percent: variancePercent,
        triggering_price: observedPrice,
      };

      // Mock proposal creation - would integrate with actual proposal system
      const proposalId = `price_adjust_${Date.now()}_${canonicalItemId}`;
      
      console.log(`[Price Validator] Created PRICE_RANGE_ADJUST proposal ${proposalId}:`, proposalPayload);
      
      return proposalId;

    } catch (error) {
      console.error('[Price Validator] Failed to create proposal:', error);
      return undefined;
    }
  }

  /**
   * Map database records to ExternalPriceSource interface
   */
  private mapToExternalPriceSource(records: any[]): ExternalPriceSource[] {
    return records.map(record => ({
      id: record.id,
      sourceVendor: record.source_vendor,
      itemName: record.item_name,
      lastPrice: record.last_price,
      lastPriceCurrency: record.last_price_currency,
      unitOfMeasure: record.unit_of_measure,
      packQty: record.pack_qty,
      createdAt: new Date(record.created_at),
      canonicalItemId: record.canonical_item_id,
    }));
  }
}

// Singleton instance
export const priceValidator = new PriceValidator();