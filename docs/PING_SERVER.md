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

- **POST /api/login** - User login
  - Body: `{ "username": "user", "password": "pass" }`
  - Returns: JWT token
- **POST /api/register** - Create new user account
- **POST /api/request-password-reset** - Request password reset email/token
- **POST /api/reset-password** - Reset password with token

### Dashboard Management

- **GET /api/dashboard** - Load user's dashboard configuration
- **POST /api/dashboard** - Save dashboard configuration
- **DELETE /api/dashboard** - Delete saved dashboard

### Widget API Proxies

- **GET /api/pihole** - Pi-hole API proxy
  - Query params: `host`, `password`, `site`
  - Caches authentication session (5 min)
  - Returns Pi-hole statistics

- **GET /api/unifi/stats** - UniFi Controller proxy
  - Query params: `host`, `username`, `password`, `site`
  - Caches authentication session (30 min)
  - Returns comprehensive network stats (devices, clients, alarms)

- **GET /proxy** - Generic HTTP/HTTPS proxy
  - Query param: `url` (target URL)
  - Handles SSL, useful for XML feeds and external APIs

### Device Monitoring

- **GET /api/snmp** - Query SNMP-enabled devices
  - Query params: `host`, `oid`, `community`, `version`
  
- **POST /api/modbus** - Query Modbus-RTU devices
  - Body: Device connection and register details

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
- Password reset tokens with expiration

---

**Part of the StealthDash monitoring system**
