-- =====================================================
-- Migration 005: Invoice Capture Tables
-- =====================================================
-- This migration creates tables to capture and store complete invoice
-- validations including scope of work, labor hours, and multi-line items.

-- =====================================================
-- Invoice Validations Table (Header)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scope_of_work TEXT,
    service_line_id BIGINT REFERENCES service_lines(id),
    service_type_id BIGINT REFERENCES service_types(id),
    labor_hours NUMERIC,
    currency TEXT DEFAULT 'INR'
);

-- Add table comments
COMMENT ON TABLE invoice_validations IS 'Header table for complete invoice validation runs';
COMMENT ON COLUMN invoice_validations.scope_of_work IS 'Description of work performed or to be performed';
COMMENT ON COLUMN invoice_validations.service_line_id IS 'Reference to service line (Plumbing, HVAC, etc.)';
COMMENT ON COLUMN invoice_validations.service_type_id IS 'Reference to service type (Repair, Install, etc.)';
COMMENT ON COLUMN invoice_validations.labor_hours IS 'Total labor hours for this job';
COMMENT ON COLUMN invoice_validations.currency IS 'Currency for all monetary amounts in this validation';

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_invoice_validations_created_at
ON invoice_validations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_validations_service_line
ON invoice_validations (service_line_id) WHERE service_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_validations_service_type
ON invoice_validations (service_type_id) WHERE service_type_id IS NOT NULL;

-- =====================================================
-- Invoice Line Items Table (Details)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_validation_id UUID NOT NULL REFERENCES invoice_validations(id) ON DELETE CASCADE,
    line_type item_kind NOT NULL,
    raw_name TEXT NOT NULL,
    canonical_item_id UUID REFERENCES canonical_items(id),
    unit TEXT,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC,
    position INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comments
COMMENT ON TABLE invoice_line_items IS 'Individual line items for invoice validations (materials, equipment, labor)';
COMMENT ON COLUMN invoice_line_items.line_type IS 'Type of line item: material, equipment, or labor';
COMMENT ON COLUMN invoice_line_items.raw_name IS 'Original item name as entered by user';
COMMENT ON COLUMN invoice_line_items.canonical_item_id IS 'Resolved canonical item (null if not matched)';
COMMENT ON COLUMN invoice_line_items.unit IS 'Unit of measure (pcs, hour, day, etc.)';
COMMENT ON COLUMN invoice_line_items.quantity IS 'Quantity of this item';
COMMENT ON COLUMN invoice_line_items.unit_price IS 'Price per unit';
COMMENT ON COLUMN invoice_line_items.position IS 'Display order within the invoice';

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_validation_id
ON invoice_line_items (invoice_validation_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_canonical_item
ON invoice_line_items (canonical_item_id) WHERE canonical_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_line_type
ON invoice_line_items (line_type);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_position
ON invoice_line_items (invoice_validation_id, position);

-- Add constraint to ensure quantity is positive
ALTER TABLE invoice_line_items 
ADD CONSTRAINT chk_quantity_positive 
CHECK (quantity > 0);

-- Add constraint to ensure unit_price is non-negative when specified
ALTER TABLE invoice_line_items 
ADD CONSTRAINT chk_unit_price_non_negative 
CHECK (unit_price IS NULL OR unit_price >= 0);

-- =====================================================
-- Helper Views for Common Queries
-- =====================================================

-- View for complete invoice details with resolved items
CREATE OR REPLACE VIEW invoice_details AS
SELECT 
    iv.id as invoice_id,
    iv.created_at,
    iv.scope_of_work,
    sl.name as service_line_name,
    st.name as service_type_name,
    iv.labor_hours,
    iv.currency,
    ili.id as line_item_id,
    ili.line_type,
    ili.raw_name,
    ci.canonical_name,
    ili.unit,
    ili.quantity,
    ili.unit_price,
    ili.position,
    (ili.quantity * COALESCE(ili.unit_price, 0)) as line_total
FROM invoice_validations iv
LEFT JOIN service_lines sl ON iv.service_line_id = sl.id
LEFT JOIN service_types st ON iv.service_type_id = st.id
LEFT JOIN invoice_line_items ili ON iv.id = ili.invoice_validation_id
LEFT JOIN canonical_items ci ON ili.canonical_item_id = ci.id
ORDER BY iv.created_at DESC, ili.position;

COMMENT ON VIEW invoice_details IS 'Complete invoice validation details with resolved service and item names';

-- View for invoice summary statistics
CREATE OR REPLACE VIEW invoice_summary AS
SELECT 
    iv.id as invoice_id,
    iv.created_at,
    iv.scope_of_work,
    sl.name as service_line_name,
    st.name as service_type_name,
    iv.labor_hours,
    iv.currency,
    COUNT(ili.id) as total_line_items,
    COUNT(ili.id) FILTER (WHERE ili.line_type = 'material') as material_count,
    COUNT(ili.id) FILTER (WHERE ili.line_type = 'equipment') as equipment_count,
    COUNT(ili.id) FILTER (WHERE ili.line_type = 'labor') as labor_count,
    SUM(ili.quantity * COALESCE(ili.unit_price, 0)) as total_amount,
    COUNT(ili.canonical_item_id) as resolved_items,
    COUNT(ili.id) - COUNT(ili.canonical_item_id) as unresolved_items
FROM invoice_validations iv
LEFT JOIN service_lines sl ON iv.service_line_id = sl.id
LEFT JOIN service_types st ON iv.service_type_id = st.id
LEFT JOIN invoice_line_items ili ON iv.id = ili.invoice_validation_id
GROUP BY iv.id, iv.created_at, iv.scope_of_work, sl.name, st.name, iv.labor_hours, iv.currency
ORDER BY iv.created_at DESC;

COMMENT ON VIEW invoice_summary IS 'Summary statistics for invoice validations including counts and totals';