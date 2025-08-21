-- Migration: Add RPC function for popularity increment
-- Needed for vendor autofetch popularity updates

CREATE OR REPLACE FUNCTION increment_popularity(item_id uuid, amount integer)
RETURNS void AS $$
BEGIN
  UPDATE canonical_items 
  SET popularity = GREATEST(popularity, popularity + amount),
      updated_at = now()
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_popularity(uuid, integer) IS 'Increment item popularity for vendor autofetch updates';