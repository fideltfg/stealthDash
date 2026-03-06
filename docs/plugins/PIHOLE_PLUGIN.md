# Pi-hole Plugin

Pi-hole v6+ API proxy with session caching to avoid rate limiting.

## Routes

### `GET /api/pihole`

Fetch Pi-hole statistics/summary data.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `host` | string | query | Yes | Pi-hole URL (e.g., `http://192.168.1.1`) |
| `password` | string | query | No | Pi-hole admin password (direct) |
| `credentialId` | number | query | No | Credential containing `password` field |

One of `password` or `credentialId` is required.

**Response:** Pi-hole summary data including:
- Total queries (24h)
- Blocked queries (24h)
- Blocked percentage
- Domain blocklist count

## Authentication

Pi-hole v6+ requires password authentication. The plugin performs a two-step flow:
1. `POST /api/auth` on the Pi-hole to obtain a session ID
2. `GET /api/stats/summary` with the session ID

## Caching

- **Session TTL:** 5 minutes
- Cached sessions are reused to reduce load on Pi-hole
- Sessions are automatically cleared on 401 errors and re-authenticated

## Credential Setup

Store a credential in Credential Manager with:
- **Service type:** `pihole`
- **Fields:** `password` — Pi-hole admin password

## Notes

- Designed for Pi-hole v6+ API (uses `/api/auth` and `/api/stats/summary`)
- 5-second request timeout
- Self-signed certificates are accepted
