-- Migration: Add RLS policies for production security
-- Denies anonymous access, allows service-role only
-- Safe-by-default for suggest endpoints

-- Enable RLS on core tables
ALTER TABLE canonical_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS ci_read_anon ON canonical_items;
DROP POLICY IF EXISTS syn_read_anon ON item_synonyms;
DROP POLICY IF EXISTS vci_read_anon ON vendor_catalog_items;
DROP POLICY IF EXISTS sl_read_anon ON service_lines;
DROP POLICY IF EXISTS st_read_anon ON service_types;

-- Create service-role only policies for canonical_items
CREATE POLICY ci_read_service_role ON canonical_items 
FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY ci_write_service_role ON canonical_items 
FOR ALL USING (auth.role() = 'service_role');

-- Create service-role only policies for item_synonyms
CREATE POLICY syn_read_service_role ON item_synonyms 
FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY syn_write_service_role ON item_synonyms 
FOR ALL USING (auth.role() = 'service_role');

-- Create service-role only policies for vendor_catalog_items
CREATE POLICY vci_read_service_role ON vendor_catalog_items 
FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY vci_write_service_role ON vendor_catalog_items 
FOR ALL USING (auth.role() = 'service_role');

-- Create service-role only policies for service_lines
CREATE POLICY sl_read_service_role ON service_lines 
FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY sl_write_service_role ON service_lines 
FOR ALL USING (auth.role() = 'service_role');

-- Create service-role only policies for service_types
CREATE POLICY st_read_service_role ON service_types 
FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY st_write_service_role ON service_types 
FOR ALL USING (auth.role() = 'service_role');

-- Comment explaining security model
COMMENT ON POLICY ci_read_service_role ON canonical_items IS 'Suggest API uses SERVICE_ROLE key - anonymous access denied by default';
COMMENT ON POLICY syn_read_service_role ON item_synonyms IS 'Suggest API uses SERVICE_ROLE key - anonymous access denied by default';
COMMENT ON POLICY vci_read_service_role ON vendor_catalog_items IS 'Suggest API uses SERVICE_ROLE key - anonymous access denied by default';