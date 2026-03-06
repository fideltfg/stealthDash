# Gmail Plugin

Gmail OAuth2 integration — handles the full OAuth flow, token management, message listing, and label modification.

## Routes

### `GET /api/gmail/status`

Check if Gmail OAuth is configured on the server.

**Response:**
```json
{ "configured": true, "message": "Gmail API is configured" }
```

### `GET /api/gmail/auth`

Initiate the Google OAuth2 consent flow. Redirects the browser to Google's consent screen.

**Authentication:** Required (JWT).

### `GET /api/gmail/callback`

OAuth2 callback handler — Google redirects here after user consent.

| Parameter | Type | In | Description |
|-----------|------|-----|-------------|
| `code` | string | query | Authorization code from Google |
| `state` | string | query | Encoded user ID for associating the credential |
| `error` | string | query | Error message if consent was denied |

Stores the obtained tokens as an encrypted credential in the database.

### `GET /api/gmail/messages`

List Gmail messages.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `credentialId` | number | query | Yes | — | Gmail OAuth credential ID |
| `labelIds` | string | query | No | `INBOX` | Gmail label filter |
| `maxResults` | string | query | No | `20` | Maximum messages to return |
| `pageToken` | string | query | No | — | Pagination token |

**Authentication:** Required (JWT).

**Response:** Array of Gmail messages with metadata (subject, from, date, snippet, labels).

### `GET /api/gmail/message`

Get details of a single message.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `credentialId` | number | query | Yes | Gmail OAuth credential ID |
| `messageId` | string | query | Yes | Gmail message ID |

**Authentication:** Required (JWT).

### `POST /api/gmail/modify`

Modify message labels (mark read/unread, star, etc.).

**Body:**
```json
{
  "credentialId": 1,
  "messageId": "msg123",
  "addLabelIds": ["STARRED"],
  "removeLabelIds": ["UNREAD"]
}
```

**Authentication:** Required (JWT).

### `GET /api/gmail/profile`

Get Gmail account profile info.

| Parameter | Type | In | Required | Description |
|-----------|------|-----|----------|-------------|
| `credentialId` | number | query | Yes | Gmail OAuth credential ID |

**Authentication:** Required (JWT).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | Yes | Callback URL (e.g., `http://localhost:3001/api/gmail/callback`) |

## Setup

See [GMAIL_WIDGET_API.md](../GMAIL_WIDGET_API.md) for the full Google Cloud Console setup guide.

## Notes

- Tokens auto-refresh when within 60 seconds of expiry
- New refresh tokens received during refresh are automatically persisted
- Email address is fetched and stored on first OAuth connection
