# Gap Analysis: Current vs Required Features

## Required Inputs (Target):
1. **scope_of_work** / what was done  
2. **service_line** ✅ (exists in CSV + DB)
3. **service_type** ✅ (exists in CSV + DB)  
4. **labor_hours** (hours on site) ❌ 
5. **materials & equipment** (multiple line items) ⚠️ (materials only)

## Current Coverage Analysis:

### ✅ **COVERED**:
- **service_line/service_type**: Normalized in DB via `service_lines`, `service_types` tables
- **materials**: Full materials catalog with `materials` table
- **price ranges**: `price_cache` table with min/max prices by material_id, region, source
- **material validation**: Fuzzy matching via `normalize_text()` + rapidfuzz  
- **KB search**: Vector embeddings via `kb_search_chunks` RPC function
- **service mapping**: `service_material_map` links materials to service types

### ⚠️ **PARTIALLY COVERED**:
- **materials & equipment**: Only "materials" exist - no equipment distinction
- **synonyms**: Fuzzy matching exists but no systematic synonym storage

### ❌ **MISSING**:

#### Core Data Capture:
- **scope_of_work**: No capture mechanism  
- **labor_hours**: No labor tracking at all
- **equipment rentals**: No equipment category vs materials

#### Business Rules Engine:
- **duplicates detection**: No `CANNOT_DUPLICATE` rules
- **mutual exclusions**: No `MUTEX` rules (item A excludes item B)  
- **requirements**: No `REQUIRES` rules (item A requires item B)
- **max quantity**: No `MAX_QTY` limits per item

#### Data Management:
- **synonyms table**: No systematic synonym storage for learning
- **invoice capture**: No tables to store validation runs
- **equipment price ranges**: Price cache only covers materials

#### API Extensions:
- **multi-line validation**: Current API validates single material only
- **labor validation**: No labor hour validation rules

## Current Validator Function Signature:
```python
validate_material(service_line, service_type, material_text, proposed_price, region)
# Returns: decision (allow/needs_review/reject) + reasons + confidence
```

## Required New Capabilities:
1. **Full invoice validation**: Multiple line items (materials + equipment + labor)
2. **Business rules validation**: MUTEX, REQUIRES, MAX_QTY, duplicates  
3. **Equipment support**: Separate equipment catalog with rental pricing
4. **Labor validation**: Hours validation by service type
5. **Scope tracking**: What work was performed
6. **Invoice persistence**: Store validation runs for auditing