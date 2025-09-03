/**
 * Price Aggregator for Web Search Results
 * Collects and aggregates prices from multiple vendors to create price ranges
 */

import { ExternalItemRecord } from './database';

export interface PriceRangeData {
  canonicalItemId: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  sampleSize: number;
  vendors: string[];
  confidence: number;
  currency: string;
}

/**
 * Aggregate prices from multiple external sources into a price range
 */
export function aggregatePricesFromSources(
  externalItems: ExternalItemRecord[],
  canonicalItemId: string
): PriceRangeData | null {
  
  if (!externalItems || externalItems.length === 0) {
    return null;
  }

  // Filter items with valid prices
  const itemsWithPrices = externalItems.filter(item => 
    item.lastPrice && 
    item.lastPrice > 0 && 
    item.lastPriceCurrency === 'USD'
  );

  if (itemsWithPrices.length === 0) {
    console.log('[Price Aggregator] No valid prices found in external items');
    return null;
  }

  // Extract prices and vendors
  const prices = itemsWithPrices.map(item => item.lastPrice!);
  const vendors = Array.from(new Set(itemsWithPrices.map(item => item.sourceVendor)));
  
  // Sort prices for statistical calculations
  const sortedPrices = Array.from(prices).sort((a, b) => a - b);
  
  // Calculate statistics
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const medianPrice = calculateMedian(sortedPrices);
  
  // Calculate confidence based on sample size and variance
  const confidence = calculateConfidence(prices, vendors.length);
  
  // Apply intelligent range adjustments
  const adjustedRange = applyIntelligentRangeAdjustments(
    minPrice,
    maxPrice,
    avgPrice,
    medianPrice,
    prices.length
  );

  return {
    canonicalItemId,
    minPrice: adjustedRange.min,
    maxPrice: adjustedRange.max,
    avgPrice,
    medianPrice,
    sampleSize: prices.length,
    vendors,
    confidence,
    currency: 'USD'
  };
}

/**
 * Calculate median price
 */
function calculateMedian(sortedPrices: number[]): number {
  const mid = Math.floor(sortedPrices.length / 2);
  
  if (sortedPrices.length % 2 === 0) {
    return (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
  }
  
  return sortedPrices[mid];
}

/**
 * Calculate confidence score based on sample size and price variance
 */
function calculateConfidence(prices: number[], vendorCount: number): number {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence with more samples
  if (prices.length >= 3) confidence += 0.2;
  if (prices.length >= 5) confidence += 0.1;
  
  // Increase confidence with more vendors
  if (vendorCount >= 2) confidence += 0.1;
  if (vendorCount >= 3) confidence += 0.1;
  
  // Calculate coefficient of variation (lower is better)
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const coeffOfVariation = stdDev / mean;
  
  // Lower variation increases confidence
  if (coeffOfVariation < 0.2) confidence += 0.1; // Low variation
  if (coeffOfVariation < 0.1) confidence += 0.1; // Very low variation
  
  return Math.min(confidence, 0.95); // Cap at 95% for web-sourced data
}

/**
 * Apply intelligent adjustments to price range based on statistical analysis
 */
function applyIntelligentRangeAdjustments(
  minPrice: number,
  maxPrice: number,
  avgPrice: number,
  medianPrice: number,
  sampleSize: number
): { min: number; max: number } {
  
  // For single sample, add buffer
  if (sampleSize === 1) {
    return {
      min: minPrice * 0.8,  // 20% below
      max: maxPrice * 1.3   // 30% above (asymmetric to account for markup)
    };
  }
  
  // For small samples (2-3), use wider range
  if (sampleSize <= 3) {
    const range = maxPrice - minPrice;
    return {
      min: Math.max(0, minPrice - range * 0.2),
      max: maxPrice + range * 0.3
    };
  }
  
  // For larger samples, use IQR method to handle outliers
  const prices = [minPrice, avgPrice, medianPrice, maxPrice];
  const q1 = prices[Math.floor(prices.length * 0.25)];
  const q3 = prices[Math.floor(prices.length * 0.75)];
  const iqr = q3 - q1;
  
  // Standard IQR outlier boundaries with slight expansion for market variance
  return {
    min: Math.max(0, q1 - 1.2 * iqr),
    max: q3 + 1.5 * iqr
  };
}

/**
 * Create a formatted price range summary for display
 */
export function formatPriceRangeSummary(priceRange: PriceRangeData): string {
  const { minPrice, maxPrice, avgPrice, sampleSize, vendors, confidence } = priceRange;
  
  const confidenceText = confidence >= 0.8 ? 'High' : 
                         confidence >= 0.6 ? 'Medium' : 'Low';
  
  return `Price Range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)} ` +
         `(Avg: $${avgPrice.toFixed(2)}, ` +
         `${sampleSize} prices from ${vendors.length} vendor(s), ` +
         `${confidenceText} confidence)`;
}

/**
 * Check if a price falls within acceptable range with tolerance
 */
export function isPriceWithinRange(
  price: number,
  priceRange: PriceRangeData,
  tolerance: number = 0.1 // 10% tolerance by default
): { isValid: boolean; variance: number; reason?: string } {
  
  const { minPrice, maxPrice } = priceRange;
  
  // Calculate tolerance-adjusted boundaries
  const adjustedMin = minPrice * (1 - tolerance);
  const adjustedMax = maxPrice * (1 + tolerance);
  
  if (price < adjustedMin) {
    const variance = (adjustedMin - price) / adjustedMin;
    return {
      isValid: false,
      variance,
      reason: `Price $${price} is ${(variance * 100).toFixed(1)}% below minimum range`
    };
  }
  
  if (price > adjustedMax) {
    const variance = (price - adjustedMax) / adjustedMax;
    return {
      isValid: false,
      variance,
      reason: `Price $${price} is ${(variance * 100).toFixed(1)}% above maximum range`
    };
  }
  
  // Calculate how far from median as a quality indicator
  const medianVariance = Math.abs(price - priceRange.medianPrice) / priceRange.medianPrice;
  
  return {
    isValid: true,
    variance: medianVariance,
    reason: `Price within acceptable range (${(medianVariance * 100).toFixed(1)}% from median)`
  };
}