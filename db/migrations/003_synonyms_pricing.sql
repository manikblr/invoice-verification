-- =====================================================
-- Migration 003: Synonyms and Pricing Tables
-- =====================================================
-- This migration adds support for item synonyms (for fuzzy matching)
-- and comprehensive pricing ranges for all item kinds.

-- =====================================================
-- Item Synonyms Table
-- =====================================================

CREATE TABLE IF NOT EXISTS item_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    synonym TEXT NOT NULL,
    weight NUMERIC NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comments
COMMENT ON TABLE item_synonyms IS 'Alternative names and variations for canonical items to improve fuzzy matching';
COMMENT ON COLUMN item_synonyms.synonym IS 'Alternative name or variation for the canonical item';
COMMENT ON COLUMN item_synonyms.weight IS 'Confidence weight for this synonym (0.0-1.0), higher = more reliable';

-- Create unique constraint on canonical_item_id and synonym (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_synonyms_item_synonym_unique
ON item_synonyms (canonical_item_id, lower(synonym));

-- Create index for fast synonym lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_item_synonyms_synonym_lower
ON item_synonyms (lower(synonym));

-- Create index for canonical item lookups ordered by weight
CREATE INDEX IF NOT EXISTS idx_item_synonyms_canonical_weight
ON item_synonyms (canonical_item_id, weight DESC);

-- =====================================================
-- Item Price Ranges Table
-- =====================================================

CREATE TABLE IF NOT EXISTS item_price_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'INR',
    min_price NUMERIC,
    max_price NUMERIC,
    source TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comments
COMMENT ON TABLE item_price_ranges IS 'Price ranges for all item kinds: materials (unit cost), equipment (rental rates), labor (hourly rates)';
COMMENT ON COLUMN item_price_ranges.currency IS 'Currency code (INR, USD, etc.)';
COMMENT ON COLUMN item_price_ranges.min_price IS 'Minimum expected price for this item';
COMMENT ON COLUMN item_price_ranges.max_price IS 'Maximum expected price for this item';
COMMENT ON COLUMN item_price_ranges.source IS 'Source of pricing data (manual, vendor_catalog, market_data, etc.)';

-- Create index for fast price lookups by item
CREATE INDEX IF NOT EXISTS idx_item_price_ranges_canonical_item
ON item_price_ranges (canonical_item_id);

-- Create composite index for price validation queries
CREATE INDEX IF NOT EXISTS idx_item_price_ranges_item_currency
ON item_price_ranges (canonical_item_id, currency);

-- Add updated_at trigger to price ranges
DROP TRIGGER IF EXISTS update_item_price_ranges_updated_at ON item_price_ranges;
CREATE TRIGGER update_item_price_ranges_updated_at
    BEFORE UPDATE ON item_price_ranges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure min_price <= max_price when both are specified
ALTER TABLE item_price_ranges 
ADD CONSTRAINT chk_price_range_valid 
CHECK (
    (min_price IS NULL OR max_price IS NULL) OR 
    (min_price <= max_price)
);

-- =====================================================
-- Backward Compatibility Views
-- =====================================================

-- Create compatibility view for existing price_cache table access
-- This allows existing price validation code to continue working
CREATE OR REPLACE VIEW price_cache_compat AS
SELECT 
    canonical_item_id,
    currency,
    min_price,
    max_price,
    source,
    updated_at
FROM item_price_ranges;

COMMENT ON VIEW price_cache_compat IS 'Backward compatibility view for existing price_cache table access. Maps to item_price_ranges';