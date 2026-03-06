# Google Calendar Plugin

Google Calendar API proxy — fetches upcoming events using a stored API key and calendar ID.

## Routes

### `GET /api/google-calendar/events`

Fetch upcoming calendar events.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `credentialId` | number | query | Yes | — | Credential containing `calendar_id` and `api_key` |
| `timeMin` | string | query | No | now | ISO 8601 start time |
| `timeMax` | string | query | No | — | ISO 8601 end time |
| `maxResults` | string | query | No | `10` | Maximum events to return |

**Authentication:** Required (JWT).

**Response:** Array of calendar events ordered by start time (single events mode).

## Credential Setup

Store a credential in Credential Manager with:
- **Service type:** `google-calendar`
- **Fields:**
  - `calendar_id` — Google Calendar ID (found in calendar settings)
  - `api_key` — Google Cloud API key with Calendar API enabled

## Notes

- Uses Google Calendar API v3
- Returns events ordered by `startTime`
- HTTP error status codes from Google are passed through in the response
