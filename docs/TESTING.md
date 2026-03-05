# Testing Guide

Testing documentation for the StealthDash backend (ping-server). The test suite covers all API routes, plugin endpoints, and security vulnerabilities using Jest.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Suites](#test-suites)
- [Security Tests](#security-tests)
- [Test Reports](#test-reports)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Overview

The test suite validates the entire ping-server API surface:

| Category | Tests | Description |
|----------|-------|-------------|
| **Authentication** | 28 | Register, login, token verification, password recovery |
| **Dashboard** | 19 | Save, load, versioning, public sharing, deletion |
| **User Management** | 12 | Profile retrieval, password changes, profile updates |
| **Admin** | 22 | User CRUD, admin promotion, stats, access control |
| **Credentials** | 17 | Encrypted credential CRUD, IDOR protection |
| **Plugins** | 48 | All 17 plugin endpoints (ping, proxy, docker, etc.) |
| **Security** | 56 | SQL injection, XSS, auth bypass, SSRF, and more |
| **Total** | **202** | |

### Technology

- **Framework**: [Jest 29.7.0](https://jestjs.io/)
- **Runtime**: Node.js 20 (inside Docker container)
- **Database**: PostgreSQL 15 (shared test/dev instance with isolated test data)
- **Reports**: Custom HTML reporter + JSON output

---

## Quick Start

Tests run inside the Docker container against the live ping-server. The containers must be running:

```bash
# Start the stack (if not already running)
docker compose up -d

# Run all tests
make test

# Run and view report location
make test-report
```

---

## Test Structure

```
ping-server/
├── jest.config.js                    # Jest configuration
├── tests/
│   ├── helpers.js                    # Shared test utilities & API client
│   ├── run-tests.sh                  # Shell script runner
│   ├── setup/
│   │   ├── global-setup.js           # DB readiness check & cleanup
│   │   └── global-teardown.js        # Post-run cleanup
│   ├── reporters/
│   │   └── html-reporter.js          # Custom HTML + JSON reporter
│   ├── routes/
│   │   ├── auth.test.js              # Authentication endpoints
│   │   ├── dashboard.test.js         # Dashboard CRUD endpoints
│   │   ├── user.test.js              # User profile endpoints
│   │   ├── admin.test.js             # Admin management endpoints
│   │   ├── credentials.test.js       # Credential vault endpoints
│   │   └── plugins.test.js           # All 17 plugin endpoints
│   └── security/
│       └── security.test.js          # Security vulnerability tests
├── test-reports/                     # Generated reports (git-ignored)
│   ├── latest-report.html            # Most recent HTML report
│   ├── test-report-<timestamp>.html  # Timestamped HTML reports
│   └── test-results.json             # Machine-readable JSON results
└── coverage/                         # Code coverage output
```

### Test Data Isolation

Tests use isolated data that does not interfere with your development database:

- **Test users**: Prefixed with `test_` (e.g., `test_auth_user_<timestamp>`)
- **Test tasks**: Prefixed with `TEST_`
- **Test credentials**: Created and deleted within each test suite
- **Global setup**: Cleans stale test data before each run
- **Global teardown**: Removes all test artifacts after the run completes

---

## Running Tests

### Makefile Commands

```bash
make test             # Run all tests (routes + security) with verbose output
make test-routes      # Run only route/API tests
make test-security    # Run only security vulnerability tests
make test-report      # Run all tests and print report file location
```

### Docker Compose (Direct)

```bash
# All tests
docker compose exec ping-server npx jest --config jest.config.js --verbose --forceExit

# Specific suite
docker compose exec ping-server npx jest --config jest.config.js tests/routes/auth.test.js --verbose --forceExit

# Security only
docker compose exec ping-server npx jest --config jest.config.js tests/security --verbose --forceExit

# Watch mode (re-runs on file changes)
docker compose exec ping-server npx jest --config jest.config.js --watch
```

### Shell Script (Inside Container)

```bash
docker compose exec ping-server sh -c "cd /app && sh tests/run-tests.sh"
docker compose exec ping-server sh -c "cd /app && sh tests/run-tests.sh security"
docker compose exec ping-server sh -c "cd /app && sh tests/run-tests.sh routes"
docker compose exec ping-server sh -c "cd /app && sh tests/run-tests.sh --watch"
```

---

## Test Suites

### Authentication (`tests/routes/auth.test.js`)

Tests the complete authentication lifecycle:

| Group | Tests | What it covers |
|-------|-------|----------------|
| **POST /auth/register** | 7 | Successful registration (201), duplicate username/email rejection, missing field validation |
| **POST /auth/login** | 5 | Successful login with JWT return, wrong password, non-existent user, missing fields |
| **GET /auth/verify** | 5 | Valid token verification, expired token, invalid token, missing header |
| **Password Recovery** | 11 | Request reset, verify token, reset password, invalid/expired tokens, full flow |

### Dashboard (`tests/routes/dashboard.test.js`)

Tests dashboard persistence and sharing:

| Group | Tests | What it covers |
|-------|-------|----------------|
| **POST /dashboard/save** | 3 | Save dashboard state, authentication required |
| **GET /dashboard/load** | 3 | Load saved state, empty state for new users |
| **POST /dashboard/save-single** | 3 | Save individual dashboard, auth required |
| **Versioning** | 4 | GET /dashboard/version, GET /dashboard/versions |
| **Public Sharing** | 3 | Toggle public flag, access public dashboards |
| **DELETE /dashboard** | 3 | Delete dashboard, auth required |

### User Management (`tests/routes/user.test.js`)

Tests user profile operations:

| Group | Tests | What it covers |
|-------|-------|----------------|
| **GET /user/profile** | 3 | Profile retrieval, auth enforcement |
| **POST /user/change-password** | 6 | Valid change, wrong current password, weak password, missing fields |
| **POST /user/update-profile** | 3 | Email update, auth enforcement |

### Admin (`tests/routes/admin.test.js`)

Tests admin-only operations:

| Group | Tests | What it covers |
|-------|-------|----------------|
| **GET /admin/stats** | 3 | System statistics, admin-only access, auth enforcement |
| **GET /admin/users** | 3 | User listing, admin access control |
| **POST /admin/users** | 3 | User creation by admin, validation |
| **Admin Promotion** | 4 | make-admin, remove-admin, non-admin rejection |
| **Password Reset** | 3 | Admin resets user password, access control |
| **DELETE /admin/users/:id** | 3 | User deletion, admin restriction, self-delete prevention |
| **Role Enforcement** | 3 | All endpoints block non-admin users with 403 |

### Credentials (`tests/routes/credentials.test.js`)

Tests the encrypted credential vault:

| Group | Tests | What it covers |
|-------|-------|----------------|
| **POST /user/credentials** | 4 | Create credential (201), validation, auth |
| **GET /user/credentials** | 3 | List credentials, auth enforcement |
| **PUT /user/credentials/:id** | 3 | Update credential, not-found handling |
| **DELETE /user/credentials/:id** | 3 | Delete credential, auth enforcement |
| **IDOR Protection** | 4 | Cannot access/modify other users' credentials |

### Plugins (`tests/routes/plugins.test.js`)

Tests all 17 backend plugins:

| Plugin | Endpoints Tested |
|--------|-----------------|
| **ping** | GET /ping/:target, POST /ping-batch |
| **proxy** | GET /proxy, GET /embed-proxy |
| **crypto** | GET /api/crypto |
| **docker** | POST /api/docker/containers (and start/stop/restart/logs) |
| **tasks** | GET/POST/PUT/DELETE /api/tasks |
| **glances** | GET /api/glances |
| **gmail** | GET /api/gmail/messages |
| **google-calendar** | GET /api/google-calendar/events |
| **home-assistant** | POST /home-assistant/states, POST /home-assistant/service |
| **modbus** | GET /modbus/read |
| **pihole** | GET /api/pihole |
| **sensi** | POST /sensi/state (and set-temperature, set-mode, set-fan) |
| **snmp** | GET /snmp/get |
| **speedtest** | GET /api/speedtest |
| **todoist** | GET /api/todoist/tasks, POST /api/todoist/close |
| **unifi** | GET /api/unifi/stats, GET /api/unifi/sites |
| **unifi-protect** | GET /api/unifi-protect/bootstrap, sensors, camera snapshot |

---

## Security Tests

The security suite (`tests/security/security.test.js`) tests for 14 categories of vulnerabilities across **56 tests**:

### Categories

| Category | Tests | What it tests |
|----------|-------|---------------|
| **SQL Injection** | 6 | Login, register, and query parameter injection attempts |
| **XSS (Cross-Site Scripting)** | 3 | Script injection in registration and profile fields |
| **Authentication Bypass** | 9 | Missing tokens, malformed tokens, expired tokens, algorithm manipulation |
| **Privilege Escalation** | 3 | Non-admin accessing admin endpoints, self-promotion attempts |
| **IDOR** | 4 | Accessing other users' dashboards and credentials |
| **HTTP Security Headers** | 3 | Content-Type, X-Powered-By exposure, CORS configuration |
| **Data Leakage** | 6 | Password hashes in responses, error message information disclosure |
| **Input Validation** | 6 | Oversized payloads, special characters, boundary values |
| **SSRF** | 2 | File protocol access via proxy endpoints |
| **Prototype Pollution** | 2 | `__proto__` and constructor injection in JSON bodies |
| **JWT Security** | 4 | Algorithm confusion, token reuse, field tampering |
| **Path Traversal** | 2 | Directory traversal in URL parameters |
| **Denial of Service** | 3 | Rapid request floods and oversized batch operations |
| **Default Credentials** | 3 | Known default username/password combinations |

### Security Findings

The test suite documents the following findings for awareness:

| Finding | Severity | Details |
|---------|----------|---------|
| X-Powered-By Header | Low | Express version exposed in response headers |
| CORS Configuration | Medium | `Access-Control-Allow-Origin: *` allows any origin |
| No Email Validation | Low | Server accepts malformed email addresses |
| Default Secrets | Critical | Default JWT secret and encryption key should be changed in production |

> **Note**: These findings are logged in the HTML report's security warnings section. See [DEPLOYMENT.md](./DEPLOYMENT.md#security-hardening) for production hardening steps.

---

## Test Reports

### HTML Report

After running tests, an HTML report is generated with:

- Summary dashboard (pass/fail counts, duration)
- Expandable test suite details with individual test results
- Security warnings section highlighting findings
- Dark-themed UI matching StealthDash aesthetics

**Location**: `ping-server/test-reports/latest-report.html`

Timestamped reports are also saved as `test-report-<ISO-timestamp>.html` for historical comparison.

### JSON Report

Machine-readable results at `ping-server/test-reports/test-results.json` containing:

```json
{
  "success": true,
  "numPassedTestSuites": 7,
  "numFailedTestSuites": 0,
  "numTotalTests": 202,
  "numPassedTests": 202,
  "numFailedTests": 0,
  "testResults": [ ... ],
  "securityWarnings": [ ... ]
}
```

### Accessing Reports

Reports are volume-mounted to the host filesystem:

```bash
# View on the host
open ping-server/test-reports/latest-report.html    # macOS
xdg-open ping-server/test-reports/latest-report.html # Linux

# Or copy from the container manually
docker compose cp ping-server:/app/test-reports/latest-report.html .
```

### Code Coverage

Jest also generates coverage reports in `ping-server/coverage/`:

```bash
# View coverage summary in terminal (printed after test run)
# Or open HTML coverage report
open ping-server/coverage/index.html
```

---

## Writing New Tests

### Adding a Route Test

1. Create or edit a file in `ping-server/tests/routes/`:

```javascript
const { get, post, createTestUser, cleanupTestUser, generateTestToken } = require('../helpers');

describe('My New Route', () => {
  let testUser, token;

  beforeAll(async () => {
    testUser = await createTestUser('test_myroute');
    token = generateTestToken(testUser);
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.id);
  });

  test('GET /my-route returns data', async () => {
    const res = await get('/my-route', token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  test('requires authentication', async () => {
    const res = await get('/my-route');
    expect(res.status).toBe(401);
  });
});
```

### Adding a Security Test

Add a new `describe` block in `tests/security/security.test.js`:

```javascript
describe('My Security Category', () => {
  test('should prevent attack vector', async () => {
    const res = await post('/endpoint', { malicious: 'payload' }, token);
    expect(res.status).not.toBe(200);
  });
});
```

### Test Helper Functions

The `tests/helpers.js` module provides:

| Function | Description |
|----------|-------------|
| `generateTestToken(user)` | Create a valid JWT for the given user |
| `generateExpiredToken(user)` | Create an expired JWT |
| `generateInvalidToken()` | Create a token signed with the wrong key |
| `createTestUser(prefix)` | Insert a test user into the database, returns user object |
| `getAdminUser()` | Get or create an admin test user |
| `cleanupTestUser(id)` | Remove a test user and their data from the database |
| `request(method, path, body, token)` | Make an HTTP request to the ping-server |
| `get(path, token)` | Shorthand GET request |
| `post(path, body, token)` | Shorthand POST request |
| `put(path, body, token)` | Shorthand PUT request |
| `del(path, token)` | Shorthand DELETE request |

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start services
        run: docker compose up -d --build

      - name: Wait for services
        run: |
          echo "Waiting for ping-server..."
          for i in $(seq 1 30); do
            curl -s http://localhost:3001/health && break
            sleep 2
          done

      - name: Run tests
        run: docker compose exec -T ping-server npx jest --config jest.config.js --forceExit --ci

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: ping-server/test-reports/

      - name: Stop services
        if: always()
        run: docker compose down -v
```

### GitLab CI Example

```yaml
test:
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker compose up -d --build
    - sleep 15
    - docker compose exec -T ping-server npx jest --config jest.config.js --forceExit --ci
  artifacts:
    when: always
    paths:
      - ping-server/test-reports/
```

---

## Troubleshooting

### Tests Fail to Connect

```bash
# Verify containers are running
docker compose ps

# Check ping-server is healthy
curl http://localhost:3001/health

# Check database is ready
docker compose exec postgres pg_isready -U dashboard
```

### Timeout Errors

Increase the Jest timeout in `jest.config.js`:

```javascript
testTimeout: 60000,  // 60 seconds (default is 30s)
```

Or for a single test:

```javascript
test('slow operation', async () => {
  // ...
}, 60000);
```

### Stale Test Data

If tests fail due to leftover data from a previous run:

```bash
# Clean test data manually
docker compose exec postgres psql -U dashboard -d dashboard -c \
  "DELETE FROM users WHERE username LIKE 'test_%';"
```

### Running a Single Test File

```bash
docker compose exec ping-server npx jest --config jest.config.js \
  tests/routes/auth.test.js --verbose --forceExit
```

### Running Tests Matching a Pattern

```bash
docker compose exec ping-server npx jest --config jest.config.js \
  -t "should register" --verbose --forceExit
```

---

## Configuration Reference

### jest.config.js

| Setting | Value | Description |
|---------|-------|-------------|
| `testEnvironment` | `node` | Node.js test environment |
| `testMatch` | `**/tests/**/*.test.js` | Test file glob pattern |
| `collectCoverage` | `true` | Enable code coverage |
| `testTimeout` | `30000` | 30-second default timeout |
| `forceExit` | `true` | Force Jest to exit after tests complete |
| `detectOpenHandles` | `true` | Warn about open handles preventing exit |
| `reporters` | `default`, `html-reporter` | Terminal + HTML report output |
| `globalSetup` | `global-setup.js` | Pre-run DB readiness and cleanup |
| `globalTeardown` | `global-teardown.js` | Post-run test data cleanup |

---

**Last Updated:** March 2026
