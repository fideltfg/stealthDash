# UniFi Plugin

UniFi Controller API proxy — supports both Cloud (Site Manager) and legacy self-hosted controllers.

## Routes

### `GET /api/unifi/sites`

List available UniFi sites (Cloud API only).

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `credentialId` | number | query | Yes | Credential with `apiKey` and `service_type: unifi_api` |

**Authentication:** Required (JWT + credential).

**Response:**
```json
{
  "sites": [
    {
      "siteId": "...",
      "name": "Default",
      "desc": "My Network",
      "isOwner": true,
      "gateway": "UDM-Pro",
      "totalDevices": 12,
      "totalClients": 45
    }
  ]
}
```

### `GET /api/unifi/stats`

Fetch comprehensive network statistics.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `credentialId` | number | query | Yes | — | Credential for auth |
| `site` | string | query | No | `default` | UniFi site name (legacy only) |

**Authentication:** Required (JWT + credential).

**Response:** Stats object including:
- `devices` — Array of network devices with type, model, status, IP, MAC, firmware, CPU, memory, uplink info, traffic stats
- `clients` — Array of connected clients with hostname, IP, MAC, signal, RSSI, channel, connected AP
- `alarms` — Recent alarms (max 10)
- `traffic` — WAN throughput (rx/tx bytes)
- `wan` — WAN IP, gateway, nameservers, ISP info, uptime
- `uptimePercentage` — ISP uptime percentage (Cloud API only)

## Authentication Modes

The plugin auto-detects the auth mode from the credential's `service_type`:

### Cloud API (`service_type: unifi_api`)
- Uses `X-API-Key` header with the credential's `apiKey` field
- Endpoints: `/v1/sites`, `/v1/devices`, `/v1/hosts`, `/v1/isp-metrics/5m?duration=24h`
- Provides ISP metrics, uptime percentages, WAN stats

### Legacy Self-Hosted (`service_type: unifi` or default)
- Cookie-based authentication via `POST /api/login`
- Endpoints: `/api/s/{site}/stat/health`, `/api/s/{site}/stat/device`, `/api/s/{site}/stat/sta`, `/api/s/{site}/stat/alarm`
- Session cached for 30 minutes

## Session Caching (Legacy only)

- **TTL:** 30 minutes
- Cookie-based sessions are cached per host/credential
- Automatically cleared on 401 errors

## Credential Setup

### For Cloud API (UniFi Site Manager)
Store a credential with:
- **Service type:** `unifi_api`
- **Fields:** `apiKey` — API key from the UniFi Site Manager

### For Legacy Self-Hosted Controller
Store a credential with:
- **Service type:** `unifi`
- **Fields:** `username`, `password` — local controller admin account
- **Host:** Controller URL (e.g., `https://unifi.local:8443`)

## Notes

- Self-signed certificates accepted for legacy controllers (`rejectUnauthorized: false`)
- Device type is mapped from UniFi model shortnames/names
- Client data includes signal quality indicators (RSSI, channel, connected AP)
- ISP metrics from Cloud API are optional — continues if this endpoint fails
