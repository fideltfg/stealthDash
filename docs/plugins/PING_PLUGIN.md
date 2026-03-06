# Ping & Health Plugin

Health check and network ping endpoints.

## Routes

### `GET /health`

Service health check.

**Response:**
```json
{ "status": "ok", "service": "ping-server" }
```

### `GET /ping/:target`

Ping a single IP or hostname using ICMP.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `target` | string | path | Yes | — | Hostname or IP address to ping |
| `timeout` | number | query | No | 5 | Timeout in seconds |

**Response:**
```json
{
  "target": "8.8.8.8",
  "success": true,
  "responseTime": 12.5,
  "totalTime": 15.3,
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

### `POST /ping-batch`

Ping multiple targets in parallel.

**Body:**
```json
{
  "targets": ["8.8.8.8", "1.1.1.1", "google.com"],
  "timeout": 5
}
```

**Response:**
```json
{
  "results": [
    { "target": "8.8.8.8", "success": true, "responseTime": 12.5 },
    { "target": "1.1.1.1", "success": true, "responseTime": 8.2 }
  ]
}
```

## Authentication

None required — all endpoints are public.

## Notes

- Uses native ICMP ping (requires `NET_RAW` capability in Docker)
- Timeouts configurable per request
- Batch endpoint runs pings in parallel
