#!/bin/bash

# Dashboard Storage Migration Script
# This script applies the multi-dashboard database migration

set -e  # Exit on error

echo "🔧 Dashboard Storage Migration"
echo "================================"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found in current directory"
    echo "Please run this script from the Dashboard/ping-server directory"
    exit 1
fi

# Source .env file to get database credentials
source .env

# Check if required environment variables are set
if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo "❌ Error: DB_USER and DB_NAME must be set in .env file"
    exit 1
fi

echo "📊 Database: $DB_NAME"
echo "👤 User: $DB_USER"
echo ""

# Check if migration file exists
MIGRATION_FILE="migrations/001_multi_dashboard_support.sql.applied"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: Migration file not found: $MIGRATION_FILE"
    echo ""
    echo "ℹ️  Note: For new installations, use init-db.sql instead:"
    echo "   psql -U $DB_USER -d $DB_NAME -f init-db.sql"
    exit 1
fi

echo "📄 Migration file: $MIGRATION_FILE"
echo ""

# Confirm before proceeding
read -p "❓ Do you want to apply this migration? (yes/no): " -r
echo ""
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    echo "❌ Migration cancelled"
    exit 0
fi

echo "🚀 Applying migration..."
echo ""

# Apply the migration
if [ -z "$DB_PASSWORD" ]; then
    # No password - use peer authentication or .pgpass
    psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
else
    # With password
    PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "📋 Verification:"
    
    # Verify the new columns exist
    if [ -z "$DB_PASSWORD" ]; then
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dashboards' ORDER BY ordinal_position;"
    else
        PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dashboards' ORDER BY ordinal_position;"
    fi
    
    echo ""
    echo "🎉 Migration complete! Next steps:"
    echo "   1. Restart the ping-server: pm2 restart ping-server"
    echo "   2. Clear your browser cache and reload the dashboard"
    echo "   3. Login and verify your dashboards are loaded correctly"
else
    echo ""
    echo "❌ Migration failed! Please check the error messages above."
    exit 1
fi
