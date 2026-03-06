# Speedtest Plugin

Proxy for Speedtest Tracker instances — fetches latest results and historical data.

## Routes

### `GET /api/speedtest`

Fetch the latest speed test result and history.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `host` | string | query | Yes | Speedtest Tracker URL (e.g., `http://192.168.1.100:8765`) |
| `credentialId` | number | query | No | Credential containing `api_token` for authenticated instances |
| `days` | number | query | No | Number of days of history to include |

**Response:**
```json
{
  "latest": {
    "download": 450.5,
    "upload": 22.3,
    "ping": 12.5,
    "jitter": 2.1,
    "server_name": "Server Name",
    "timestamp": "2026-03-06T12:00:00.000Z"
  },
  "history": [ ... ],
  "averages": {
    "download": 440.2,
    "upload": 21.8,
    "ping": 13.1
  }
}
```

## Authentication

Optional — use `credentialId` with an `api_token` field for Speedtest Tracker instances that have authentication enabled.

## Notes

- Fetches `/api/v1/results/latest` and `/api/v1/results?limit=50` from the target instance
- Normalizes data across different Speedtest Tracker versions
- History is optional — continues gracefully if the history endpoint fails
- Calculates rolling averages (download, upload, ping)
- History is returned oldest-first for chart rendering
