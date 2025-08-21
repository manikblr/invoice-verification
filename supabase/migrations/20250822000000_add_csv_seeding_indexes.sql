-- Migration: Add missing indexes and extensions for CSV seeding performance
-- Safe to run multiple times

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Add missing trigram indexes for fast text search
CREATE INDEX IF NOT EXISTS idx_service_types_name_trgm 
ON service_types USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_service_lines_name_trgm 
ON service_lines USING gin (name gin_trgm_ops);

-- canonical_items.canonical_name already indexed in 20250821200000
-- but ensure it exists with correct column name
CREATE INDEX IF NOT EXISTS idx_canonical_items_canonical_name_trgm 
ON canonical_items USING gin (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_item_synonyms_synonym_trgm 
ON item_synonyms USING gin (synonym gin_trgm_ops);

-- Add compound indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_canonical_items_name_service_line 
ON canonical_items (canonical_name, service_line_id);

CREATE INDEX IF NOT EXISTS idx_vendor_catalog_items_vendor_item 
ON vendor_catalog_items (vendor_id, canonical_item_id);

-- Add service_line_id to canonical_items if missing (should exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_items' AND column_name = 'service_line_id'
    ) THEN
        ALTER TABLE canonical_items ADD COLUMN service_line_id BIGINT REFERENCES service_lines(id);
    END IF;
END$$;

-- Ensure popularity column exists (should from prior migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'canonical_items' AND column_name = 'popularity'
    ) THEN
        ALTER TABLE canonical_items ADD COLUMN popularity INTEGER DEFAULT 0;
    END IF;
END$$;