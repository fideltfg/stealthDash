# Ping Server

Backend service for the Dashboard that provides network monitoring, API proxying, and authentication services.

## What It Does

The ping server acts as a backend proxy to enable dashboard widgets to:
- **Ping network devices** - Real ICMP ping for uptime monitoring
- **Proxy external APIs** - Bypass CORS restrictions when fetching data from external services
- **Authenticate with third-party services** - Handle Pi-hole, UniFi Controller, and other API authentications with session caching
- **Query network devices** - SNMP and Modbus TCP device monitoring
- **Manage user accounts** - PostgreSQL-backed authentication and dashboard persistence

## Key Features

- **Network Monitoring**: ICMP ping, batch ping operations
- **API Proxying**: Pi-hole, UniFi Controller, CoinGecko, Speedtest, generic HTTP proxy
- **Authentication**: JWT-based user authentication, password recovery
- **Session Caching**: Reduces API calls to rate-limited services (Pi-hole, UniFi)
- **Device Protocols**: SNMP queries, Modbus TCP for industrial devices
- **Database**: PostgreSQL integration for user, dashboard, credential, and task storage
- **Plugin System**: 17 auto-loaded backend plugins (see [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md))
- **Credential Vault**: AES-encrypted storage for API keys, passwords, and tokens

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

### Plugin API Endpoints

Widget backends are provided by 17 auto-loaded plugins. Each plugin has its own documentation with full route details, parameters, and setup instructions.

| Plugin | Mount Path | Description | Documentation |
|--------|-----------|-------------|---------------|
| **Ping** | `/health`, `/ping` | Health check and ICMP ping | [Ping Plugin](plugins/PING_PLUGIN.md) |
| **Proxy** | `/embed-proxy`, `/proxy` | CORS bypass and embed proxy | [Proxy Plugin](plugins/PROXY_PLUGIN.md) |
| **Crypto** | `/api/crypto` | CoinGecko price data with caching | [Crypto Plugin](plugins/CRYPTO_PLUGIN.md) |
| **Docker** | `/api/docker` | Container management (list, start, stop, logs) | [Docker Plugin](plugins/DOCKER_PLUGIN.md) |
| **Glances** | `/api/glances` | System monitoring proxy | [Glances Plugin](plugins/GLANCES_PLUGIN.md) |
| **Gmail** | `/api/gmail` | OAuth2 flow, messages, labels | [Gmail Plugin](plugins/GMAIL_PLUGIN.md) |
| **Google Calendar** | `/api/google-calendar` | Calendar events proxy | [Google Calendar Plugin](plugins/GOOGLE_CALENDAR_PLUGIN.md) |
| **Home Assistant** | `/home-assistant` | Entity states and service calls | [Home Assistant Plugin](plugins/HOME_ASSISTANT_PLUGIN.md) |
| **Pi-hole** | `/api/pihole` | Pi-hole v6+ stats with session caching | [Pi-hole Plugin](plugins/PIHOLE_PLUGIN.md) |
| **Sensi** | `/sensi` | Thermostat control via Socket.IO | [Sensi Plugin](plugins/SENSI_PLUGIN.md) |
| **Speedtest** | `/api/speedtest` | Speedtest Tracker results proxy | [Speedtest Plugin](plugins/SPEEDTEST_PLUGIN.md) |
| **Tasks** | `/api/tasks` | Server-side task CRUD and stats | [Tasks Plugin](plugins/TASKS_PLUGIN.md) |
| **Todoist** | `/api/todoist` | Todoist task management proxy | [Todoist Plugin](plugins/TODOIST_PLUGIN.md) |
| **UniFi** | `/api/unifi` | Network controller (Cloud + Legacy) | [UniFi Plugin](plugins/UNIFI_PLUGIN.md) |
| **UniFi Protect** | `/api/unifi-protect` | Cameras, events, sensors | [UniFi Protect Plugin](plugins/UNIFI_PROTECT_PLUGIN.md) |
| **SNMP** | `/snmp` | SNMP device queries | [SNMP Plugin](plugins/SNMP_PLUGIN.md) |
| **Modbus** | `/modbus` | Modbus TCP register reads | [Modbus Plugin](plugins/MODBUS_PLUGIN.md) |

See [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md) for how to create custom plugins.

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
