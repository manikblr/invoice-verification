-- =====================================================
-- Migration 001: Add Core Enums
-- =====================================================
-- This migration adds the core enum types needed for the enhanced
-- invoice validation system while ensuring idempotency.

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Item kind enum: distinguishes materials, equipment, and labor
DO $$ BEGIN
    CREATE TYPE item_kind AS ENUM ('material', 'equipment', 'labor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Rule kind enum: defines types of business validation rules
DO $$ BEGIN
    CREATE TYPE rule_kind AS ENUM ('CANNOT_DUPLICATE', 'MUTEX', 'REQUIRES', 'MAX_QTY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Validation status enum: outcome of validation checks
DO $$ BEGIN
    CREATE TYPE validation_status AS ENUM ('ALLOW', 'NEEDS_REVIEW', 'REJECT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add comment for documentation
COMMENT ON TYPE item_kind IS 'Categorizes items as materials (consumables), equipment (rentals), or labor (hours)';
COMMENT ON TYPE rule_kind IS 'Business rule types: CANNOT_DUPLICATE (no duplicates), MUTEX (mutually exclusive), REQUIRES (dependency), MAX_QTY (quantity limit)';
COMMENT ON TYPE validation_status IS 'Validation outcome: ALLOW (approved), NEEDS_REVIEW (flagged), REJECT (denied)';