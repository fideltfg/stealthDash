-- Migration: Add support for multiple dashboards per user
-- This migration updates the dashboards table to support multiple named dashboards

-- Add new columns to dashboards table
ALTER TABLE dashboards 
ADD COLUMN IF NOT EXISTS dashboard_id UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT 'Main Dashboard',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Create unique constraint on user_id + dashboard_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_user_dashboard 
ON dashboards(user_id, dashboard_id);

-- Create index for faster active dashboard lookups
CREATE INDEX IF NOT EXISTS idx_dashboards_user_active 
ON dashboards(user_id, is_active);

-- Ensure each user has exactly one active dashboard
-- This function ensures only one dashboard per user is marked as active
CREATE OR REPLACE FUNCTION ensure_single_active_dashboard()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        -- Deactivate all other dashboards for this user
        UPDATE dashboards 
        SET is_active = false 
        WHERE user_id = NEW.user_id 
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single active dashboard
DROP TRIGGER IF EXISTS trigger_single_active_dashboard ON dashboards;
CREATE TRIGGER trigger_single_active_dashboard
    BEFORE INSERT OR UPDATE ON dashboards
    FOR EACH ROW
    WHEN (NEW.is_active = true)
    EXECUTE FUNCTION ensure_single_active_dashboard();

-- For existing rows, set is_active = true for one dashboard per user
UPDATE dashboards d1
SET is_active = true
WHERE id = (
    SELECT MIN(id) 
    FROM dashboards d2 
    WHERE d2.user_id = d1.user_id
);

-- Add comment
COMMENT ON COLUMN dashboards.dashboard_id IS 'Unique identifier for the dashboard (client-side UUID)';
COMMENT ON COLUMN dashboards.name IS 'User-defined name for the dashboard';
COMMENT ON COLUMN dashboards.is_active IS 'Indicates the currently active dashboard for the user';
