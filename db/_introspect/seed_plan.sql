-- =====================================================
-- SEED PLAN: Test data for new schema
-- =====================================================

-- Sample canonical items (materials, equipment, labor)
INSERT INTO canonical_items (name, kind, description) VALUES
-- Materials  
('Anode Rod', 'material', 'Water heater sacrificial anode rod'),
('T&P Valve', 'material', 'Temperature and pressure relief valve'),
('Pipe Wrench', 'equipment', 'Adjustable pipe wrench rental'),
('Drain Snake', 'equipment', 'Electric drain cleaning snake rental'),
('Plumbing Labor', 'labor', 'General plumbing labor hour'),
('HVAC Labor', 'labor', 'HVAC technician labor hour');

-- Sample synonyms for fuzzy matching
INSERT INTO item_synonyms (canonical_item_id, synonym_text, confidence_score, source) 
SELECT ci.id, synonym, confidence, 'manual' FROM canonical_items ci,
(VALUES 
    ('Anode Rod', 'anode', 0.85),
    ('Anode Rod', 'sacrificial rod', 0.90),
    ('T&P Valve', 'temp pressure valve', 0.95),
    ('T&P Valve', 'relief valve', 0.75),
    ('Pipe Wrench', 'wrench', 0.70),
    ('Drain Snake', 'auger', 0.85),
    ('Drain Snake', 'snake', 0.80)
) AS syn(item_name, synonym, confidence)
WHERE ci.name = syn.item_name;

-- Sample price ranges
INSERT INTO item_price_ranges (canonical_item_id, min_price, max_price, unit_type, source)
SELECT ci.id, min_p, max_p, unit, 'manual' FROM canonical_items ci,
(VALUES
    ('Anode Rod', 18.00, 45.00, 'each'),
    ('T&P Valve', 15.00, 35.00, 'each'), 
    ('Pipe Wrench', 25.00, 40.00, 'day'),
    ('Drain Snake', 75.00, 120.00, 'day'),
    ('Plumbing Labor', 45.00, 85.00, 'hour'),
    ('HVAC Labor', 55.00, 95.00, 'hour')
) AS prices(item_name, min_p, max_p, unit)
WHERE ci.name = prices.item_name;

-- Sample business rules
INSERT INTO item_rules (rule_type, primary_item_id, secondary_item_id, rule_description)
SELECT 
    'MUTEX'::rule_kind,
    ci1.id,
    ci2.id, 
    'Cannot use both pipe wrench and drain snake on same job'
FROM canonical_items ci1, canonical_items ci2
WHERE ci1.name = 'Pipe Wrench' AND ci2.name = 'Drain Snake';

INSERT INTO item_rules (rule_type, primary_item_id, max_quantity, rule_description)
SELECT 
    'MAX_QTY'::rule_kind,
    ci.id,
    2,
    'Maximum 2 anode rods per job'
FROM canonical_items ci
WHERE ci.name = 'Anode Rod';

-- Sample test invoice validation
INSERT INTO invoice_validations (scope_of_work, service_line, service_type, total_labor_hours, overall_status)
VALUES ('Replace water heater anode rod', 'Plumbing', 'Repair', 1.5, 'ALLOW');

-- Sample line items for the test invoice
INSERT INTO invoice_line_items (
    invoice_validation_id, 
    line_number, 
    item_text, 
    item_kind, 
    quantity, 
    unit_price,
    canonical_item_id,
    validation_status,
    confidence_score,
    reason_codes
)
SELECT 
    iv.id,
    line_num,
    item_txt,
    kind::item_kind,
    qty,
    price,
    ci.id,
    status::validation_status,
    conf,
    reasons
FROM invoice_validations iv,
(VALUES
    (1, 'Anode Rod', 'material', 1, 30.00, 'ALLOW', 0.98, ARRAY['PRICE_OK', 'EXACT_MATCH']),
    (2, 'Plumbing work', 'labor', 1.5, 75.00, 'ALLOW', 0.95, ARRAY['PRICE_OK'])
) AS lines(line_num, item_txt, kind, qty, price, status, conf, reasons)
LEFT JOIN canonical_items ci ON ci.name = lines.item_txt
WHERE iv.scope_of_work = 'Replace water heater anode rod';