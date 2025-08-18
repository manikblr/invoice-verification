-- =====================================================
-- Migration 002: Canonical Items Table
-- =====================================================
-- This migration creates the core canonical_items table that unifies
-- materials, equipment, and labor into a single catalog with proper
-- indexing and backward compatibility.

-- Create canonical_items table
CREATE TABLE IF NOT EXISTS canonical_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind item_kind NOT NULL,
    canonical_name TEXT NOT NULL,
    default_uom TEXT,
    service_line_id UUID REFERENCES service_lines(id),
    service_type_id UUID REFERENCES service_types(id),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comment
COMMENT ON TABLE canonical_items IS 'Unified catalog of materials (consumables), equipment (rentals), and labor categories';
COMMENT ON COLUMN canonical_items.kind IS 'Item category: material, equipment, or labor';
COMMENT ON COLUMN canonical_items.canonical_name IS 'Standardized item name for matching';
COMMENT ON COLUMN canonical_items.default_uom IS 'Default unit of measure (pcs, hour, day, etc.)';
COMMENT ON COLUMN canonical_items.tags IS 'JSON array of searchable tags for categorization';

-- Create unique constraint on canonical name and kind (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_items_name_kind_unique
ON canonical_items (lower(canonical_name), kind);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_canonical_items_service_line
ON canonical_items (service_line_id) WHERE service_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_items_service_type  
ON canonical_items (service_type_id) WHERE service_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_items_kind_active
ON canonical_items (kind, is_active);

CREATE INDEX IF NOT EXISTS idx_canonical_items_updated_at
ON canonical_items (updated_at DESC);

-- Create GIN index for JSON tags
CREATE INDEX IF NOT EXISTS idx_canonical_items_tags
ON canonical_items USING gin (tags);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_canonical_items_updated_at ON canonical_items;
CREATE TRIGGER update_canonical_items_updated_at
    BEFORE UPDATE ON canonical_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Backward Compatibility Views
-- =====================================================

-- Create compatibility view for existing materials table access
-- This allows existing code to continue working without changes
CREATE OR REPLACE VIEW materials_compat AS
SELECT 
    id,
    canonical_name as name,
    created_at,
    updated_at
FROM canonical_items 
WHERE kind = 'material' AND is_active = true;

COMMENT ON VIEW materials_compat IS 'Backward compatibility view for existing materials table access. Maps to canonical_items where kind=material';