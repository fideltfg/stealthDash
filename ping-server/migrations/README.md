# Database Migrations

## Overview

This directory contains database migration scripts for the Dashboard application.

## Migration Status

### Applied Migrations (Integrated into init-db.sql)

The following migrations have been integrated into the main `init-db.sql` file and do not need to be run separately for new installations:

- ✅ **001_multi_dashboard_support.sql.applied** - Multi-dashboard support (dashboard_id, name, is_active columns and triggers)

## For New Installations

If you're setting up the database for the first time, simply run:

```bash
psql -U your_user -d your_database -f ../init-db.sql
```

This will create all tables with the latest schema including all applied migrations.

## For Existing Databases

If you have an existing database that was created before the multi-dashboard migration was integrated, you need to run the migration:

```bash
# Check if your dashboards table has the dashboard_id column
psql -U your_user -d your_database -c "\d dashboards"

# If dashboard_id column is missing, run the migration
psql -U your_user -d your_database -f 001_multi_dashboard_support.sql.applied
```

## Migration Checklist

Before running migrations on a production database:

1. ✅ **Backup your database**
   ```bash
   pg_dump -U your_user your_database > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. ✅ **Test in development environment first**

3. ✅ **Check current schema**
   ```bash
   psql -U your_user -d your_database -c "\d+ dashboards"
   ```

4. ✅ **Run migration**
   ```bash
   psql -U your_user -d your_database -f migration_file.sql
   ```

5. ✅ **Verify migration**
   ```bash
   psql -U your_user -d your_database -c "\d+ dashboards"
   ```

## Creating New Migrations

When creating new migrations:

1. Number them sequentially (002_, 003_, etc.)
2. Include rollback instructions in comments
3. Test thoroughly before applying to production
4. Document the migration in this README

## Rollback

If you need to rollback the multi-dashboard migration:

```sql
-- Remove multi-dashboard columns
ALTER TABLE dashboards DROP COLUMN IF EXISTS dashboard_id;
ALTER TABLE dashboards DROP COLUMN IF EXISTS name;
ALTER TABLE dashboards DROP COLUMN IF EXISTS is_active;

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_single_active_dashboard ON dashboards;
DROP FUNCTION IF EXISTS ensure_single_active_dashboard();

-- Remove indexes
DROP INDEX IF EXISTS idx_dashboards_user_active;
```

⚠️ **Warning**: Rolling back will result in data loss for multiple dashboards per user!
