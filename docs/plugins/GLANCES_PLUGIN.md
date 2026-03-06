# Glances Plugin

System monitoring API proxy — fetches comprehensive system metrics from a Glances server.

## Routes

### `GET /api/glances`

Fetch all available system metrics from a Glances instance.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `host` | string | query | Yes | Glances server URL (e.g., `http://192.168.1.100:61208`) |
| `credentialId` | number | query | No | Credential containing a `password` for Basic Auth |

**Response:** Comprehensive system data object including:
- `cpu` — CPU usage percentage
- `mem` — Memory usage
- `swap` — Swap usage
- `load` — System load averages
- `fs` — Filesystem usage (system paths filtered out)
- `network` — Network interfaces (loopback filtered out)
- `system` — Hostname, OS info
- `uptime` — System uptime
- `percpu` — Per-core CPU usage
- `processcount` — Process statistics
- `diskio` — Disk I/O
- `quicklook` — Quick system overview
- `containers` — Docker container info
- `sensors` — Hardware sensors (temperature, fan speed)
- `gpu` — GPU metrics (if available)

## Authentication

Optional — use `credentialId` with a `password` field for Glances instances with Basic Auth enabled.

## Notes

- Auto-detects Glances API version (v4, v3, v2)
- Missing endpoints are handled gracefully — each metric endpoint is fetched independently
- Requires Glances running in web server mode (`glances -w`)
