# Safe Apply Plan: Database Migration Execution

## File Structure (to be created after approval):

```
db/
├── migrations/
│   ├── 001_add_canonical_items.sql
│   ├── 002_add_synonyms_and_pricing.sql  
│   ├── 003_add_business_rules.sql
│   └── 004_add_invoice_capture.sql
├── seeds/
│   ├── 001_seed_canonical_items.sql
│   ├── 002_seed_test_data.sql
│   └── migrate_existing_materials.sql
└── rollback/
    ├── 001_rollback_canonical_items.sql
    ├── 002_rollback_synonyms_pricing.sql
    ├── 003_rollback_business_rules.sql
    └── 004_rollback_invoice_capture.sql
```

## Application Methods:

### Option 1: Supabase SQL Editor (Manual)
1. Copy DDL blocks from `migration_plan.sql`
2. Execute in Supabase Dashboard → SQL Editor
3. Run each migration block separately
4. Execute seed data from `seed_plan.sql`

### Option 2: Environment-based (if DB_URL available)
```bash
# Using psql (if available later)
export SUPABASE_DB_URL="postgresql://..."  # from user
psql $SUPABASE_DB_URL -f db/migrations/001_add_canonical_items.sql
psql $SUPABASE_DB_URL -f db/migrations/002_add_synonyms_and_pricing.sql
# ... continue with remaining files
```

### Option 3: Supabase CLI (Recommended)
```bash
# Add migrations to local Supabase project
supabase migration new add_canonical_items_schema
# Copy DDL content to generated migration file  
supabase db push  # Apply to remote
```

## Migration Execution Order:
1. **001_add_canonical_items.sql**: Core canonical_items table + indexes
2. **002_add_synonyms_and_pricing.sql**: Synonyms + price ranges tables  
3. **003_add_business_rules.sql**: Business rules validation tables
4. **004_add_invoice_capture.sql**: Invoice validation capture tables
5. **migrate_existing_materials.sql**: Migrate data from existing `materials` table
6. **001_seed_canonical_items.sql**: Basic test materials/equipment/labor
7. **002_seed_test_data.sql**: Sample rules, prices, validation runs

## Backward Compatibility:
- All existing code continues to work via compatibility views
- `materials` table access → `materials_compat` view  
- `price_cache` table access → `price_cache_compat` view
- Existing `material_validator.py` functions unchanged

## Rollback Plan:
**⚠️ CAUTION**: Only execute rollback in emergency. Data loss will occur.

```sql
-- EMERGENCY ROLLBACK (stored in rollback/ directory)
DROP VIEW IF EXISTS price_cache_compat;
DROP VIEW IF EXISTS materials_compat;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoice_validations CASCADE;  
DROP TABLE IF EXISTS item_rules CASCADE;
DROP TABLE IF EXISTS item_price_ranges CASCADE;
DROP TABLE IF EXISTS item_synonyms CASCADE;
DROP TABLE IF EXISTS canonical_items CASCADE;
DROP TYPE IF EXISTS validation_status;
DROP TYPE IF EXISTS rule_kind;
DROP TYPE IF EXISTS item_kind;
```

## Verification Tests (after migration):
1. **Schema validation**: Verify all tables exist with correct constraints
2. **Data migration**: Confirm existing materials migrated to canonical_items
3. **Compatibility**: Test existing `material_validator.py` still works
4. **New features**: Test synonym lookup, business rules, invoice capture
5. **API compatibility**: Verify `/validate` endpoint still functions

## CSV Import Compatibility:
- `service_lines_types.csv` import: **UNCHANGED** (uses existing tables)
- `price_seed.csv` import: **ENHANCED** (can populate new item_price_ranges)
- New import scripts will support equipment pricing and labor rates

## Success Criteria:
✅ All new tables created without errors  
✅ Existing functionality preserved  
✅ Sample data inserted successfully  
✅ Views provide backward compatibility  
✅ No breaking changes to current API