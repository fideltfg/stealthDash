# UniFi Protect Plugin

UniFi Protect API proxy — cameras, snapshots, event thumbnails, and environmental sensors.

## Routes

### `GET /api/unifi-protect/bootstrap`

Fetch cameras, events, and sensors from a UniFi Protect console.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `host` | string | query | Yes | Protect console URL (e.g., `https://192.168.1.1`) |
| `credentialId` | number | query | Yes | Credential with `username` and `password` |

**Authentication:** Required (JWT + credential).

**Response:**
```json
{
  "cameras": [ { "id": "...", "name": "Front Door", "type": "camera", "state": "CONNECTED", ... } ],
  "events": [ { "id": "...", "type": "motion", "camera": "Front Door", "score": 85, ... } ],
  "sensors": [ { "id": "...", "name": "Office", "temperature": 72.5, "humidity": 45, "light": 320 } ]
}
```

- Events are limited to the last 24 hours
- 15-second request timeout

### `GET /api/unifi-protect/sensors`

Fetch environmental sensor data. **No authentication required** — this is a public endpoint.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `host` | string | query | No | Protect console URL (auto-discovers from stored credentials if omitted) |

**Response:**
```json
{
  "success": true,
  "timestamp": "2026-03-06T12:00:00.000Z",
  "host": "https://192.168.1.1",
  "sensorCount": 2,
  "sensors": [
    {
      "id": "...",
      "name": "Office Sensor",
      "temperature": { "value": 22.5, "unit": "C", "fahrenheit": 72.5 },
      "humidity": { "value": 45, "unit": "%" },
      "light": { "value": 320, "unit": "lux" }
    }
  ]
}
```

See [UNIFI_SENSOR_API.md](../UNIFI_SENSOR_API.md) for the full public API reference.

### `GET /api/unifi-protect/camera/:cameraId/snapshot`

Get a camera snapshot image.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `cameraId` | string | path | Yes | Camera ID |
| `host` | string | query | Yes | Protect console URL |
| `credentialId` | number | query | Yes | Credential with `username` and `password` |

**Authentication:** Required (JWT + credential).

**Response:** Binary JPEG image.

### `GET /api/unifi-protect/event/:eventId/thumbnail`

Get a detection event thumbnail image.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `eventId` | string | path | Yes | Event ID |
| `host` | string | query | Yes | Protect console URL |
| `credentialId` | number | query | Yes | Credential with `username` and `password` |

**Authentication:** Required (JWT + credential).

**Response:** Binary JPEG image.

## Session Caching

- **TTL:** 30 minutes
- Sessions are cached per host/credential combination (MD5 key)
- Automatically cleared on 401 errors and re-authenticated

## Credential Setup

Store a credential in Credential Manager with:
- **Service type:** `unifi-protect`
- **Fields:** `username`, `password` — local admin account on the Protect console

## Notes

- Self-signed certificates are accepted (`rejectUnauthorized: false`)
- Session uses cookie-based authentication after initial login
- Sensor endpoint auto-discovers credentials by searching for `unifi-protect`, `custom`, or `basic` service types
