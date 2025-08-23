/**
 * Home Depot vendor strategy - deterministic HTML parsing
 * No LLM dependency, pure CSS selector + regex parsing
 */

import { VendorStrategy, ParsedItem } from '../ingester';

export const homeDepotStrategy: VendorStrategy = {
  name: 'home_depot',
  enabled: true,
  rateLimit: 1500, // 1.5 second delay between requests
  priority: 8, // High priority for common items
  
  searchUrl: (query: string) => {
    const encodedQuery = encodeURIComponent(query);
    return `https://www.homedepot.com/s/${encodedQuery}?NCNI-5`;
  },

  parse: async (html: string, url: string): Promise<ParsedItem[]> => {
    const results: ParsedItem[] = [];

    try {
      // Parse Home Depot product pods
      const productPods = parseHomeDepotProductPods(html, url);
      results.push(...productPods);

      // Fallback to generic product parsing if no pods found
      if (results.length === 0) {
        const genericResults = parseHomeDepotGeneric(html, url);
        results.push(...genericResults);
      }

    } catch (error) {
      console.error('[Home Depot Parser] Parse error:', error);
    }

    console.log(`[Home Depot Parser] Parsed ${results.length} items from ${url}`);
    return results;
  }
};

/**
 * Parse Home Depot product pods (main listing format)
 */
function parseHomeDepotProductPods(html: string, sourceUrl: string): ParsedItem[] {
  const results: ParsedItem[] = [];

  try {
    // Find product pods using regex
    const podMatches = html.match(/<div[^>]*class="[^"]*product-pod[^"]*"[^>]*>(.*?)<\/div>/g);
    
    if (podMatches) {
      for (const podHtml of podMatches) {
        try {
          const result: ParsedItem = {
            vendor: 'home_depot',
            sourceUrl,
            sourceSku: extractHomeDepotSku(podHtml),
            itemName: extractHomeDepotProductTitle(podHtml),
            unitOfMeasure: normalizeHomeDepotUom(extractHomeDepotUom(podHtml)),
            packQty: 1, // Home Depot typically shows per-unit pricing
            priceString: extractHomeDepotPrice(podHtml),
            parsedPrice: parsePrice(extractHomeDepotPrice(podHtml)),
            priceCurrency: 'USD',
            availability: {
              inStock: true, // Assume available if showing in search
              status: 'available',
            },
            raw: { html: podHtml },
          };

          if (result.itemName && result.itemName.length > 0) {
            results.push(result);
          }

        } catch (itemError) {
          console.warn('[Home Depot Parser] Failed to parse product pod:', itemError);
        }
      }
    }

  } catch (error) {
    console.error('[Home Depot Parser] Product pod parsing error:', error);
  }

  return results;
}

/**
 * Generic Home Depot parsing for different page formats
 */
function parseHomeDepotGeneric(html: string, sourceUrl: string): ParsedItem[] {
  const results: ParsedItem[] = [];

  try {
    // Look for any product containers
    const productMatches = html.match(/<div[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/div>/g);
    
    if (productMatches) {
      for (const productHtml of productMatches) {
        try {
          const itemName = extractTextByPattern(productHtml, /<.*?product.*?title.*?>(.*?)</) ||
                           extractTextByPattern(productHtml, /<.*?title.*?>(.*?)</) ||
                           extractTextByClass(productHtml, 'product-title');

          const priceString = extractTextByPattern(productHtml, /<.*?price.*?>(.*?)</) ||
                              extractTextByClass(productHtml, 'price');

          if (itemName && itemName.length > 5) {
            const result: ParsedItem = {
              vendor: 'home_depot',
              sourceUrl,
              sourceSku: extractTextByPattern(productHtml, /Model[#\s]*([A-Z0-9]+)/i),
              itemName,
              unitOfMeasure: 'EACH',
              packQty: 1,
              priceString,
              parsedPrice: parsePrice(priceString),
              priceCurrency: 'USD',
              availability: {
                inStock: true,
                status: 'available',
              },
              raw: { html: productHtml },
            };

            results.push(result);
          }

        } catch (itemError) {
          console.warn('[Home Depot Parser] Failed to parse generic product:', itemError);
        }
      }
    }

  } catch (error) {
    console.error('[Home Depot Parser] Generic parsing error:', error);
  }

  return results;
}

/**
 * Extract Home Depot product title
 */
function extractHomeDepotProductTitle(html: string): string | undefined {
  // Try multiple selectors that Home Depot uses
  const patterns = [
    /<span[^>]*class="[^"]*product-title[^"]*"[^>]*>(.*?)<\/span>/i,
    /<div[^>]*class="[^"]*product-header[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/i,
    /<.*?product.*?title.*?>(.*?)</i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract Home Depot price
 */
function extractHomeDepotPrice(html: string): string | undefined {
  const patterns = [
    /<span[^>]*class="[^"]*price[^"]*"[^>]*>(.*?)<\/span>/i,
    /<div[^>]*class="[^"]*price-detailed[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/i,
    /\$\d+\.\d{2}/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Extract Home Depot SKU/Model number
 */
function extractHomeDepotSku(html: string): string | undefined {
  const patterns = [
    /<span[^>]*class="[^"]*sku[^"]*"[^>]*>.*?Model[#\s]*([A-Z0-9]+)/i,
    /<span[^>]*class="[^"]*product-identifier[^"]*"[^>]*>.*?Model[#\s]*([A-Z0-9]+)/i,
    /Model[#\s]*([A-Z0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Extract Home Depot unit of measure (if available)
 */
function extractHomeDepotUom(html: string): string | undefined {
  // Home Depot doesn't always specify UoM clearly, defaults to "each"
  const patterns = [
    /per\s+(each|piece|unit|foot|gallon|pack)/i,
    /\/\s*(each|piece|unit|ft|gal|pk)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  return 'each'; // Default assumption
}

/**
 * Utility functions
 */
function extractTextByPattern(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  if (match && match[1]) {
    return cleanText(match[1]);
  }
  return undefined;
}

function extractTextByClass(html: string, className: string): string | undefined {
  const regex = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>(.*?)<\/[^>]*>`, 'i');
  const match = html.match(regex);
  if (match && match[1]) {
    return cleanText(match[1]);
  }
  return undefined;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parsePrice(priceString?: string): number {
  if (!priceString) return 0;
  
  const cleaned = priceString.replace(/[^\d.,]/g, '');
  const number = parseFloat(cleaned.replace(/,/g, ''));
  
  return isNaN(number) ? 0 : number;
}

/**
 * Normalize Home Depot-specific unit of measure
 */
function normalizeHomeDepotUom(uom?: string): string | undefined {
  if (!uom) return 'EACH';
  
  const normalized = uom.toLowerCase().trim();
  
  const mappings: { [key: string]: string } = {
    'each': 'EACH',
    'piece': 'EACH',
    'unit': 'EACH',
    'foot': 'FEET',
    'ft': 'FEET',
    'gallon': 'GALLON',
    'gal': 'GALLON',
    'pack': 'PACK',
    'pk': 'PACK',
    'box': 'BOX',
    'case': 'CASE',
  };

  return mappings[normalized] || normalized.toUpperCase();
}