-- =====================================================
-- Migration 004: Business Rules Engine
-- =====================================================
-- This migration creates the business rules system for validation logic:
-- CANNOT_DUPLICATE, MUTEX, REQUIRES, and MAX_QTY constraints.

-- =====================================================
-- Item Rules Table
-- =====================================================

CREATE TABLE IF NOT EXISTS item_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type rule_kind NOT NULL,
    a_item_id UUID NOT NULL REFERENCES canonical_items(id) ON DELETE CASCADE,
    b_item_id UUID REFERENCES canonical_items(id) ON DELETE CASCADE,
    max_qty NUMERIC,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comments
COMMENT ON TABLE item_rules IS 'Business validation rules for invoice line items';
COMMENT ON COLUMN item_rules.rule_type IS 'Type of rule: CANNOT_DUPLICATE, MUTEX, REQUIRES, or MAX_QTY';
COMMENT ON COLUMN item_rules.a_item_id IS 'Primary item that the rule applies to';
COMMENT ON COLUMN item_rules.b_item_id IS 'Secondary item for MUTEX/REQUIRES rules (null for other types)';
COMMENT ON COLUMN item_rules.max_qty IS 'Maximum allowed quantity for MAX_QTY rules (null for other types)';
COMMENT ON COLUMN item_rules.rationale IS 'Human-readable explanation of why this rule exists';

-- Create unique constraint to prevent duplicate rules
-- Uses COALESCE to handle NULL b_item_id for rules that don't need a secondary item
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_rules_unique_rule
ON item_rules (rule_type, a_item_id, COALESCE(b_item_id, a_item_id));

-- Create index for fast rule lookups by primary item
CREATE INDEX IF NOT EXISTS idx_item_rules_a_item_type
ON item_rules (a_item_id, rule_type);

-- Create index for fast rule lookups by secondary item (for reverse MUTEX/REQUIRES checks)
CREATE INDEX IF NOT EXISTS idx_item_rules_b_item_type
ON item_rules (b_item_id, rule_type) WHERE b_item_id IS NOT NULL;

-- Create index for rule type queries
CREATE INDEX IF NOT EXISTS idx_item_rules_rule_type
ON item_rules (rule_type);

-- =====================================================
-- Validation Constraints
-- =====================================================

-- Add constraint to ensure b_item_id is only used for MUTEX and REQUIRES rules
ALTER TABLE item_rules 
ADD CONSTRAINT chk_b_item_usage 
CHECK (
    (rule_type IN ('MUTEX', 'REQUIRES') AND b_item_id IS NOT NULL) OR
    (rule_type NOT IN ('MUTEX', 'REQUIRES') AND b_item_id IS NULL)
);

-- Add constraint to ensure max_qty is only used for MAX_QTY rules and is positive
ALTER TABLE item_rules 
ADD CONSTRAINT chk_max_qty_usage 
CHECK (
    (rule_type = 'MAX_QTY' AND max_qty IS NOT NULL AND max_qty > 0) OR
    (rule_type != 'MAX_QTY' AND max_qty IS NULL)
);

-- Add constraint to prevent self-referencing MUTEX/REQUIRES rules
ALTER TABLE item_rules 
ADD CONSTRAINT chk_no_self_reference 
CHECK (
    (rule_type IN ('MUTEX', 'REQUIRES') AND a_item_id != b_item_id) OR
    (rule_type NOT IN ('MUTEX', 'REQUIRES'))
);

-- =====================================================
-- Helper Functions for Rule Validation
-- =====================================================

-- Function to check if two items have a MUTEX rule between them
CREATE OR REPLACE FUNCTION items_are_mutex(item_a UUID, item_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM item_rules 
        WHERE rule_type = 'MUTEX' 
        AND (
            (a_item_id = item_a AND b_item_id = item_b) OR
            (a_item_id = item_b AND b_item_id = item_a)
        )
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION items_are_mutex IS 'Returns true if two items have a MUTEX (mutually exclusive) rule between them';

-- Function to check if an item requires another item
CREATE OR REPLACE FUNCTION item_requires(item_a UUID, item_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM item_rules 
        WHERE rule_type = 'REQUIRES' 
        AND a_item_id = item_a 
        AND b_item_id = item_b
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION item_requires IS 'Returns true if item_a requires item_b to be present';

-- Function to get maximum allowed quantity for an item
CREATE OR REPLACE FUNCTION get_max_qty(item_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT max_qty 
        FROM item_rules 
        WHERE rule_type = 'MAX_QTY' 
        AND a_item_id = item_id
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_max_qty IS 'Returns the maximum allowed quantity for an item, or NULL if no limit';