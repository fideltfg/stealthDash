# System Architecture - User Management

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Port 3000)                      │
│                     Vite + TypeScript + Docker                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Main Dashboard                          │ │
│  │  - Canvas with widgets                                      │ │
│  │  - Auto-save every 30s                                      │ │
│  │  - User menu (top right)                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   AuthUI        │  │ UserSettingsUI   │  │ AdminDashboard │ │
│  │                 │  │                  │  │                │ │
│  │ • Login/Reg     │  │ • Update Email   │  │ • User List    │ │
│  │ • User Menu     │  │ • Change Pass    │  │ • Statistics   │ │
│  │ • Settings Btn  │  │ • Account Info   │  │ • Make Admin   │ │
│  │ • Admin Btn     │  │ • 3 Sections     │  │ • Reset Pass   │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                    │                     │          │
│           └────────────────────┼─────────────────────┘          │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │    AuthService        │                    │
│                    │                       │                    │
│                    │  • Authentication     │                    │
│                    │  • Dashboard CRUD     │                    │
│                    │  • Profile Mgmt       │                    │
│                    │  • Admin Operations   │                    │
│                    │  • Local Storage      │                    │
│                    └───────────┬───────────┘                    │
│                                │                                │
└────────────────────────────────┼────────────────────────────────┘
                                 │ HTTP/JSON
                                 │ JWT Bearer Token
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                      BACKEND (Port 3001)                         │
│                   Express.js + Node 20 + Docker                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                       Routes                                │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  Authentication Routes:                                     │ │
│  │    POST /auth/register  - Create account                    │ │
│  │    POST /auth/login     - Login with JWT                    │ │
│  │    GET  /auth/verify    - Verify token                      │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  Dashboard Routes: (Auth Required)                          │ │
│  │    POST /dashboard/save - Save dashboard                    │ │
│  │    GET  /dashboard/load - Load dashboard                    │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  User Profile Routes: (Auth Required)                       │ │
│  │    POST /user/change-password - Update password             │ │
│  │    POST /user/update-profile  - Update email                │ │
│  │    GET  /user/profile         - Get profile + admin flag    │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  Admin Routes: (Admin Required)                             │ │
│  │    GET    /admin/users                  - List all users    │ │
│  │    POST   /admin/users/:id/make-admin   - Promote user      │ │
│  │    POST   /admin/users/:id/remove-admin - Demote user       │ │
│  │    POST   /admin/users/:id/reset-pass   - Reset password    │ │
│  │    DELETE /admin/users/:id              - Delete user       │ │
│  │    GET    /admin/stats                  - Get statistics    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐ │
│  │ auth.js      │  │  db.js      │  │  Other Features        │ │
│  │              │  │             │  │                        │ │
│  │ • JWT verify │  │ • PG Pool   │  │ • Modbus               │ │
│  │ • Generate   │  │ • Connect   │  │ • SNMP                 │ │
│  │ • Middleware │  │ • Query     │  │ • Ping                 │ │
│  └──────────────┘  └─────┬───────┘  │ • Home Assistant Proxy │ │
│                           │          └────────────────────────┘ │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            │ TCP/IP
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                     DATABASE (Port 5432)                          │
│                  PostgreSQL 15-alpine + Docker                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                        users                               │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  id             SERIAL PRIMARY KEY                         │  │
│  │  username       VARCHAR(50) UNIQUE NOT NULL                │  │
│  │  email          VARCHAR(100) UNIQUE NOT NULL               │  │
│  │  password_hash  VARCHAR(255) NOT NULL                      │  │
│  │  is_admin       BOOLEAN DEFAULT false                      │  │
│  │  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP        │  │
│  │  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      dashboards                            │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  id               SERIAL PRIMARY KEY                       │  │
│  │  user_id          INTEGER → users.id (CASCADE)             │  │
│  │  dashboard_data   JSONB                                    │  │
│  │  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP      │  │
│  │  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Persistent Volume: postgres_data                                │
└──────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
┌─────────┐                ┌─────────┐               ┌──────────┐
│ Browser │                │  API    │               │ Database │
└────┬────┘                └────┬────┘               └─────┬────┘
     │                          │                          │
     │  1. POST /auth/login     │                          │
     │  {username, password}    │                          │
     ├─────────────────────────>│                          │
     │                          │  2. Query user           │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  3. Return user data     │
     │                          │<─────────────────────────┤
     │                          │                          │
     │                          │  4. Verify password      │
     │                          │     (bcrypt.compare)     │
     │                          │                          │
     │                          │  5. Generate JWT token   │
     │                          │     (7-day expiry)       │
     │                          │                          │
     │  6. Return token + user  │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  7. Store in localStorage│                          │
     │     (token + user data)  │                          │
     │                          │                          │
```

## Admin Authorization Flow

```
┌─────────┐              ┌──────────┐              ┌──────────┐
│ Browser │              │   API    │              │ Database │
└────┬────┘              └────┬─────┘              └─────┬────┘
     │                        │                          │
     │  1. GET /admin/users   │                          │
     │  Authorization: Bearer │                          │
     ├───────────────────────>│                          │
     │                        │                          │
     │                        │  2. authMiddleware       │
     │                        │     Verify JWT           │
     │                        │     Extract userId       │
     │                        │                          │
     │                        │  3. adminMiddleware      │
     │                        │     Query user           │
     │                        ├─────────────────────────>│
     │                        │                          │
     │                        │  4. Check is_admin       │
     │                        │<─────────────────────────┤
     │                        │                          │
     │                        │  5. If NOT admin:        │
     │  {"error": "Unauthorized"}                        │
     │<───────────────────────┤                          │
     │                        │                          │
     │                        │  6. If admin:            │
     │                        │     Execute query        │
     │                        ├─────────────────────────>│
     │                        │                          │
     │                        │  7. Return results       │
     │                        │<─────────────────────────┤
     │                        │                          │
     │  8. {"success": true,  │                          │
     │      "users": [...]}   │                          │
     │<───────────────────────┤                          │
     │                        │                          │
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         Security Stack                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Password Security                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • bcrypt hashing (10 salt rounds)                          │ │
│  │ • No plain text passwords in database                      │ │
│  │ • Password validation (min 6 characters)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 2: JWT Authentication                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • 7-day token expiry                                        │ │
│  │ • Signed with secret key                                    │ │
│  │ • Bearer token in Authorization header                     │ │
│  │ • Token validation on every request                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 3: Authorization Middleware                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • authMiddleware: Verify JWT, extract userId               │ │
│  │ • adminMiddleware: Check is_admin in database              │ │
│  │ • Per-request database check (not cached)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 4: Business Logic Protection                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Cannot delete yourself                                    │ │
│  │ • Cannot remove your own admin status                      │ │
│  │ • Email uniqueness validation                              │ │
│  │ • Username immutability                                     │ │
│  │ • Current password required for password change            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 5: Database Constraints                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • UNIQUE constraints on username and email                 │ │
│  │ • Foreign key CASCADE on user deletion                     │ │
│  │ • NOT NULL on critical fields                              │ │
│  │ • Auto-updating timestamps                                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Making a User Admin

```
Admin Dashboard UI → AuthService → Backend API → Database
                                                    │
1. Click "Make Admin"                               │
   └─> adminUI.showAdminDashboard()                 │
                                                    │
2. Confirm dialog                                   │
   └─> authService.makeAdmin(userId)                │
                                                    │
3. POST /admin/users/:id/make-admin                 │
   └─> Authorization: Bearer <token>                │
                                                    │
4. authMiddleware verifies JWT ────────────────────►│
                                                    │
5. adminMiddleware checks is_admin ────────────────►│
   SELECT is_admin FROM users WHERE id = <from_jwt> │
                                                    │
6. If admin, execute: ─────────────────────────────►│
   UPDATE users SET is_admin = true WHERE id = :id  │
                                                    │
7. Return success ◄─────────────────────────────────┤
                                                    
8. Show success message
   └─> "User is now an administrator"
   
9. Refresh table
   └─> Call getUsers() again
   └─> Re-render table with updated data
```

## Storage Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Storage                            │
│                         (localStorage)                           │
├─────────────────────────────────────────────────────────────────┤
│  auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."          │
│  auth_user: {                                                    │
│    "id": 1,                                                      │
│    "username": "admin",                                          │
│    "email": "admin@example.com",                                 │
│    "isAdmin": true                                               │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Server Storage                            │
│                    (PostgreSQL Database)                         │
├─────────────────────────────────────────────────────────────────┤
│  users table:                                                    │
│    • Credentials (username, email, password_hash)                │
│    • Permissions (is_admin)                                      │
│    • Metadata (created_at, updated_at)                           │
│                                                                  │
│  dashboards table:                                               │
│    • Foreign key to user                                         │
│    • JSONB dashboard state                                       │
│    • Timestamps                                                  │
│                                                                  │
│  Volume: postgres_data (persistent)                              │
└─────────────────────────────────────────────────────────────────┘
```
