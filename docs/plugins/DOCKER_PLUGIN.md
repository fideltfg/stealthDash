# Docker Plugin

Docker container management API — list, start, stop, restart, and view logs.

## Routes

All routes require authentication.

### `POST /api/docker/containers`

List Docker containers on a host.

**Body:**
```json
{
  "host": "unix:///var/run/docker.sock",
  "credentialId": 1,
  "all": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | Yes | Docker host URL (`unix://` socket or `http://`/`https://` remote) |
| `credentialId` | number | No | Credential for TLS-secured remote Docker hosts |
| `all` | boolean | No | Show all containers (including stopped). Default: running only |

**Response:** Array of containers with name, status, image, ports, state.

### `POST /api/docker/containers/start`

Start a stopped container.

**Body:**
```json
{ "host": "unix:///var/run/docker.sock", "credentialId": 1, "containerId": "abc123" }
```

### `POST /api/docker/containers/stop`

Stop a running container.

**Body:** Same format as start.

### `POST /api/docker/containers/restart`

Restart a container.

**Body:** Same format as start.

### `POST /api/docker/containers/logs`

Fetch recent container logs.

**Body:**
```json
{
  "host": "unix:///var/run/docker.sock",
  "credentialId": 1,
  "containerId": "abc123",
  "tail": 500
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tail` | number | No | 500 | Number of log lines to return |

**Response:** Plain text container logs.

## Authentication

All routes require a valid JWT token (authenticated user).

## Credential Setup

For remote Docker hosts with TLS:
1. Store credential in Credential Manager with service type `docker`
2. Include `host`, `ca`, `cert`, `key` fields for TLS client authentication

For local Docker socket:
- No credential needed — uses the mounted Docker socket directly
- Requires Docker socket volume mount in `docker-compose.yml`

## Notes

- Supports both Unix socket (`unix:///var/run/docker.sock`) and remote HTTP/HTTPS connections
- Handles self-signed certificates via credential-based TLS
