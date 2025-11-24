-- Migration: Add is_public column to dashboards table
-- Date: 2024-11-20
-- Description: Adds is_public flag to allow dashboards to be viewed by anyone with the link

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

COMMENT ON COLUMN dashboards.is_public IS 'Allows anonymous viewing of the dashboard in read-only mode';

-- Create index for efficient public dashboard queries
CREATE INDEX IF NOT EXISTS idx_dashboards_public ON dashboards(is_public) WHERE is_public = true;
