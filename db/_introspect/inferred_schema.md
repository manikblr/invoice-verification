# Inferred Database Schema (from code analysis)

## Tables identified in codebase:

### Core Tables
- **`materials`**: `id, name` - Core materials catalog
- **`service_lines`**: `id, [name]` - Service line categories (Plumbing, HVAC, etc.)
- **`service_types`**: `id, name, service_line_id` - Service type subcategories  
- **`service_material_map`**: Links materials to service types
- **`price_cache`**: `material_id, source, min_price, max_price, fetched_at, currency, region`

### Knowledge Base Tables  
- **`knowledge_docs`**: `id, title, content, service_line, service_type`
- **`knowledge_chunks`**: Text chunks with embeddings for semantic search

### RPC Functions
- **`get_service_type_id(p_line, p_type)`**: Returns service_type_id for line/type names
- **`kb_search_chunks(query_embedding, match_count)`**: Vector similarity search

## Current Limitations (identified from code):
1. No equipment vs materials distinction
2. No labor tracking (labor_hours)  
3. No scope_of_work capture
4. No rules system (duplicates, MUTEX, REQUIRES, MAX_QTY)
5. No synonyms table for fuzzy matching
6. Service lines/types may lack proper normalization
7. No invoice capture tables