-- Add name column to games table
-- Run this in Supabase SQL Editor

ALTER TABLE games ADD COLUMN IF NOT EXISTS name TEXT;

-- Verify the column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'games';
