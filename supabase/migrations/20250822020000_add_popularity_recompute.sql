-- Migration: Add popularity recompute function
-- Calculates popularity based on vendor catalog item frequency

-- Create or replace the recompute popularity function
CREATE OR REPLACE FUNCTION recompute_popularity()
RETURNS void AS $$
BEGIN
  -- Recompute popularity per item_id from vendor_catalog_items frequency
  WITH freq AS (
    SELECT 
      canonical_item_id as item_id, 
      GREATEST(COUNT(*)::int, 1) as pop
    FROM vendor_catalog_items
    WHERE is_active = true
    GROUP BY canonical_item_id
  )
  UPDATE canonical_items ci
  SET popularity = f.pop,
      updated_at = now()
  FROM freq f
  WHERE ci.id = f.item_id;

  -- Set default popularity for items without vendor catalog entries
  UPDATE canonical_items
  SET popularity = 1,
      updated_at = now()
  WHERE popularity = 0 OR popularity IS NULL;

  -- Alternative for staging_invoice_lines if available (commented)
  /*
  WITH invoice_freq AS (
    SELECT 
      canonical_item_id as item_id,
      COUNT(*) as usage_count
    FROM staging_invoice_lines sil
    WHERE canonical_item_id IS NOT NULL
    GROUP BY canonical_item_id
  )
  UPDATE canonical_items ci  
  SET popularity = GREATEST(if.usage_count::int, ci.popularity),
      updated_at = now()
  FROM invoice_freq if
  WHERE ci.id = if.item_id;
  */

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recompute_popularity() IS 'Recalculates item popularity based on vendor catalog frequency for better suggestion ranking';