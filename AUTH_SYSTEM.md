# Authentication & Persistence System

This dashboard now includes user authentication and server-side persistence, allowing users to save their dashboard layouts and access them from any browser.

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

## Architecture

### Backend (ping-server)
- **PostgreSQL Database**: Stores users and dashboard data
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs for secure password storage
- **RESTful API**: Clean API endpoints for auth and data

### Database Schema
```sql
users:
  - id (serial primary key)
  - username (unique)
  - email (unique)
  - password_hash
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

## Frontend Integration

### AuthService
The `authService` singleton handles all authentication operations:

```typescript
import { authService } from './services/auth';

// Register
const result = await authService.register('username', 'email', 'password');

// Login
const result = await authService.login('username', 'password');

// Check if authenticated
const isAuth = authService.isAuthenticated();

// Get current user
const user = authService.getUser();

// Save dashboard
await authService.saveDashboard(dashboardData);

// Load dashboard
const dashboard = await authService.loadDashboard();

// Logout
authService.logout();
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
