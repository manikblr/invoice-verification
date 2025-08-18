-- =====================================================
-- Seed File 001: Minimal Test Data
-- =====================================================
-- This seed file provides minimal test data for the enhanced invoice
-- validation system. All operations are idempotent using UPSERT patterns.

-- =====================================================
-- Service Lines and Types
-- =====================================================

-- Upsert service lines
INSERT INTO service_lines (name) 
VALUES 
    ('Plumbing'),
    ('Electrical'),
    ('HVAC')
ON CONFLICT (name) DO NOTHING;

-- Get service line IDs for reference
DO $$
DECLARE
    plumbing_id UUID;
    electrical_id UUID;
    hvac_id UUID;
BEGIN
    SELECT id INTO plumbing_id FROM service_lines WHERE name = 'Plumbing';
    SELECT id INTO electrical_id FROM service_lines WHERE name = 'Electrical';
    SELECT id INTO hvac_id FROM service_lines WHERE name = 'HVAC';

    -- Upsert service types under Plumbing
    INSERT INTO service_types (name, service_line_id) 
    VALUES 
        ('Repair', plumbing_id),
        ('Install', plumbing_id),
        ('Inspection', plumbing_id)
    ON CONFLICT (name, service_line_id) DO NOTHING;

    -- Upsert service types under Electrical  
    INSERT INTO service_types (name, service_line_id) 
    VALUES 
        ('Repair', electrical_id),
        ('Install', electrical_id),
        ('Inspection', electrical_id)
    ON CONFLICT (name, service_line_id) DO NOTHING;

    -- Upsert service types under HVAC
    INSERT INTO service_types (name, service_line_id) 
    VALUES 
        ('Repair', hvac_id),
        ('Install', hvac_id),
        ('Maintenance', hvac_id)
    ON CONFLICT (name, service_line_id) DO NOTHING;
END $$;

-- =====================================================
-- Canonical Items
-- =====================================================

-- Insert canonical items (materials, equipment, labor)
DO $$
DECLARE
    plumbing_repair_id UUID;
BEGIN
    -- Get plumbing repair service type ID
    SELECT st.id INTO plumbing_repair_id 
    FROM service_types st 
    JOIN service_lines sl ON st.service_line_id = sl.id 
    WHERE sl.name = 'Plumbing' AND st.name = 'Repair';

    -- Insert materials
    INSERT INTO canonical_items (canonical_name, kind, default_uom, service_type_id, tags)
    VALUES 
        ('Anode Rod', 'material', 'pcs', plumbing_repair_id, '["water_heater", "consumable"]'::jsonb),
        ('T&P Valve', 'material', 'pcs', plumbing_repair_id, '["safety", "pressure_relief"]'::jsonb)
    ON CONFLICT (lower(canonical_name), kind) DO NOTHING;

    -- Insert equipment
    INSERT INTO canonical_items (canonical_name, kind, default_uom, tags)
    VALUES 
        ('Pipe Wrench', 'equipment', 'day', '["tool", "rental"]'::jsonb),
        ('Drain Snake', 'equipment', 'day', '["drain_cleaning", "electric"]'::jsonb)
    ON CONFLICT (lower(canonical_name), kind) DO NOTHING;

    -- Insert labor
    INSERT INTO canonical_items (canonical_name, kind, default_uom, service_type_id, tags)
    VALUES 
        ('Plumbing Labor', 'labor', 'hour', plumbing_repair_id, '["skilled", "licensed"]'::jsonb)
    ON CONFLICT (lower(canonical_name), kind) DO NOTHING;
END $$;

-- =====================================================
-- Item Synonyms
-- =====================================================

-- Insert synonyms for better matching
DO $$
DECLARE
    anode_rod_id UUID;
    tp_valve_id UUID;
    drain_snake_id UUID;
BEGIN
    -- Get canonical item IDs
    SELECT id INTO anode_rod_id FROM canonical_items WHERE canonical_name = 'Anode Rod';
    SELECT id INTO tp_valve_id FROM canonical_items WHERE canonical_name = 'T&P Valve';
    SELECT id INTO drain_snake_id FROM canonical_items WHERE canonical_name = 'Drain Snake';

    -- Insert synonyms for Anode Rod
    INSERT INTO item_synonyms (canonical_item_id, synonym, weight)
    VALUES 
        (anode_rod_id, 'magnesium anode rod', 0.95),
        (anode_rod_id, 'sacrificial anode', 0.90),
        (anode_rod_id, 'anode', 0.80)
    ON CONFLICT (canonical_item_id, lower(synonym)) DO NOTHING;

    -- Insert synonyms for T&P Valve
    INSERT INTO item_synonyms (canonical_item_id, synonym, weight)
    VALUES 
        (tp_valve_id, 'temperature pressure valve', 0.95),
        (tp_valve_id, 'relief valve', 0.85),
        (tp_valve_id, 'temp pressure valve', 0.90)
    ON CONFLICT (canonical_item_id, lower(synonym)) DO NOTHING;

    -- Insert synonyms for Drain Snake
    INSERT INTO item_synonyms (canonical_item_id, synonym, weight)
    VALUES 
        (drain_snake_id, 'auger', 0.85),
        (drain_snake_id, 'drain auger', 0.90),
        (drain_snake_id, 'snake', 0.75)
    ON CONFLICT (canonical_item_id, lower(synonym)) DO NOTHING;
END $$;

-- =====================================================
-- Price Ranges (INR)
-- =====================================================

-- Insert price ranges for all items
DO $$
DECLARE
    anode_rod_id UUID;
    tp_valve_id UUID;
    pipe_wrench_id UUID;
    drain_snake_id UUID;
    plumbing_labor_id UUID;
BEGIN
    -- Get canonical item IDs
    SELECT id INTO anode_rod_id FROM canonical_items WHERE canonical_name = 'Anode Rod';
    SELECT id INTO tp_valve_id FROM canonical_items WHERE canonical_name = 'T&P Valve';
    SELECT id INTO pipe_wrench_id FROM canonical_items WHERE canonical_name = 'Pipe Wrench';
    SELECT id INTO drain_snake_id FROM canonical_items WHERE canonical_name = 'Drain Snake';
    SELECT id INTO plumbing_labor_id FROM canonical_items WHERE canonical_name = 'Plumbing Labor';

    -- Insert price ranges
    INSERT INTO item_price_ranges (canonical_item_id, currency, min_price, max_price, source)
    VALUES 
        (anode_rod_id, 'INR', 800, 4000, 'seed'),
        (tp_valve_id, 'INR', 500, 3000, 'seed'),
        (pipe_wrench_id, 'INR', 200, 1000, 'seed'),
        (drain_snake_id, 'INR', 1500, 5000, 'seed'),
        (plumbing_labor_id, 'INR', 300, 800, 'seed')
    ON CONFLICT DO NOTHING;
END $$;

-- =====================================================
-- Business Rules
-- =====================================================

-- Insert sample business rules
DO $$
DECLARE
    anode_rod_id UUID;
    pipe_wrench_id UUID;
    drain_snake_id UUID;
BEGIN
    -- Get canonical item IDs
    SELECT id INTO anode_rod_id FROM canonical_items WHERE canonical_name = 'Anode Rod';
    SELECT id INTO pipe_wrench_id FROM canonical_items WHERE canonical_name = 'Pipe Wrench';
    SELECT id INTO drain_snake_id FROM canonical_items WHERE canonical_name = 'Drain Snake';

    -- Insert MAX_QTY rule for Anode Rod
    INSERT INTO item_rules (rule_type, a_item_id, max_qty, rationale)
    VALUES (
        'MAX_QTY', 
        anode_rod_id, 
        3, 
        'Water heaters typically require maximum 3 anode rods'
    )
    ON CONFLICT (rule_type, a_item_id, COALESCE(b_item_id, a_item_id)) DO NOTHING;

    -- Insert MUTEX rule between Pipe Wrench and Drain Snake
    INSERT INTO item_rules (rule_type, a_item_id, b_item_id, rationale)
    VALUES (
        'MUTEX', 
        pipe_wrench_id, 
        drain_snake_id, 
        'Pipe wrench and drain snake are alternative tools for different types of repairs'
    )
    ON CONFLICT (rule_type, a_item_id, COALESCE(b_item_id, a_item_id)) DO NOTHING;

    -- Insert CANNOT_DUPLICATE rule for Pipe Wrench
    INSERT INTO item_rules (rule_type, a_item_id, rationale)
    VALUES (
        'CANNOT_DUPLICATE', 
        pipe_wrench_id, 
        'Only one pipe wrench rental needed per job'
    )
    ON CONFLICT (rule_type, a_item_id, COALESCE(b_item_id, a_item_id)) DO NOTHING;
END $$;

-- =====================================================
-- Sample Invoice Validation
-- =====================================================

-- Insert a sample complete invoice validation
DO $$
DECLARE
    plumbing_line_id UUID;
    repair_type_id UUID;
    validation_id UUID;
    anode_rod_id UUID;
    plumbing_labor_id UUID;
BEGIN
    -- Get service IDs
    SELECT id INTO plumbing_line_id FROM service_lines WHERE name = 'Plumbing';
    SELECT st.id INTO repair_type_id 
    FROM service_types st 
    JOIN service_lines sl ON st.service_line_id = sl.id 
    WHERE sl.name = 'Plumbing' AND st.name = 'Repair';
    
    -- Get item IDs
    SELECT id INTO anode_rod_id FROM canonical_items WHERE canonical_name = 'Anode Rod';
    SELECT id INTO plumbing_labor_id FROM canonical_items WHERE canonical_name = 'Plumbing Labor';

    -- Insert sample invoice validation
    INSERT INTO invoice_validations (
        scope_of_work, 
        service_line_id, 
        service_type_id, 
        labor_hours, 
        currency
    )
    VALUES (
        'Replace corroded water heater anode rod and inspect T&P valve',
        plumbing_line_id,
        repair_type_id,
        2.5,
        'INR'
    )
    RETURNING id INTO validation_id;

    -- Insert line items for the sample invoice
    INSERT INTO invoice_line_items (
        invoice_validation_id,
        line_type,
        raw_name,
        canonical_item_id,
        unit,
        quantity,
        unit_price,
        position
    )
    VALUES 
        (validation_id, 'material', 'Anode Rod', anode_rod_id, 'pcs', 1, 2500, 1),
        (validation_id, 'labor', 'Plumbing work', plumbing_labor_id, 'hour', 2.5, 500, 2);
END $$;

-- =====================================================
-- Verification Queries (Comments for Testing)
-- =====================================================

/*
-- Verify canonical items were created
SELECT canonical_name, kind, default_uom, tags FROM canonical_items ORDER BY kind, canonical_name;

-- Verify synonyms were created  
SELECT ci.canonical_name, s.synonym, s.weight 
FROM item_synonyms s 
JOIN canonical_items ci ON s.canonical_item_id = ci.id 
ORDER BY ci.canonical_name, s.weight DESC;

-- Verify price ranges were created
SELECT ci.canonical_name, pr.min_price, pr.max_price, pr.currency 
FROM item_price_ranges pr 
JOIN canonical_items ci ON pr.canonical_item_id = ci.id 
ORDER BY ci.canonical_name;

-- Verify business rules were created
SELECT 
    ci1.canonical_name as primary_item,
    r.rule_type,
    ci2.canonical_name as secondary_item,
    r.max_qty,
    r.rationale
FROM item_rules r 
JOIN canonical_items ci1 ON r.a_item_id = ci1.id 
LEFT JOIN canonical_items ci2 ON r.b_item_id = ci2.id 
ORDER BY r.rule_type, ci1.canonical_name;

-- Verify sample invoice was created
SELECT * FROM invoice_details WHERE invoice_id IN (SELECT id FROM invoice_validations LIMIT 1);
*/