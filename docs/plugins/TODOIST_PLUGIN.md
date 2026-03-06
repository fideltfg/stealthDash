# Todoist Plugin

Todoist REST API proxy for task management.

## Routes

### `GET /api/todoist/tasks`

Fetch tasks from Todoist.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `credentialId` | number | query | Yes | Credential containing `api_token` |
| `filter` | string | query | No | Todoist filter expression (e.g., `today`, `overdue`) |

**Response:** Array of Todoist task objects.

### `POST /api/todoist/close`

Mark a Todoist task as complete.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `credentialId` | number | query | Yes | Credential containing `api_token` |
| `taskId` | string | query | Yes | Todoist task ID to complete |

**Response:**
```json
{ "success": true }
```

## Authentication

Requires a `credentialId` referencing a stored credential with an `api_token` field (Todoist API token).

## Credential Setup

1. Go to [todoist.com/app/settings/integrations](https://todoist.com/app/settings/integrations)
2. Copy your API token
3. Store in Credential Manager with service type `todoist` and field `api_token`

## Notes

- Uses Todoist REST API v2
- 10-second request timeout
- Bearer token authentication with Todoist
