-- Add popularity column for suggestion ranking
ALTER TABLE IF EXISTS canonical_items 
ADD COLUMN IF NOT EXISTS popularity INTEGER NOT NULL DEFAULT 0;

-- Create index for fast popularity-based fallback queries
CREATE INDEX IF NOT EXISTS idx_canonical_items_popularity 
ON canonical_items (popularity DESC, is_active) WHERE is_active = true;