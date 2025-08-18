-- =====================================================
-- ADDITIVE MIGRATION PLAN: Invoice Validation Schema Extension
-- =====================================================
-- IMPORTANT: These are ADDITIVE changes only. No drops or destructive modifications.
-- All changes maintain backward compatibility with existing code.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. ENUMS: Define constrained value types
-- =====================================================

-- Item types: distinguish materials vs equipment vs labor
CREATE TYPE item_kind AS ENUM ('material', 'equipment', 'labor');

-- Business rule types for validation logic
CREATE TYPE rule_kind AS ENUM ('CANNOT_DUPLICATE', 'MUTEX', 'REQUIRES', 'MAX_QTY');

-- Invoice line item status after validation
CREATE TYPE validation_status AS ENUM ('ALLOW', 'NEEDS_REVIEW', 'REJECT');

-- =====================================================
-- 2. CORE TABLES: Canonical items with unified approach
-- =====================================================

-- Unified canonical items table (materials + equipment + labor categories)
CREATE TABLE IF NOT EXISTS canonical_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    kind item_kind NOT NULL,
    description TEXT,
    service_line_id UUID REFERENCES service_lines(id),
    service_type_id UUID REFERENCES service_types(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on canonical name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_items_name_lower 
ON canonical_items (lower(name), kind);

-- Fast lookups by service type and kind
CREATE INDEX IF NOT EXISTS idx_canonical_items_service_kind 
ON canonical_items (service_type_id, kind, is_active);

-- =====================================================
-- 3. SYNONYMS: Support fuzzy matching and learning
-- =====================================================

-- Synonyms for fuzzy matching - both user input and learned variations
CREATE TABLE IF NOT EXISTS item_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    synonym_text TEXT NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00 for ML confidence
    source TEXT, -- 'manual', 'learned', 'import'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast synonym lookup (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_synonyms_text_lower 
ON item_synonyms (lower(synonym_text), canonical_item_id);

-- Lookup by canonical item
CREATE INDEX IF NOT EXISTS idx_item_synonyms_canonical 
ON item_synonyms (canonical_item_id, confidence_score DESC);

-- =====================================================
-- 4. PRICING: Extended price ranges for all item kinds
-- =====================================================

-- Price ranges per canonical item (extends existing price_cache concept)
CREATE TABLE IF NOT EXISTS item_price_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    region TEXT NOT NULL DEFAULT 'US',
    currency TEXT NOT NULL DEFAULT 'USD',
    min_price DECIMAL(10,2),
    max_price DECIMAL(10,2),
    unit_type TEXT, -- 'each', 'hour', 'sqft', 'linear_ft', etc.
    source TEXT, -- 'manual', 'scraped', 'vendor_catalog'
    effective_date TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast price lookups
CREATE INDEX IF NOT EXISTS idx_item_price_ranges_lookup 
ON item_price_ranges (canonical_item_id, region, effective_date DESC);

-- =====================================================
-- 5. BUSINESS RULES: Validation logic constraints
-- =====================================================

-- Business rules for validation (MUTEX, REQUIRES, MAX_QTY, etc.)
CREATE TABLE IF NOT EXISTS item_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type rule_kind NOT NULL,
    primary_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    secondary_item_id UUID REFERENCES canonical_items(id) ON DELETE CASCADE, -- for MUTEX/REQUIRES
    service_type_id UUID REFERENCES service_types(id), -- rule scope
    max_quantity INTEGER, -- for MAX_QTY rules
    rule_description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast rule lookups during validation
CREATE INDEX IF NOT EXISTS idx_item_rules_primary 
ON item_rules (primary_item_id, rule_type, is_active);

CREATE INDEX IF NOT EXISTS idx_item_rules_service_type 
ON item_rules (service_type_id, rule_type, is_active);

-- =====================================================
-- 6. INVOICE CAPTURE: Store validation runs
-- =====================================================

-- Invoice validation header (one per validation run)
CREATE TABLE IF NOT EXISTS invoice_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_of_work TEXT,
    service_line TEXT NOT NULL,
    service_type TEXT NOT NULL,
    service_line_id UUID REFERENCES service_lines(id),
    service_type_id UUID REFERENCES service_types(id),
    total_labor_hours DECIMAL(5,2),
    validation_timestamp TIMESTAMPTZ DEFAULT NOW(),
    overall_status validation_status,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice line items (materials, equipment, labor)
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_validation_id UUID NOT NULL REFERENCES invoice_validations(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_text TEXT NOT NULL, -- original user input
    item_kind item_kind NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    
    -- Validation results
    canonical_item_id UUID REFERENCES canonical_items(id),
    validation_status validation_status NOT NULL,
    confidence_score DECIMAL(3,2),
    reason_codes TEXT[], -- array of reason codes
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookups by validation run
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_validation 
ON invoice_line_items (invoice_validation_id, line_number);

-- =====================================================
-- 7. MIGRATION DATA: Populate from existing tables
-- =====================================================

-- Migrate existing materials to canonical_items
-- (This will be done in the seed script to avoid duplicate execution)

-- =====================================================
-- 8. BACKWARD COMPATIBILITY VIEWS
-- =====================================================

-- Maintain compatibility with existing materials table access
CREATE OR REPLACE VIEW materials_compat AS
SELECT 
    id,
    name
FROM canonical_items 
WHERE kind = 'material' AND is_active = true;

-- Maintain compatibility with existing price_cache queries  
CREATE OR REPLACE VIEW price_cache_compat AS
SELECT 
    ci.id as material_id,
    ipr.source,
    ipr.min_price,
    ipr.max_price,
    ipr.currency,
    ipr.region,
    ipr.effective_date as fetched_at
FROM canonical_items ci
JOIN item_price_ranges ipr ON ci.id = ipr.canonical_item_id
WHERE ci.kind = 'material' 
AND ipr.expires_at IS NULL OR ipr.expires_at > NOW();