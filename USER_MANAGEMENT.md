# User Management System - Complete Implementation

## Overview
The dashboard now includes a complete user management system with user profiles, password management, and admin capabilities.

## What's New

### 1. User Settings Dialog
Accessible via the **⚙️ Settings** button in the user menu (top right).

**Features:**
- **Profile Information** (Green section)
  - View username (read-only)
  - Update email address
  - Save changes to server
  
- **Change Password** (Yellow section)
  - Current password verification required
  - New password (minimum 6 characters)
  - Password confirmation
  - Secure password update
  
- **Account Information** (Blue section)
  - User ID display
  - Account creation date
  - Admin status indicator (👑 Administrator badge for admin users)

### 2. Admin Dashboard
Accessible via the **👑 Admin** button in the user menu (only visible to admins).

**Features:**
- **Statistics Dashboard**
  - Total Users
  - Active Dashboards  
  - Total Administrators
  
- **User Management Table**
  - View all users with details (ID, username, email, role, creation date)
  - Inline actions per user:
    - **Make Admin** - Promote regular users to administrator
    - **Remove Admin** - Demote administrators to regular users
    - **Reset Password** - Admin can set new password for any user
    - **Delete** - Remove user and their dashboard
  
**Security Features:**
- Admins cannot delete themselves
- Admins cannot remove their own admin privileges
- All actions require admin authentication
- Admin status is verified per-request from database (not from JWT token)

## How to Use

### As a Regular User

1. **Login** to your dashboard
2. Look for the user menu in the **top right corner**
3. Click **⚙️ Settings** to:
   - Update your email
   - Change your password
   - View account information

### As an Administrator

1. **Login** to your dashboard (you must have admin privileges)
2. Your user menu will have TWO buttons:
   - **⚙️ Settings** - Your personal profile settings
   - **👑 Admin** - Admin control panel

3. Click **👑 Admin** to access the admin dashboard where you can:
   - View all users in the system
   - See system statistics
   - Promote users to admin or demote them
   - Reset passwords for users
   - Delete user accounts

## Database Schema

The `users` table now includes:
```sql
- id (serial primary key)
- username (unique, immutable)
- email (unique, updatable)
- password_hash (bcrypt hashed)
- is_admin (boolean, default: false)
- created_at (timestamp)
- updated_at (timestamp, auto-updated)
```

## Migration

If you already have users in your database, run the migration:

```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard < ping-server/migrate-admin-column.sql
```

To make the first user an admin:
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c "UPDATE users SET is_admin = true WHERE id = (SELECT MIN(id) FROM users);"
```

## API Endpoints Summary

### User Profile Endpoints
- `POST /user/change-password` - Change your password
- `POST /user/update-profile` - Update your email
- `GET /user/profile` - Get your profile with admin status

### Admin Endpoints (Require is_admin = true)
- `GET /admin/users` - Get all users
- `POST /admin/users/:userId/make-admin` - Promote to admin
- `POST /admin/users/:userId/remove-admin` - Demote from admin
- `POST /admin/users/:userId/reset-password` - Reset user password
- `DELETE /admin/users/:userId` - Delete user
- `GET /admin/stats` - Get system statistics

## Technical Implementation

### Backend Components
1. **server.js** - All API routes (auth, dashboard, profile, admin)
2. **auth.js** - JWT middleware and token generation
3. **db.js** - PostgreSQL connection pool
4. **init-db.sql** - Database schema with is_admin column

### Frontend Components
1. **AuthService** (services/auth.ts)
   - All authentication and API communication
   - Profile management methods
   - Admin operation methods
   
2. **AuthUI** (components/AuthUI.ts)
   - Login/Register dialog
   - User menu with Settings and Admin buttons
   
3. **UserSettingsUI** (components/UserSettingsUI.ts)
   - Profile editing dialog
   - Password change form
   - Account information display
   
4. **AdminDashboardUI** (components/AdminDashboardUI.ts)
   - Statistics cards
   - User management table
   - Inline action buttons
   - Real-time updates after actions

### Security Features
- JWT tokens (7-day expiry)
- bcrypt password hashing (10 salt rounds)
- Admin middleware checks database on every request
- Self-modification prevention for admins
- Current password required for password changes
- Email uniqueness validation

## Testing the System

### 1. Test User Profile
```bash
# Login as your user
# Click Settings button
# Try changing email
# Try changing password
```

### 2. Test Admin Dashboard (if you're an admin)
```bash
# Login as admin user
# Click Admin button
# View user list
# Try promoting a user to admin
# Try resetting a password
# View statistics
```

### 3. Verify Admin Access Control
```bash
# Login as regular (non-admin) user
# Verify Admin button is NOT visible
# Regular users should only see Settings button
```

## Files Modified/Created

### New Files
- `src/components/UserSettingsUI.ts` - User settings dialog
- `src/components/AdminDashboardUI.ts` - Admin dashboard
- `ping-server/migrate-admin-column.sql` - Database migration

### Modified Files
- `ping-server/server.js` - Added profile and admin routes
- `ping-server/init-db.sql` - Added is_admin column
- `src/services/auth.ts` - Added profile and admin methods
- `src/components/AuthUI.ts` - Added Settings and Admin buttons
- `src/main.ts` - Integrated new UI components
- `AUTH_SYSTEM.md` - Updated documentation

## Access the Dashboard

Visit: **http://localhost:3000**

- If not logged in, you'll see the login dialog
- After login, your dashboard loads with user menu (top right)
- Admin users will see both Settings and Admin buttons
- Regular users will only see the Settings button

Enjoy your new user management system! 🎉
