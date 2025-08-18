# Database Migrations and Schema

This directory contains the database migrations and seed files for the enhanced invoice validation system.

## 🏗️ Schema Overview

The enhanced schema supports:
- **Unified item catalog**: Materials, equipment, and labor in `canonical_items`
- **Flexible synonyms**: Improved fuzzy matching via `item_synonyms`
- **Comprehensive pricing**: All item types with `item_price_ranges`
- **Business rules**: MUTEX, REQUIRES, MAX_QTY validation via `item_rules`
- **Invoice capture**: Full multi-line invoice storage via `invoice_validations` + `invoice_line_items`

## 📁 File Structure

```
db/
├── migrations/           # Schema changes (run in order)
│   ├── 001_add_core_enums.sql
│   ├── 002_canonical_items.sql  
│   ├── 003_synonyms_pricing.sql
│   ├── 004_rules.sql
│   └── 005_invoice_capture.sql
├── seeds/               # Test data
│   └── 001_min_seed.sql
└── README.md           # This file
```

## 🚀 Running Migrations

### Option 1: Supabase SQL Editor (Recommended)
1. Open [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. Copy and execute each migration file in order:
   ```sql
   -- 1. Core enums and extensions
   -- Copy contents of 001_add_core_enums.sql and execute
   
   -- 2. Canonical items table
   -- Copy contents of 002_canonical_items.sql and execute
   
   -- 3. Synonyms and pricing
   -- Copy contents of 003_synonyms_pricing.sql and execute
   
   -- 4. Business rules engine  
   -- Copy contents of 004_rules.sql and execute
   
   -- 5. Invoice capture tables
   -- Copy contents of 005_invoice_capture.sql and execute
   ```

3. Load test data:
   ```sql
   -- Copy contents of seeds/001_min_seed.sql and execute
   ```

### Option 2: Supabase CLI
```bash
# If using Supabase CLI locally
supabase migration new add_enhanced_validation_schema
# Copy migration contents to generated file
supabase db push
```

### Option 3: Direct psql (if available)
```bash
# If you have direct database access
export DB_URL="postgresql://postgres:[password]@[host]:[port]/postgres"
psql $DB_URL -f db/migrations/001_add_core_enums.sql
psql $DB_URL -f db/migrations/002_canonical_items.sql
psql $DB_URL -f db/migrations/003_synonyms_pricing.sql
psql $DB_URL -f db/migrations/004_rules.sql
psql $DB_URL -f db/migrations/005_invoice_capture.sql
psql $DB_URL -f db/seeds/001_min_seed.sql
```

## 🔄 Backward Compatibility

All migrations are **additive only** and maintain backward compatibility:

- ✅ Existing `materials` table access → `materials_compat` view
- ✅ Existing `price_cache` queries → `price_cache_compat` view  
- ✅ Current `material_validator.py` functions work unchanged
- ✅ Existing service lines/types tables remain untouched
- ✅ CSV import scripts continue to work

## 📊 New Schema Objects

### Tables
- **`canonical_items`**: Unified catalog (materials + equipment + labor)
- **`item_synonyms`**: Alternative names for fuzzy matching
- **`item_price_ranges`**: Pricing for all item kinds
- **`item_rules`**: Business validation rules
- **`invoice_validations`**: Invoice header (scope, service, labor hours)
- **`invoice_line_items`**: Multi-line invoice details

### Enums
- **`item_kind`**: `'material' | 'equipment' | 'labor'`
- **`rule_kind`**: `'CANNOT_DUPLICATE' | 'MUTEX' | 'REQUIRES' | 'MAX_QTY'`
- **`validation_status`**: `'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'`

### Views
- **`materials_compat`**: Backward compatibility for materials
- **`price_cache_compat`**: Backward compatibility for pricing
- **`invoice_details`**: Complete invoice with resolved items
- **`invoice_summary`**: Invoice statistics and totals

### Functions
- **`items_are_mutex(item_a, item_b)`**: Check mutual exclusion
- **`item_requires(item_a, item_b)`**: Check dependencies
- **`get_max_qty(item_id)`**: Get quantity limits

## 🧪 Test Data

The seed file includes:
- **Service Lines**: Plumbing, Electrical, HVAC
- **Service Types**: Repair, Install, Inspection (under each line)
- **Materials**: Anode Rod, T&P Valve (with synonyms)
- **Equipment**: Pipe Wrench, Drain Snake (rental pricing)
- **Labor**: Plumbing Labor (hourly rates)
- **Business Rules**: MAX_QTY, MUTEX, CANNOT_DUPLICATE examples
- **Sample Invoice**: Complete validation with multi-line items

## 🔍 Verification Queries

After running migrations, verify the schema:

```sql
-- Check all canonical items
SELECT canonical_name, kind, default_uom FROM canonical_items ORDER BY kind;

-- Check synonyms
SELECT ci.canonical_name, s.synonym, s.weight 
FROM item_synonyms s 
JOIN canonical_items ci ON s.canonical_item_id = ci.id;

-- Check price ranges
SELECT ci.canonical_name, pr.min_price, pr.max_price, pr.currency 
FROM item_price_ranges pr 
JOIN canonical_items ci ON pr.canonical_item_id = ci.id;

-- Check business rules
SELECT ci1.canonical_name, r.rule_type, ci2.canonical_name as secondary_item
FROM item_rules r 
JOIN canonical_items ci1 ON r.a_item_id = ci1.id 
LEFT JOIN canonical_items ci2 ON r.b_item_id = ci2.id;

-- Check sample invoice
SELECT * FROM invoice_details LIMIT 5;
```

## ⚠️ Important Notes

1. **Run migrations in order** (001 → 002 → 003 → 004 → 005)
2. **All operations are idempotent** - safe to re-run
3. **No data loss** - existing tables remain untouched
4. **Currency defaults to INR** as per requirements
5. **Existing code continues to work** via compatibility views

## 🆘 Rollback (Emergency Only)

⚠️ **WARNING**: Rollback will cause data loss. Only use in emergency.

```sql
-- Emergency rollback (DESTRUCTIVE)
DROP VIEW IF EXISTS invoice_summary CASCADE;
DROP VIEW IF EXISTS invoice_details CASCADE;
DROP VIEW IF EXISTS price_cache_compat CASCADE;
DROP VIEW IF EXISTS materials_compat CASCADE;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoice_validations CASCADE;
DROP TABLE IF EXISTS item_rules CASCADE;
DROP TABLE IF EXISTS item_price_ranges CASCADE;
DROP TABLE IF EXISTS item_synonyms CASCADE;
DROP TABLE IF EXISTS canonical_items CASCADE;
DROP FUNCTION IF EXISTS get_max_qty(UUID);
DROP FUNCTION IF EXISTS item_requires(UUID, UUID);
DROP FUNCTION IF EXISTS items_are_mutex(UUID, UUID);
DROP TYPE IF EXISTS validation_status;
DROP TYPE IF EXISTS rule_kind;
DROP TYPE IF EXISTS item_kind;
```

## 📞 Support

For issues or questions:
1. Check existing tables: `\dt` in psql or Supabase Table Editor
2. Verify migrations ran: Look for new tables in schema
3. Test compatibility: Ensure existing code still works
4. Report issues: Include migration file and error message