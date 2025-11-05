# Authentication & User Management System

This dashboard now includes comprehensive user authentication, server-side persistence, and admin user management capabilities.

## Features

### User Authentication
- **Registration**: Create a new account with username, email, and password
- **Login**: Secure login with JWT tokens
- **Session Management**: Tokens valid for 7 days
- **Logout**: Clear session and reload dashboard

### Dashboard Persistence
- **Auto-save**: Dashboard automatically saves to server every 30 seconds
- **Manual Save**: Dashboard also saves on every change
- **Load on Login**: Your dashboard layout is restored when you log in
- **Cross-Device**: Access your dashboard from any browser

### User Profile Management
- **Settings Dialog**: Access via ⚙️ Settings button in user menu
- **Update Email**: Change your email address
- **Change Password**: Update your password (requires current password verification)
- **Account Information**: View account details and admin status

### Admin Dashboard
- **Admin Access**: Admin users see 👑 Admin button in user menu
- **User Management**: View all users with detailed information
- **User Statistics**: Dashboard showing total users, dashboards, and admins
- **Make/Remove Admin**: Promote users to admin or demote them
- **Reset Password**: Admin can reset any user's password
- **Delete Users**: Remove users and their dashboards
- **Self-Protection**: Admins cannot delete themselves or remove their own admin status

## Architecture

### Backend (ping-server)
- **PostgreSQL Database**: Stores users and dashboard data
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs for secure password storage
- **Admin Middleware**: Authorization checks for admin-only routes
- **RESTful API**: Clean API endpoints for auth, data, and administration

### Database Schema
```sql
users:
  - id (serial primary key)
  - username (unique)
  - email (unique)
  - password_hash
  - is_admin (boolean, default false)
  - created_at
  - updated_at

dashboards:
  - id (serial primary key)
  - user_id (foreign key)
  - dashboard_data (jsonb)
  - created_at
  - updated_at
```

## API Endpoints

### Authentication

#### POST /auth/register
Register a new user
```json
Request:
{
  "username": "john",
  "email": "john@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com",
    "createdAt": "2025-11-05T17:32:34.541Z"
  },
  "token": "eyJhbGc..."
}
```

#### POST /auth/login
Login existing user
```json
Request:
{
  "username": "john",
  "password": "password123"
}

Response:
{
  "success": true,
  "user": { ... },
  "token": "eyJhbGc..."
}
```

#### GET /auth/verify
Verify token is still valid (requires Authorization header)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "user": { ... }
}
```

### Dashboard Management

#### POST /dashboard/save
Save dashboard (requires authentication)
```json
Headers:
Authorization: Bearer <token>

Request:
{
  "dashboardData": { ... }  // Your dashboard state
}

Response:
{
  "success": true,
  "message": "Dashboard saved successfully"
}
```

#### GET /dashboard/load
Load dashboard (requires authentication)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "dashboard": { ... },     // Your dashboard state
  "updatedAt": "2025-11-05T17:32:34.541Z"
}
```

### User Profile

#### POST /user/change-password
Change current user's password
```json
Headers:
Authorization: Bearer <token>

Request:
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456"
}

Response:
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### POST /user/update-profile
Update current user's email
```json
Headers:
Authorization: Bearer <token>

Request:
{
  "email": "newemail@example.com"
}

Response:
{
  "success": true,
  "message": "Profile updated successfully"
}
```

#### GET /user/profile
Get current user's profile with admin status
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com",
    "is_admin": true,
    "created_at": "2025-01-05T12:00:00.000Z",
    "updated_at": "2025-01-05T12:00:00.000Z"
  }
}
```

### Admin Routes

**Note**: All admin routes require the user to have `is_admin = true` in the database.

#### GET /admin/users
Get all users (admin only)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "users": [
    {
      "id": 1,
      "username": "john",
      "email": "john@example.com",
      "is_admin": true,
      "created_at": "2025-01-05T12:00:00.000Z",
      "updated_at": "2025-01-05T12:00:00.000Z"
    },
    ...
  ]
}
```

#### POST /admin/users/:userId/make-admin
Promote user to administrator (admin only)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "User promoted to admin"
}
```

#### POST /admin/users/:userId/remove-admin
Remove administrator privileges (admin only)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Admin privileges removed"
}

// Note: Users cannot remove their own admin status
```

#### POST /admin/users/:userId/reset-password
Reset a user's password (admin only)
```json
Headers:
Authorization: Bearer <token>

Request:
{
  "newPassword": "resetpass123"
}

Response:
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### DELETE /admin/users/:userId
Delete user and their dashboard (admin only)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "User deleted successfully"
}

// Note: Users cannot delete themselves
```

#### GET /admin/stats
Get system statistics (admin only)
```json
Headers:
Authorization: Bearer <token>

Response:
{
  "success": true,
  "stats": {
    "totalUsers": 15,
    "totalDashboards": 12,
    "totalAdmins": 2
  }
}
```

## Frontend Integration

### AuthService
The `authService` singleton handles all authentication and user management operations:

```typescript
import { authService } from './services/auth';

// ===== Authentication =====

// Register
const result = await authService.register('username', 'email', 'password');

// Login
const result = await authService.login('username', 'password');

// Check if authenticated
const isAuth = authService.isAuthenticated();

// Get current user
const user = authService.getUser();

// Logout
authService.logout();

// ===== Dashboard Persistence =====

// Save dashboard
await authService.saveDashboard(dashboardData);

// Load dashboard
const dashboard = await authService.loadDashboard();

// ===== User Profile =====

// Get fresh profile (updates local user object)
await authService.getProfile();

// Change password
const result = await authService.changePassword('currentPass', 'newPass');

// Update email
const result = await authService.updateProfile('newemail@example.com');

// Check if current user is admin
const isAdmin = authService.isAdmin();

// ===== Admin Functions =====

// Get all users
const users = await authService.getUsers();

// Make user admin
const result = await authService.makeAdmin(userId);

// Remove admin privileges
const result = await authService.removeAdmin(userId);

// Reset user's password
const result = await authService.resetUserPassword(userId, 'newPass');

// Delete user
const result = await authService.deleteUser(userId);

// Get system statistics
const stats = await authService.getAdminStats();
```

### UI Components

#### AuthUI
Login and registration dialog
```typescript
import { AuthUI } from './components/AuthUI';

const authUI = new AuthUI(handleAuthChange);
authUI.showLoginDialog();

// Create user menu with settings and admin buttons
const menu = authUI.createUserMenu(
  user,
  () => settingsUI.showSettingsDialog(),
  () => adminUI.showAdminDashboard()
);
```

#### UserSettingsUI
User profile and password management
```typescript
import { UserSettingsUI } from './components/UserSettingsUI';

const settingsUI = new UserSettingsUI();
settingsUI.showSettingsDialog();
```

#### AdminDashboardUI
Admin control panel for user management
```typescript
import { AdminDashboardUI } from './components/AdminDashboardUI';

const adminUI = new AdminDashboardUI();
await adminUI.showAdminDashboard();

```

### AuthUI Component
The `AuthUI` component provides login/register dialogs:

```typescript
import { AuthUI } from './components/AuthUI';

const authUI = new AuthUI((user) => {
  // Called when user logs in
  console.log('User logged in:', user);
});

// Show login dialog
authUI.showLoginDialog();

// Create user menu
const menu = authUI.createUserMenu(user);
document.body.appendChild(menu);
```

## Security Considerations

### Production Deployment

**IMPORTANT**: Before deploying to production, update these settings in `docker-compose.yml`:

1. **Change JWT Secret**:
   ```yaml
   environment:
     - JWT_SECRET=your-strong-random-secret-here
   ```

2. **Change Database Password**:
   ```yaml
   environment:
     - DB_PASSWORD=your-strong-password-here
     - POSTGRES_PASSWORD=your-strong-password-here
   ```

3. **Use HTTPS**: Always use HTTPS in production to protect tokens

4. **Enable CORS Restrictions**: Update CORS settings in `ping-server/server.js`:
   ```javascript
   app.use(cors({
     origin: 'https://yourdomain.com'
   }));
   ```

5. **Set Secure Cookies**: For production, consider using httpOnly cookies instead of localStorage

### Password Requirements
- Minimum 6 characters (enforced)
- Consider adding complexity requirements for production

### Token Expiry
- Tokens expire after 7 days
- Users must log in again after expiry
- Consider adding refresh tokens for longer sessions

## Local Storage

The authentication system uses localStorage to store:
- `auth_token`: JWT token
- `auth_user`: User information (id, username, email)

These are cleared on logout.

## Docker Volumes

Dashboard data persists across container restarts via the PostgreSQL volume:
```yaml
volumes:
  postgres_data:
```

To completely reset the database:
```bash
docker compose down -v
docker compose up -d
```

## Testing

### Test Registration
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"test123"}'
```

### Test Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
```

### Test Dashboard Save
```bash
curl -X POST http://localhost:3001/dashboard/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"dashboardData":{"widgets":[]}}'
```

## Troubleshooting

### Can't Login
- Check if postgres container is running: `docker compose ps`
- Check ping-server logs: `docker compose logs ping-server`
- Verify database connection: `docker compose exec ping-server node -e "require('./db')"`

### Dashboard Not Saving
- Check browser console for errors
- Verify you're logged in: Check for token in localStorage
- Check ping-server logs for save errors

### Database Connection Errors
- Ensure postgres container is healthy
- Check environment variables in docker-compose.yml
- Restart containers: `docker compose restart`

## Migration Guide

### Existing Users
If you have an existing dashboard in localStorage:
1. Register/Login to create an account
2. Your local dashboard will be automatically saved to the server
3. From now on, changes sync to the server

### Multiple Devices
1. Login on each device with the same account
2. Most recent changes will be loaded
3. Auto-save keeps all devices in sync (may take up to 30 seconds)

## Future Enhancements

Potential improvements:
- Email verification
- Password reset functionality
- OAuth/Social login (Google, GitHub)
- Dashboard sharing between users
- Multiple dashboard profiles per user
- Real-time sync via WebSockets
- Dashboard templates/presets
- User settings/preferences
