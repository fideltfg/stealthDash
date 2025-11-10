# Dashboard Storage Migration Guide

## Overview

This migration fixes critical dashboard data loss issues by implementing proper multi-dashboard support with server-based storage as the primary source of truth.

## What's Fixed

- ✅ Each dashboard now has a unique UUID (no more overwrites)
- ✅ Server storage is primary (multi-device sync)
- ✅ Proper isolation between dashboards
- ✅ Transaction-based atomic saves
- ✅ localStorage fallback for offline support

## Migration Steps

### 1. Run Database Migration

```bash
cd /home/concordia/Dashboard/ping-server
./migrate.sh
```

The script will:
- Load database credentials from `.env`
- Apply the migration (`001_multi_dashboard_support.sql`)
- Verify the new schema
- Provide next steps

**Manual migration** (if script doesn't work):
```bash
cd /home/concordia/Dashboard/ping-server
psql -U your_db_user -d your_db_name -f migrations/001_multi_dashboard_support.sql
```

### 2. Restart Services

```bash
# If using pm2
pm2 restart ping-server

# Or if running directly
cd /home/concordia/Dashboard/ping-server
npm restart
```

### 3. Rebuild Frontend

```bash
cd /home/concordia/Dashboard
npm run build
```

### 4. Test

1. **Login** - Your existing dashboard should load from localStorage
2. **Create a new dashboard** - Should sync to server immediately
3. **Add widgets** to each dashboard
4. **Switch between dashboards** - Verify widgets are different
5. **Logout and login** - All dashboards should persist
6. **Open in another browser/device** - Should see same dashboards

## What Changed

### Database Schema
- Added `dashboard_id` UUID column (unique identifier)
- Added `name` column (dashboard names)
- Added `is_active` column (tracks active dashboard)
- Added trigger to enforce single active dashboard per user

### Backend API
- `POST /dashboard/save` - Saves all dashboards atomically
- `GET /dashboard/load` - Loads all user dashboards
- `POST /dashboard/save-single` - Save individual dashboard
- `DELETE /dashboard/:id` - Delete specific dashboard

### Frontend
- Server is now primary storage (localStorage is backup)
- Intelligent debouncing (2s debounce, 5s minimum interval)
- Auto-save every 30 seconds
- Immediate sync on dashboard switch/create/delete/rename

## Verification

### Check Database Schema
```sql
-- Verify new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dashboards'
ORDER BY ordinal_position;

-- Expected output should include:
-- dashboard_id | uuid
-- name         | character varying(255)
-- is_active    | boolean
```

### Check Your Dashboards
```sql
-- View your dashboards (replace YOUR_USER_ID)
SELECT id, dashboard_id, name, is_active, created_at, updated_at
FROM dashboards
WHERE user_id = YOUR_USER_ID
ORDER BY created_at;
```

### Check Trigger
```sql
-- Verify trigger exists
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'dashboards';

-- Expected: trigger_single_active_dashboard
```

## Rollback (If Needed)

If you encounter issues, you can rollback:

### 1. Database Rollback
```sql
-- Remove new columns
ALTER TABLE dashboards DROP COLUMN IF EXISTS dashboard_id;
ALTER TABLE dashboards DROP COLUMN IF EXISTS name;
ALTER TABLE dashboards DROP COLUMN IF EXISTS is_active;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_single_active_dashboard ON dashboards;
DROP FUNCTION IF EXISTS ensure_single_active_dashboard();
```

### 2. Code Rollback
```bash
cd /home/concordia/Dashboard
git revert HEAD~2  # Revert last 2 commits
npm run build
pm2 restart all
```

## Troubleshooting

### Migration Fails
**Error:** "column already exists"
- **Solution:** Migration was already run. Check if columns exist:
  ```sql
  \d dashboards
  ```

### Can't Connect to Database
**Error:** "FATAL: password authentication failed"
- **Solution:** Check `.env` file has correct `DB_USER`, `DB_PASSWORD`, `DB_NAME`

### Dashboards Not Syncing
1. Check browser console for errors (F12)
2. Verify authentication: Check for JWT token
3. Check ping-server logs:
   ```bash
   pm2 logs ping-server
   ```

### Lost Dashboard Data
- Data is safe in localStorage as backup
- Clear browser cache may have cleared localStorage
- Check database directly:
  ```sql
  SELECT * FROM dashboards WHERE user_id = YOUR_USER_ID;
  ```

## Benefits

### For Users
- 📱 Multi-device sync
- 💾 No more data loss
- 🔄 Automatic backups
- 🚀 Better performance
- 📊 Unlimited dashboards

### For Developers
- 🔒 Proper data isolation
- 🔁 Transaction-based saves
- 📝 Better error handling
- 🧪 Easier testing
- 📈 Scalable architecture

## Support

If you encounter issues:

1. Check the logs: `pm2 logs`
2. Check browser console (F12)
3. Verify database schema
4. Review `DASHBOARD_STORAGE_FIX.md` for technical details

## Next Steps

After successful migration:

1. ✅ Monitor logs for any errors
2. ✅ Test all dashboard operations
3. ✅ Inform users about the update
4. ✅ Monitor server performance
5. ✅ Consider implementing dashboard sharing (future enhancement)

---

**Last Updated:** November 10, 2025
**Version:** 1.0.0
