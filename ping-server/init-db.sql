-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dashboards table with multi-dashboard support
CREATE TABLE IF NOT EXISTS dashboards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dashboard_id UUID NOT NULL DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT 'Main Dashboard',
    dashboard_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_dashboard UNIQUE (user_id, dashboard_id)
);

COMMENT ON COLUMN dashboards.dashboard_id IS 'Unique identifier for the dashboard (client-side UUID)';
COMMENT ON COLUMN dashboards.name IS 'User-defined name for the dashboard';
COMMENT ON COLUMN dashboards.is_active IS 'Indicates the currently active dashboard for the user';
COMMENT ON COLUMN dashboards.is_public IS 'Allows anonymous viewing of the dashboard in read-only mode';

-- Create password recovery tokens table
CREATE TABLE IF NOT EXISTS password_recovery_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create credentials table for storing encrypted API keys, passwords, etc.
CREATE TABLE IF NOT EXISTS credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL, -- 'pihole', 'unifi', 'home_assistant', 'snmp', 'custom', etc.
    credential_data TEXT NOT NULL, -- Encrypted JSON containing credentials
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dashboards_user_id ON dashboards(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_user_active ON dashboards(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_token ON password_recovery_tokens(token);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user_id ON password_recovery_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service_type ON credentials(service_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- For any existing dashboards (in case of upgrades), ensure one is marked active per user
-- This is safe for new installations as the table will be empty
UPDATE dashboards d1
SET is_active = true
WHERE id = (
    SELECT MIN(id) 
    FROM dashboards d2 
    WHERE d2.user_id = d1.user_id
)
AND NOT EXISTS (
    SELECT 1 FROM dashboards d3 
    WHERE d3.user_id = d1.user_id 
    AND d3.is_active = true
);

-- Insert default admin user if no users exist
-- Default credentials: username=admin, password=admin123
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO users (username, email, password_hash, is_admin)
SELECT 'admin', 'admin@dashboard.local', '$2a$10$47YQI.qV4Z3X6hGA8f6rhuT98ncbkgk.dg6W7bEAgsWmIlHgMZIfG', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
