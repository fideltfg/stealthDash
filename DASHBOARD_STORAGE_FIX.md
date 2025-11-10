# Dashboard Storage Fix - Implementation Plan

## Problem Summary

The dashboard application had critical data loss issues:

1. **Single Dashboard Per User**: Database only supported one dashboard per user
2. **localStorage Primary**: Frontend used localStorage as primary storage, not server
3. **Data Conflicts**: Saving one dashboard could overwrite another's data
4. **No Isolation**: Dashboard operations weren't isolated by dashboard ID

## Solution Implemented

### 1. Database Migration (`ping-server/migrations/001_multi_dashboard_support.sql`)

**Changes:**
- Added `dashboard_id` column (UUID) to identify each dashboard uniquely
- Added `name` column for dashboard names
- Added `is_active` column to track the active dashboard
- Created trigger to ensure only one dashboard is marked active per user
- Added indexes for performance

**Result:** Database now supports multiple dashboards per user with proper isolation

### 2. Backend API Updates (`ping-server/routes/dashboard.js`)

**New Endpoints:**
- `POST /dashboard/save` - Saves entire multi-dashboard state (atomic transaction)
- `GET /dashboard/load` - Loads all dashboards for the user
- `POST /dashboard/save-single` - Saves a single dashboard (for incremental updates)
- `DELETE /dashboard/:dashboardId` - Deletes a specific dashboard

**Key Features:**
- Transaction-based saves (all-or-nothing)
- Automatic cleanup of deleted dashboards
- Prevents deleting the last dashboard
- Handles active dashboard switching

### 3. Frontend Auth Service (`src/services/auth.ts`)

**New Methods:**
- `saveDashboard()` - Updated to save multi-dashboard state
- `loadDashboard()` - Updated to load multi-dashboard state
- `saveSingleDashboard()` - Save individual dashboard
- `deleteDashboard()` - Delete dashboard from server

**Improvements:**
- Better error logging with emoji indicators
- Returns full multi-dashboard state structure

### 4. Unified Storage Service (`src/services/dashboardStorage.ts`)

**New Service:**
Created `DashboardStorageService` that:
- Manages both server and localStorage
- Uses server as primary source when authenticated
- Falls back to localStorage when offline
- Implements intelligent debouncing (2s debounce, 5s minimum interval)
- Auto-syncs localStorage→server on first load if server is empty
- Provides atomic save operations

**Key Features:**
```typescript
- loadDashboards(): Loads from server (if auth) or localStorage
- saveDashboards(state, immediate): Saves to both with debouncing
- deleteDashboard(id, state): Deletes from both
- syncWithServer(): Forces immediate sync
```

## Migration Steps

### Server Side

1. **Run Database Migration:**
   ```bash
   cd /home/concordia/Dashboard/ping-server
   psql -U your_db_user -d your_db_name -f migrations/001_multi_dashboard_support.sql
   ```

2. **Restart ping-server:**
   ```bash
   pm2 restart ping-server
   # or
   npm restart
   ```

### Frontend Side (TO BE COMPLETED)

The following changes need to be made to `src/main.ts`:

1. **Import the new service:**
   ```typescript
   import { dashboardStorage } from './services/dashboardStorage';
   import { loadMultiDashboardState, saveMultiDashboardState, 
            getAllDashboards, getActiveDashboardId, switchDashboard, 
            createDashboard, deleteDashboard, renameDashboard } from './storage';
   ```

2. **Update constructor:**
   ```typescript
   constructor() {
     this.authUI = new AuthUI(this.handleAuthChange.bind(this));
     this.userSettingsUI = new UserSettingsUI();
     this.adminDashboardUI = new AdminDashboardUI();
     this.credentialsUI = new CredentialsUI();
     
     // Load from localStorage initially (will be replaced by server data if auth'd)
     this.state = loadState();
     this.init();
   }
   ```

3. **Update init() method:**
   ```typescript
   private async init(): Promise<void> {
     // ... password reset check ...

     if (authService.isAuthenticated()) {
       this.currentUser = authService.getUser();
       
       // Verify token
       const valid = await authService.verify();
       if (!valid) {
         authService.logout();
         return;
       }

       await authService.getProfile();
       this.currentUser = authService.getUser();

       // Load dashboards from server (primary source)
       console.log('🔄 Loading dashboards from server...');
       const multiState = await dashboardStorage.loadDashboards();
       
       // Get the active dashboard's state
       const activeDashboard = multiState.dashboards.find(
         d => d.id === multiState.activeDashboardId
       );
       
       if (activeDashboard) {
         this.state = activeDashboard.state;
         console.log('✅ Loaded active dashboard:', activeDashboard.name);
       }

       this.setupDOM();
       this.setupTheme();
       this.setupBackground();
       this.setupEventListeners();
       this.render();
       this.saveHistory();
       this.showUserMenu();
       this.startAutoSave();
     } else {
       this.authUI.showLoginDialog();
     }
   }
   ```

4. **Update startAutoSave():**
   ```typescript
   private startAutoSave(): void {
     // Auto-save to server every 30 seconds
     this.autoSaveInterval = window.setInterval(async () => {
       if (authService.isAuthenticated()) {
         const multiState = loadMultiDashboardState();
         
         // Update the active dashboard's state
         const activeDashboard = multiState.dashboards.find(
           d => d.id === multiState.activeDashboardId
         );
         if (activeDashboard) {
           activeDashboard.state = this.state;
           activeDashboard.updatedAt = Date.now();
         }
         
         // Save entire state to server
         await dashboardStorage.saveDashboards(multiState);
       }
     }, 30000);
   }
   ```

5. **Update save operations:**
   
   Replace all instances of:
   ```typescript
   debouncedSave(this.state);
   ```
   
   With:
   ```typescript
   // Update current dashboard in multi-state
   const multiState = loadMultiDashboardState();
   const activeDashboard = multiState.dashboards.find(
     d => d.id === multiState.activeDashboardId
   );
   if (activeDashboard) {
     activeDashboard.state = this.state;
     activeDashboard.updatedAt = Date.now();
     saveMultiDashboardState(multiState); // Local save
     dashboardStorage.saveDashboards(multiState); // Server save (debounced)
   }
   ```

6. **Update dashboard manager:**
   
   When switching dashboards:
   ```typescript
   const newState = switchDashboard(dashboardId);
   if (newState) {
     this.state = newState;
     // Sync to server
     const multiState = loadMultiDashboardState();
     await dashboardStorage.saveDashboards(multiState, true); // Immediate save
     // Re-render
     this.render();
   }
   ```

   When deleting dashboards:
   ```typescript
   const multiState = loadMultiDashboardState();
   const oldLength = multiState.dashboards.length;
   
   deleteDashboard(dashboardId); // Updates multiState locally
   
   const newMultiState = loadMultiDashboardState();
   if (newMultiState.dashboards.length < oldLength) {
     await dashboardStorage.deleteDashboard(dashboardId, newMultiState);
     
     // Switch to new active dashboard
     this.state = switchDashboard(newMultiState.activeDashboardId) || this.state;
     this.render();
   }
   ```

## Testing Plan

### 1. Database Migration Test
```sql
-- Verify new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dashboards';

-- Verify trigger exists
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'dashboards';
```

### 2. Backend API Test
```bash
# Test save (with valid JWT token)
curl -X POST http://localhost:3001/dashboard/save \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dashboardData": {
      "dashboards": [{
        "id": "test-uuid",
        "name": "Test Dashboard",
        "state": {"widgets": [], "theme": "dark"},
        "createdAt": 1234567890,
        "updatedAt": 1234567890
      }],
      "activeDashboardId": "test-uuid",
      "version": 1
    }
  }'

# Test load
curl http://localhost:3001/dashboard/load \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Frontend Test
1. Login as user
2. Create multiple dashboards
3. Add widgets to each
4. Switch between dashboards - verify widgets are different
5. Logout and login - verify all dashboards persist
6. Delete a dashboard - verify it's removed from both client and server
7. Test offline: disconnect network, make changes, reconnect - verify sync

## Rollback Plan

If issues occur:

1. **Database Rollback:**
   ```sql
   -- Remove new columns
   ALTER TABLE dashboards DROP COLUMN IF EXISTS dashboard_id;
   ALTER TABLE dashboards DROP COLUMN IF EXISTS name;
   ALTER TABLE dashboards DROP COLUMN IF EXISTS is_active;
   
   -- Drop trigger
   DROP TRIGGER IF EXISTS trigger_single_active_dashboard ON dashboards;
   DROP FUNCTION IF EXISTS ensure_single_active_dashboard();
   ```

2. **Backend Rollback:**
   ```bash
   git checkout HEAD~1 -- ping-server/routes/dashboard.js
   pm2 restart ping-server
   ```

3. **Frontend Rollback:**
   ```bash
   git checkout HEAD~1 -- src/services/auth.ts src/services/dashboardStorage.ts
   npm run build
   ```

## Benefits

1. **Data Integrity**: Each dashboard is isolated by UUID
2. **Multi-Device Sync**: Server is source of truth
3. **Offline Support**: localStorage provides fallback
4. **Performance**: Intelligent debouncing prevents excessive API calls
5. **Reliability**: Transaction-based saves ensure atomicity
6. **Scalability**: Supports unlimited dashboards per user

## Security Considerations

- Dashboard IDs are UUIDs (not sequential, hard to guess)
- All operations require authentication (JWT)
- User can only access their own dashboards (enforced by user_id FK)
- Server validates all dashboard data before saving
- localStorage still contains sensitive data (existing limitation)

## Future Improvements

1. Encrypt sensitive widget data before storing on server
2. Implement dashboard sharing between users
3. Add dashboard version history/snapshots
4. Implement real-time sync with WebSockets
5. Add dashboard templates/marketplace
