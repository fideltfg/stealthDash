# Ping Server

Backend service for the Dashboard that provides network monitoring, API proxying, and authentication services.

## What It Does

The ping server acts as a backend proxy to enable dashboard widgets to:
- **Ping network devices** - Real ICMP ping for uptime monitoring
- **Proxy external APIs** - Bypass CORS restrictions when fetching data from external services
- **Authenticate with third-party services** - Handle Pi-hole, UniFi Controller, and other API authentications with session caching
- **Query network devices** - SNMP and Modbus-RTU device monitoring
- **Manage user accounts** - PostgreSQL-backed authentication and dashboard persistence

## Key Features

- **Network Monitoring**: ICMP ping, batch ping operations
- **API Proxying**: Pi-hole, UniFi Controller, generic HTTP proxy
- **Authentication**: JWT-based user authentication, password recovery
- **Session Caching**: Reduces API calls to rate-limited services (Pi-hole, UniFi)
- **Device Protocols**: SNMP queries, Modbus-RTU for industrial devices
- **Database**: PostgreSQL integration for user and dashboard storage

## API Endpoints

### Health & Network

- **GET /health** - Service health check
- **GET /ping/:target** - Ping a single IP or hostname
  - Query params: `timeout` (seconds, default: 5)
- **POST /ping-batch** - Ping multiple targets simultaneously
  - Body: `{ "targets": ["host1", "host2"], "timeout": 5 }`

### Authentication

- **POST /auth/login** - User login
  - Body: `{ "username": "user", "password": "pass" }`
  - Returns: JWT token
- **POST /auth/register** - Create new user account
- **POST /auth/request-password-reset** - Request password reset email/token
- **POST /auth/reset-password** - Reset password with token
- **POST /auth/verify-reset-token** - Verify password reset token validity

### Dashboard Management

- **GET /dashboard/load** - Load user's dashboard configuration (requires auth)
- **POST /dashboard/save** - Save dashboard configuration (requires auth)
- **GET /dashboard/list** - List all user dashboards (requires auth)
- **POST /dashboard/create** - Create new dashboard (requires auth)
- **PUT /dashboard/:id/rename** - Rename dashboard (requires auth)
- **DELETE /dashboard/:id** - Delete dashboard (requires auth)
- **PUT /dashboard/:id/reorder** - Reorder dashboards (requires auth)
- **POST /dashboard/:id/duplicate** - Duplicate dashboard (requires auth)
- **PUT /dashboard/:id/public** - Toggle public sharing (requires auth)

### User Management

- **GET /user/profile** - Get current user profile (requires auth)
- **POST /user/change-password** - Change password (requires auth)
  - Body: `{ currentPassword, newPassword }`
- **POST /user/update-profile** - Update user profile (requires auth)
  - Body: `{ email, display_name }`

### Credentials Management

- **GET /user/credentials** - List user's stored credentials (requires auth)
- **POST /user/credentials** - Create new credential (requires auth)
  - Body: `{ name, service_type, data }`
- **PUT /user/credentials/:id** - Update credential (requires auth)
- **DELETE /user/credentials/:id** - Delete credential (requires auth)

### Admin API

- **GET /admin/users** - List all users (requires admin)
- **POST /admin/users** - Create new user (requires admin)
- **POST /admin/users/:userId/make-admin** - Grant admin privileges (requires admin)
- **POST /admin/users/:userId/remove-admin** - Revoke admin privileges (requires admin)
- **POST /admin/users/:userId/reset-password** - Reset user password (requires admin)
- **DELETE /admin/users/:userId** - Delete user (requires admin)
- **GET /admin/stats** - Get system statistics (requires admin)

### Widget API Proxies

- **GET /api/pihole** - Pi-hole API proxy
  - Query params: `host`, `credentialId`
  - Caches authentication session (5 min)
  - Returns Pi-hole statistics

- **GET /api/unifi/stats** - UniFi Controller proxy
  - Query params: `credentialId`, `site`
  - Caches authentication session (30 min)
  - Returns comprehensive network stats (devices, clients, alarms)

- **GET /api/unifi/sites** - List UniFi sites
  - Query params: `credentialId`
  - Returns available UniFi sites

- **GET /api/unifi-protect/bootstrap** - UniFi Protect bootstrap data
  - Query params: `host`, `credentialId`
  - Returns cameras, sensors, and events

- **GET /api/unifi-protect/sensors** - UniFi Environmental Sensors (public)
  - Query params: `host`
  - No authentication required (uses first available credential)
  - Returns temperature, humidity, light data

- **GET /api/unifi-protect/camera/:cameraId/snapshot** - Camera snapshot
  - Query params: `host`, `credentialId`
  - Returns camera image

- **GET /api/google-calendar/events** - Google Calendar events
  - Query params: `credentialId`, `timeMin`, `timeMax`, `maxResults`
  - Returns upcoming calendar events

- **GET /api/glances** - Glances system monitoring data
  - Query params: `host`, `credentialId`
  - Returns CPU, memory, disk, network stats

- **GET /api/todoist/tasks** - Todoist tasks
  - Query params: `credentialId`, `filter`
  - Returns task list

- **POST /api/todoist/close** - Complete Todoist task
  - Query params: `credentialId`, `taskId`
  - Marks task as complete

- **GET /api/speedtest** - Speedtest Tracker results
  - Query params: `host`, `credentialId`, `days`
  - Returns speed test data with history

- **POST /home-assistant/states** - Home Assistant entity states
  - Body: `{ credentialId, entityIds }`
  - Returns entity state data

- **POST /home-assistant/service** - Call Home Assistant service
  - Body: `{ credentialId, domain, service, entityId, data }`
  - Executes Home Assistant service call

- **GET /embed-proxy** - Embed proxy for X-Frame-Options bypass
  - Query param: `url`
  - Returns proxied page content

- **GET /proxy** - Generic HTTP/HTTPS proxy
  - Query param: `url` (target URL)
  - Handles SSL, useful for XML feeds and external APIs

### Sensi Thermostat API

- **POST /sensi/state** - Get thermostat state
  - Body: `{ credentialId }`
  - Returns current temperature, setpoints, mode

- **POST /sensi/set-temperature** - Set target temperature
  - Body: `{ credentialId, heat, cool }`
  - Updates thermostat setpoints

- **POST /sensi/set-mode** - Change HVAC mode
  - Body: `{ credentialId, mode }`
  - Sets mode (heat, cool, auto, off)

- **POST /sensi/set-fan** - Control fan
  - Body: `{ credentialId, mode }`
  - Sets fan mode (auto, on)

### Docker Management API

- **POST /api/docker/containers** - List Docker containers
  - Body: `{ host, credentialId, showAll }`
  - Returns container list with status

- **POST /api/docker/containers/start** - Start container
  - Body: `{ host, credentialId, containerId }`
  - Starts stopped container

- **POST /api/docker/containers/stop** - Stop container
  - Body: `{ host, credentialId, containerId }`
  - Stops running container

- **POST /api/docker/containers/restart** - Restart container
  - Body: `{ host, credentialId, containerId }`
  - Restarts container

- **POST /api/docker/containers/logs** - Get container logs
  - Body: `{ host, credentialId, containerId, tail }`
  - Returns recent container logs

### Device Monitoring

- **GET /snmp/get** - Query SNMP-enabled devices
  - Query params: `host`, `oids`, `community`, `version`
  - Returns: SNMP query results
  
- **GET /modbus/read** - Query Modbus TCP devices
  - Query params: `host`, `port`, `address`, `count`, `type`, `unitId`
  - Returns: Modbus register values

## Testing

The ping-server has a comprehensive test suite built with Jest that covers all routes, plugins, and security:

```bash
# Run all tests (from project root)
make test

# Run specific categories
make test-routes      # Route and API tests only
make test-security    # Security vulnerability tests only

# Run directly via Docker
docker compose exec ping-server npx jest --config jest.config.js --verbose --forceExit

# Run a single test file
docker compose exec ping-server npx jest --config jest.config.js tests/routes/auth.test.js --verbose --forceExit
```

### Test Structure

```
tests/
├── helpers.js              # Shared test utilities & API client
├── run-tests.sh            # Shell script test runner
├── setup/                  # Global setup (DB readiness) & teardown (cleanup)
├── reporters/              # Custom HTML + JSON reporter
├── routes/                 # Route tests
│   ├── auth.test.js        # Authentication (28 tests)
│   ├── dashboard.test.js   # Dashboard CRUD (19 tests)
│   ├── user.test.js        # User profile (12 tests)
│   ├── admin.test.js       # Admin management (22 tests)
│   ├── credentials.test.js # Credential vault (17 tests)
│   └── plugins.test.js     # All 17 plugins (48 tests)
└── security/
    └── security.test.js    # Security vulnerabilities (56 tests)
```

Reports are generated to `test-reports/latest-report.html` (HTML) and `test-reports/test-results.json` (JSON).

See [TESTING.md](../docs/TESTING.md) for the full testing documentation.

## Implementation

### With Docker Compose (Recommended)

The ping-server runs automatically as part of the dashboard stack:

```bash
cd Dashboard
docker compose up -d
```

Access at: `http://localhost:3001`

### Standalone Development

```bash
cd ping-server
npm install
npm start
```

### Environment Variables

```bash
PING_SERVER_PORT=3001          # Server port
DATABASE_URL=postgresql://...   # PostgreSQL connection string
JWT_SECRET=your-secret-key      # JWT signing key
SMTP_HOST=smtp.gmail.com        # Email server (optional)
SMTP_USER=your-email            # Email account (optional)
SMTP_PASS=your-password         # Email password (optional)
```

## Session Caching

To reduce load on external APIs and avoid rate limiting:

- **Pi-hole sessions**: Cached for 5 minutes
- **UniFi sessions**: Cached for 30 minutes

Sessions are automatically refreshed when expired.

## Security Notes

- Handles self-signed certificates for local UniFi Controllers
- Passwords are hashed with bcrypt
- JWT tokens for stateless authentication
- CORS enabled for dashboard origin
- Session caching uses in-memory storage (cleared on restart)

## Database Schema

PostgreSQL tables:
- `users` - User accounts with hashed passwords
- `dashboards` - User dashboard configurations (JSON)
- `credentials` - AES-encrypted credential storage
- `tasks` - Task management data
- Password reset tokens with expiration

---

**Part of the StealthDash monitoring system**
