-- Enable fuzzy search extensions
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

-- Canonical items fuzzy search index
create index if not exists idx_canonical_items_name_trgm 
on canonical_items using gin (name gin_trgm_ops);

-- Synonyms fuzzy search index  
create index if not exists idx_item_synonyms_term_trgm 
on item_synonyms using gin (term gin_trgm_ops);

-- Vendor catalog vendor boost index
create index if not exists idx_vendor_catalog_items_vendor 
on vendor_catalog_items(vendor_id) where vendor_id is not null;