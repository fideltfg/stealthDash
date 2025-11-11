# Dashboard Storage Fix - Deployment Checklist

## ✅ Pre-Deployment Checklist

### Code Changes
- [x] Database migration created (`001_multi_dashboard_support.sql`)
- [x] Backend API updated (`routes/dashboard.js`)
- [x] Auth service updated (`services/auth.ts`)
- [x] Dashboard storage service created (`services/dashboardStorage.ts`)
- [x] Main application updated (`main.ts`)
- [x] Storage helpers updated (`storage.ts`)

### Documentation
- [x] Technical documentation (`DASHBOARD_STORAGE_FIX.md`)
- [x] Migration guide (`MIGRATION_GUIDE.md`)
- [x] Migration script (`migrate.sh`)

### Testing (Do Before Deployment)
- [ ] Test migration on development database
- [ ] Verify new API endpoints work
- [ ] Test dashboard create/switch/delete/rename
- [ ] Test multi-device sync
- [ ] Test offline mode (localStorage fallback)
- [ ] Test undo/redo functionality
- [ ] Verify auto-save works

## 🚀 Deployment Steps

### Step 1: Backup (CRITICAL!)
```bash
# Backup database
pg_dump -U your_user -d your_database > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup localStorage (have users export)
# In browser console:
localStorage.getItem('dashboards.v2')
```

### Step 2: Deploy Code
```bash
cd /home/concordia/Dashboard

# Pull latest code
git pull origin main

# Install dependencies (if needed)
cd ping-server && npm install
cd .. && npm install

# Build frontend
npm run build
```

### Step 3: Database Setup

#### For New Installations:
```bash
cd /home/concordia/Dashboard/ping-server

# Run init-db.sql (includes all migrations)
psql -U your_user -d your_database -f init-db.sql
```

#### For Existing Databases (Upgrade):
```bash
cd /home/concordia/Dashboard/ping-server

# Run migration script
./migrate.sh

# OR manually:
psql -U your_user -d your_database -f migrations/001_multi_dashboard_support.sql.applied
```

### Step 4: Restart Services
```bash
# Restart ping-server
pm2 restart ping-server

# Verify it's running
pm2 status
pm2 logs ping-server --lines 50
```

### Step 5: Verify
```bash
# Check database schema
psql -U your_user -d your_database -c "\d dashboards"

# Should see: dashboard_id, name, is_active columns
```

### Step 6: Test
1. Login to dashboard
2. Create a new dashboard
3. Add widgets
4. Switch between dashboards
5. Check browser console for errors
6. Check server logs: `pm2 logs ping-server`

## 🔍 Post-Deployment Verification

### Database Verification
```sql
-- Check migration applied
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'dashboards' AND column_name IN ('dashboard_id', 'name', 'is_active');
-- Should return 3 rows

-- Check trigger exists
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'dashboards';
-- Should return: trigger_single_active_dashboard

-- Check user dashboards
SELECT user_id, COUNT(*) as dashboard_count, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM dashboards 
GROUP BY user_id;
-- Each user should have exactly 1 active dashboard
```

### API Verification
```bash
# Test save endpoint (with valid JWT)
curl -X POST http://localhost:3001/dashboard/save \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dashboardData": {"dashboards": [], "activeDashboardId": "test", "version": 1}}'

# Test load endpoint
curl http://localhost:3001/dashboard/load \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Frontend Verification
1. Open browser DevTools (F12)
2. Check Console for:
   - ✅ "Loading dashboards from server..."
   - ✅ "Loaded X dashboards from server"
   - ❌ No errors about dashboard saving
3. Check Network tab:
   - Dashboard save requests should succeed (200 OK)
   - Should see `/dashboard/save` calls

### Monitoring
```bash
# Watch logs for errors
pm2 logs ping-server --lines 100

# Check for database errors
tail -f /var/log/postgresql/postgresql-*.log
```

## 📊 Success Criteria

- [ ] Migration completed without errors
- [ ] All users can login successfully
- [ ] Dashboards load from server
- [ ] New dashboards can be created
- [ ] Dashboard switching works
- [ ] Widgets persist correctly
- [ ] Auto-save works (check after 30 seconds)
- [ ] Multi-device sync works
- [ ] No JavaScript console errors
- [ ] No server errors in logs

## 🚨 Rollback Procedure

If critical issues occur:

### 1. Immediate Rollback (Code)
```bash
cd /home/concordia/Dashboard
git revert HEAD~3  # Revert last 3 commits
npm run build
pm2 restart ping-server
```

### 2. Database Rollback (If Needed)
```sql
-- Restore from backup
psql -U your_user -d your_database < backup_TIMESTAMP.sql

-- OR remove migration manually
ALTER TABLE dashboards DROP COLUMN IF EXISTS dashboard_id;
ALTER TABLE dashboards DROP COLUMN IF EXISTS name;
ALTER TABLE dashboards DROP COLUMN IF EXISTS is_active;
DROP TRIGGER IF EXISTS trigger_single_active_dashboard ON dashboards;
DROP FUNCTION IF EXISTS ensure_single_active_dashboard();
```

### 3. Notify Users
- Inform users about the rollback
- Ask them to clear cache and reload
- LocalStorage data should still be intact

## 📝 Known Issues & Workarounds

### Issue: "Dashboard not found"
**Cause:** User's active dashboard missing
**Fix:** 
```sql
-- Set first dashboard as active
UPDATE dashboards SET is_active = true 
WHERE user_id = USER_ID AND id = (
  SELECT MIN(id) FROM dashboards WHERE user_id = USER_ID
);
```

### Issue: Multiple active dashboards
**Cause:** Trigger not working
**Fix:** 
```sql
-- Fix manually
UPDATE dashboards d1 SET is_active = false
WHERE user_id = USER_ID AND id != (
  SELECT MIN(id) FROM dashboards d2 WHERE d2.user_id = USER_ID
);
```

### Issue: Widgets disappearing
**Cause:** Dashboard state not being saved
**Fix:** 
1. Check browser console for save errors
2. Verify JWT token is valid
3. Check server logs
4. Worst case: Users can export from localStorage

## 📞 Emergency Contacts

- Database Admin: [contact info]
- Backend Dev: [contact info]  
- Frontend Dev: [contact info]
- DevOps: [contact info]

## 📈 Performance Monitoring

After deployment, monitor:

- **Response times:** Dashboard save/load should be <500ms
- **Database load:** New indexes should improve query performance
- **Error rates:** Should be near zero for dashboard operations
- **User complaints:** Monitor for data loss reports

## ✅ Final Sign-Off

- [ ] Technical Lead Approval
- [ ] QA Testing Complete
- [ ] Database Backup Verified
- [ ] Rollback Plan Tested
- [ ] Documentation Updated
- [ ] Stakeholders Notified

---

**Deployment Date:** _____________
**Deployed By:** _____________
**Verified By:** _____________

---

**Notes:**

