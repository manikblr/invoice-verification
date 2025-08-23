/**
 * Normalizer for Units of Measure and Price Calculations
 * Converts vendor-specific formats to standardized values
 */

/**
 * Unit of measure normalization mappings
 */
const UOM_MAPPINGS: { [key: string]: string } = {
  // Each/Individual
  'EA': 'EACH',
  'EACH': 'EACH',
  'PC': 'EACH',
  'PCS': 'EACH',
  'PIECE': 'EACH',
  'UNIT': 'EACH',
  
  // Pack/Package
  'PK': 'PACK',
  'PKG': 'PACK',
  'PACK': 'PACK',
  'PACKAGE': 'PACK',
  
  // Box/Case
  'BX': 'BOX',
  'BOX': 'BOX',
  'CASE': 'CASE',
  'CS': 'CASE',
  
  // Length
  'FT': 'FEET',
  'FEET': 'FEET',
  'FOOT': 'FEET',
  'IN': 'INCH',
  'INCH': 'INCH',
  'INCHES': 'INCH',
  'YD': 'YARD',
  'YARD': 'YARD',
  'YARDS': 'YARD',
  'M': 'METER',
  'METER': 'METER',
  'METRES': 'METER',
  
  // Weight
  'LB': 'POUND',
  'LBS': 'POUND',
  'POUND': 'POUND',
  'POUNDS': 'POUND',
  'KG': 'KILOGRAM',
  'KILOGRAM': 'KILOGRAM',
  'OZ': 'OUNCE',
  'OUNCE': 'OUNCE',
  'OUNCES': 'OUNCE',
  
  // Volume
  'GAL': 'GALLON',
  'GALLON': 'GALLON',
  'GALLONS': 'GALLON',
  'QT': 'QUART',
  'QUART': 'QUART',
  'QUARTS': 'QUART',
  'PT': 'PINT',
  'PINT': 'PINT',
  'PINTS': 'PINT',
  'L': 'LITER',
  'LITER': 'LITER',
  'LITRE': 'LITER',
  'ML': 'MILLILITER',
  'MILLILITER': 'MILLILITER',
  
  // Area
  'SQFT': 'SQUARE_FEET',
  'SQ FT': 'SQUARE_FEET',
  'SQUARE FEET': 'SQUARE_FEET',
  'SQIN': 'SQUARE_INCH',
  'SQ IN': 'SQUARE_INCH',
  'SQUARE INCH': 'SQUARE_INCH',
  
  // Roll/Sheet
  'ROLL': 'ROLL',
  'SHEET': 'SHEET',
  'SHEETS': 'SHEET',
};

/**
 * Pack quantity to unit multipliers
 * Used to convert pack pricing to per-unit pricing
 */
const PACK_MULTIPLIERS: { [key: string]: number } = {
  'PACK': 1, // Varies by context, default to 1
  'BOX': 1,  // Varies by context, default to 1
  'CASE': 1, // Varies by context, default to 1
  'EACH': 1,
  'FEET': 1,
  'INCH': 1,
  'YARD': 3, // 3 feet per yard
  'METER': 3.28, // ~3.28 feet per meter
  'POUND': 1,
  'KILOGRAM': 2.2, // ~2.2 pounds per kg
  'OUNCE': 0.0625, // 1/16 pound
  'GALLON': 1,
  'QUART': 0.25, // 1/4 gallon
  'PINT': 0.125, // 1/8 gallon
  'LITER': 0.264, // ~0.264 gallons
  'MILLILITER': 0.000264,
  'SQUARE_FEET': 1,
  'SQUARE_INCH': 0.00694, // ~1/144 square feet
  'ROLL': 1,
  'SHEET': 1,
};

/**
 * Normalize unit of measure to standard format
 */
export function normalizeUom(rawUom?: string): string {
  if (!rawUom) return 'EACH';
  
  const cleaned = rawUom.toUpperCase().trim();
  return UOM_MAPPINGS[cleaned] || cleaned;
}

/**
 * Compute per-unit price from pack price and quantity
 */
export function computeLastPrice(packPrice?: number, packQty?: number): number {
  if (!packPrice || packPrice <= 0) return 0;
  if (!packQty || packQty <= 0) return packPrice;
  
  return packPrice / packQty;
}

/**
 * Convert between different units of measure
 * Returns conversion factor to multiply price by
 */
export function getUomConversionFactor(fromUom: string, toUom: string): number {
  const normalizedFrom = normalizeUom(fromUom);
  const normalizedTo = normalizeUom(toUom);
  
  if (normalizedFrom === normalizedTo) return 1.0;
  
  // Get multipliers for both units
  const fromMultiplier = PACK_MULTIPLIERS[normalizedFrom] || 1;
  const toMultiplier = PACK_MULTIPLIERS[normalizedTo] || 1;
  
  // Simple conversion - this could be expanded for more complex conversions
  if (isCompatibleUnit(normalizedFrom, normalizedTo)) {
    return fromMultiplier / toMultiplier;
  }
  
  // No conversion available
  return 1.0;
}

/**
 * Check if two units are compatible for conversion
 */
function isCompatibleUnit(uom1: string, uom2: string): boolean {
  const lengthUnits = ['FEET', 'INCH', 'YARD', 'METER'];
  const weightUnits = ['POUND', 'KILOGRAM', 'OUNCE'];
  const volumeUnits = ['GALLON', 'QUART', 'PINT', 'LITER', 'MILLILITER'];
  const areaUnits = ['SQUARE_FEET', 'SQUARE_INCH'];
  
  const unitGroups = [lengthUnits, weightUnits, volumeUnits, areaUnits];
  
  return unitGroups.some(group => 
    group.includes(uom1) && group.includes(uom2)
  );
}

/**
 * Normalize price string to number
 */
export function normalizePrice(priceString: string): number {
  if (!priceString) return 0;
  
  // Remove currency symbols, commas, and extra whitespace
  const cleaned = priceString
    .replace(/[$£€¥₹]/g, '') // Common currency symbols
    .replace(/,/g, '')       // Thousands separators
    .replace(/\s+/g, '')     // Whitespace
    .trim();
  
  // Extract the first valid number found
  const match = cleaned.match(/\d+\.?\d*/);
  if (match) {
    const number = parseFloat(match[0]);
    return isNaN(number) ? 0 : number;
  }
  
  return 0;
}

/**
 * Detect pack quantity from item name
 * Looks for patterns like "Pack of 12", "12-Pack", "12 CT", etc.
 */
export function detectPackQuantity(itemName: string): number {
  if (!itemName) return 1;
  
  const patterns = [
    /pack\s+of\s+(\d+)/i,
    /(\d+)-pack/i,
    /(\d+)\s*pk/i,
    /(\d+)\s*ct/i,
    /(\d+)\s*count/i,
    /(\d+)\s*piece/i,
    /(\d+)\s*pcs/i,
    /box\s+of\s+(\d+)/i,
    /(\d+)\s*\/\s*box/i,
    /case\s+of\s+(\d+)/i,
    /(\d+)\s*\/\s*case/i,
  ];
  
  for (const pattern of patterns) {
    const match = itemName.match(pattern);
    if (match && match[1]) {
      const quantity = parseInt(match[1]);
      if (quantity > 1 && quantity <= 1000) { // Reasonable range
        return quantity;
      }
    }
  }
  
  return 1; // Default to single unit
}

/**
 * Validate and clean item names
 */
export function normalizeItemName(rawName: string): string {
  if (!rawName) return '';
  
  return rawName
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[^\w\s\-.,()&/]/g, '') // Remove special characters except common ones
    .trim()
    .substring(0, 200);             // Reasonable length limit
}

/**
 * Create a standardized external item source record
 */
export interface NormalizedExternalItem {
  sourceVendor: string;
  sourceUrl: string;
  sourceSku?: string;
  itemName: string;
  unitOfMeasure: string;
  packQty: number;
  normalizedUnitOfMeasure: string;
  normalizedMultiplier: number;
  lastPrice: number;
  lastPriceCurrency: string;
  raw: any;
}

export function normalizeExternalItem(
  vendor: string,
  sourceUrl: string,
  rawItem: any
): NormalizedExternalItem {
  const itemName = normalizeItemName(rawItem.itemName || rawItem.name || '');
  const rawUom = rawItem.unitOfMeasure || rawItem.uom || 'EACH';
  const normalizedUom = normalizeUom(rawUom);
  
  // Detect pack quantity from name if not provided
  const providedPackQty = rawItem.packQty || rawItem.pack_qty;
  const detectedPackQty = detectPackQuantity(itemName);
  const packQty = providedPackQty || detectedPackQty || 1;
  
  // Calculate per-unit price
  const packPrice = normalizePrice(rawItem.priceString || rawItem.price || '0');
  const lastPrice = computeLastPrice(packPrice, packQty);
  
  // Get conversion factor for normalization
  const normalizedMultiplier = getUomConversionFactor(rawUom, normalizedUom);
  
  return {
    sourceVendor: vendor,
    sourceUrl,
    sourceSku: rawItem.sourceSku || rawItem.sku || rawItem.model,
    itemName,
    unitOfMeasure: rawUom,
    packQty,
    normalizedUnitOfMeasure: normalizedUom,
    normalizedMultiplier,
    lastPrice: lastPrice * normalizedMultiplier,
    lastPriceCurrency: rawItem.priceCurrency || rawItem.currency || 'USD',
    raw: rawItem,
  };
}