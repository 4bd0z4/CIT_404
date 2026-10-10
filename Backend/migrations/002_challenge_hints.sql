-- Add hint columns to challenges. Idempotent.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS hint1 TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS hint2 TEXT;
