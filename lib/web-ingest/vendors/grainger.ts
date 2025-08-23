/**
 * Grainger vendor strategy - deterministic HTML parsing
 * No LLM dependency, pure CSS selector + regex parsing
 */

import { VendorStrategy, ParsedItem } from '../ingester';

export const graingerStrategy: VendorStrategy = {
  name: 'grainger',
  enabled: true,
  rateLimit: 2000, // 2 second delay between requests
  priority: 9, // High priority - reliable vendor
  
  searchUrl: (query: string) => {
    const encodedQuery = encodeURIComponent(query);
    return `https://www.grainger.com/search?searchQuery=${encodedQuery}&searchType=products`;
  },

  parse: async (html: string, url: string): Promise<ParsedItem[]> => {
    const results: ParsedItem[] = [];

    try {
      // Try multiple parsing strategies for Grainger
      
      // Strategy 1: Parse JSON data embedded in script tags
      const jsonResults = parseGraingerJsonData(html, url);
      if (jsonResults.length > 0) {
        results.push(...jsonResults);
      }

      // Strategy 2: Parse HTML product tiles if JSON not available
      if (results.length === 0) {
        const htmlResults = parseGraingerHtmlTiles(html, url);
        results.push(...htmlResults);
      }

    } catch (error) {
      console.error('[Grainger Parser] Parse error:', error);
    }

    console.log(`[Grainger Parser] Parsed ${results.length} items from ${url}`);
    return results;
  }
};

/**
 * Parse structured JSON data from Grainger pages
 */
function parseGraingerJsonData(html: string, sourceUrl: string): ParsedItem[] {
  const results: ParsedItem[] = [];

  try {
    // Look for JSON data in script tags
    const jsonMatches = html.match(/<script[^>]*class="product-data"[^>]*>(.*?)<\/script>/g);
    
    if (jsonMatches) {
      for (const match of jsonMatches) {
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/g, '').trim();
        
        try {
          const data = JSON.parse(jsonContent);
          
          if (data.products && Array.isArray(data.products)) {
            for (const product of data.products) {
              const result: ParsedItem = {
                vendor: 'grainger',
                sourceUrl,
                sourceSku: product.sku || product.id,
                itemName: product.name || product.title || '',
                unitOfMeasure: normalizeGraingerUom(product.uom),
                packQty: product.pack_qty || 1,
                priceString: `$${product.price}`,
                parsedPrice: parseFloat(product.price) || 0,
                priceCurrency: product.currency || 'USD',
                availability: {
                  status: product.stock || product.availability,
                  inStock: product.stock === 'in_stock' || product.stock === 'available',
                },
                raw: product,
              };

              if (result.itemName && result.itemName.length > 0) {
                results.push(result);
              }
            }
          }
        } catch (parseError) {
          console.warn('[Grainger Parser] Failed to parse JSON data:', parseError);
        }
      }
    }

  } catch (error) {
    console.error('[Grainger Parser] JSON parsing error:', error);
  }

  return results;
}

/**
 * Parse HTML product tiles using CSS selectors
 */
function parseGraingerHtmlTiles(html: string, sourceUrl: string): ParsedItem[] {
  const results: ParsedItem[] = [];

  try {
    // Use regex to find product tiles (since we don't have DOM parsing in Node.js)
    const tileMatches = html.match(/<div[^>]*class="[^"]*product-tile[^"]*"[^>]*>(.*?)<\/div>/g);
    
    if (tileMatches) {
      for (const tileHtml of tileMatches) {
        try {
          const result: ParsedItem = {
            vendor: 'grainger',
            sourceUrl,
            sourceSku: extractTextByClass(tileHtml, 'product-sku'),
            itemName: extractTextByClass(tileHtml, 'product-name'),
            unitOfMeasure: normalizeGraingerUom(extractTextByClass(tileHtml, 'product-uom')),
            packQty: 1,
            priceString: extractTextByClass(tileHtml, 'product-price'),
            parsedPrice: parsePrice(extractTextByClass(tileHtml, 'product-price')),
            priceCurrency: 'USD',
            availability: {
              status: extractTextByClass(tileHtml, 'product-availability'),
              inStock: extractTextByClass(tileHtml, 'product-availability')?.toLowerCase().includes('in stock') || false,
            },
            raw: { html: tileHtml },
          };

          // Clean up SKU
          if (result.sourceSku) {
            result.sourceSku = result.sourceSku.replace(/^SKU:\s*/i, '').trim();
          }

          if (result.itemName && result.itemName.length > 0) {
            results.push(result);
          }

        } catch (itemError) {
          console.warn('[Grainger Parser] Failed to parse product tile:', itemError);
        }
      }
    }

  } catch (error) {
    console.error('[Grainger Parser] HTML parsing error:', error);
  }

  return results;
}

/**
 * Extract text content from HTML by class name
 */
function extractTextByClass(html: string, className: string): string | undefined {
  const regex = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>(.*?)<\/[^>]*>`, 'i');
  const match = html.match(regex);
  if (match && match[1]) {
    return match[1].replace(/<[^>]*>/g, '').trim();
  }
  return undefined;
}

/**
 * Parse price strings like "$12.45" into numbers
 */
function parsePrice(priceString?: string): number {
  if (!priceString) return 0;
  
  const cleaned = priceString.replace(/[^\d.,]/g, '');
  const number = parseFloat(cleaned.replace(/,/g, ''));
  
  return isNaN(number) ? 0 : number;
}

/**
 * Normalize Grainger-specific unit of measure codes
 */
function normalizeGraingerUom(uom?: string): string | undefined {
  if (!uom) return undefined;
  
  const normalized = uom.toUpperCase().trim();
  
  // Grainger-specific mappings
  const mappings: { [key: string]: string } = {
    'EA': 'EACH',
    'EACH': 'EACH',
    'PK': 'PACK',
    'PACK': 'PACK',
    'BX': 'BOX',
    'BOX': 'BOX',
    'FT': 'FEET',
    'FEET': 'FEET',
    'LB': 'POUND',
    'LBS': 'POUND',
    'POUND': 'POUND',
    'GAL': 'GALLON',
    'GALLON': 'GALLON',
    'QT': 'QUART',
    'QUART': 'QUART',
  };

  return mappings[normalized] || normalized;
}