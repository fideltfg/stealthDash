# Gmail Widget

Display and manage Gmail inbox directly from your dashboard.

## Overview

The Gmail widget provides a clean interface to view unread emails, read messages, and mark them as read/unread using OAuth2 authentication.

## Requirements

- Google Cloud Console project with Gmail API enabled
- OAuth 2.0 credentials (Client ID, Client Secret)
- Environment variables configured on the ping server

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Gmail API**
4. Go to "APIs & Services" → "Credentials"
5. Click "Create Credentials" → "OAuth client ID"
6. Choose "Web application"
7. Add authorized redirect URI: `https://yourdomain.com/api/gmail/callback`
8. Save the **Client ID** and **Client Secret**

### 2. Environment Variables

Add these to your `.env` file or `docker-compose.yml`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/gmail/callback
```

These are already wired into `docker-compose.yml` — just set the values.

### 3. Authorize Your Account

1. Log in to the dashboard
2. Navigate to `/api/gmail/auth` (you must be authenticated)
3. Complete the Google OAuth consent screen
4. You'll be redirected back — a Gmail credential is automatically created

### 4. Add the Widget

1. Add a Gmail widget to your dashboard
2. Open the setup wizard
3. Select your Gmail credential from the dropdown
4. Choose labels to monitor (INBOX, UNREAD, etc.)
5. Set refresh interval and save

## Features

### Email Management
- View unread message count
- List recent emails with:
  - Sender information
  - Subject line
  - Message preview (snippet)
  - Timestamp
- Mark messages as read/unread
- Open full message in Gmail

### Label Filtering
- Filter by Gmail labels (INBOX, STARRED, etc.)
- Monitor multiple labels
- Unread count per label

### Auto-Refresh
- Configurable refresh interval
- Real-time unread count updates
- Background polling

## Configuration Options

- **Credential**: Select Gmail OAuth credential
- **Labels**: Comma-separated label IDs (default: INBOX,UNREAD)
- **Max Results**: Number of messages to display (1-100)
- **Refresh Interval**: Update frequency in seconds (default: 300)

## Display

The widget shows:
- Total unread message count
- List of recent messages with:
  - From address
  - Subject
  - Preview snippet
  - Time received
- Status indicators for read/unread
- Action buttons (mark read, open in Gmail)

## Backend Plugin

All backend endpoints are provided by the built-in **Gmail plugin** (`ping-server/plugins/gmail.js`). No additional setup is needed beyond setting the environment variables above.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gmail/status` | Check if OAuth is configured |
| GET | `/api/gmail/auth` | Start OAuth2 flow (redirects to Google) |
| GET | `/api/gmail/callback` | OAuth2 callback (stores tokens) |
| GET | `/api/gmail/messages` | List messages by label |
| GET | `/api/gmail/message` | Get single message details |
| POST | `/api/gmail/modify` | Modify labels (mark read/unread, star) |
| GET | `/api/gmail/profile` | Get Gmail profile info |

Token refresh is handled automatically — when an access token expires, the plugin uses the stored refresh token to obtain a new one.

For full API details, see [Gmail Widget Backend API Documentation](../GMAIL_WIDGET_API.md).

## OAuth Scopes

Required scopes:
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.modify` - Modify labels

Optional scopes:
- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://mail.google.com/` - Full Gmail access

## Troubleshooting

**No emails showing**
- Verify credential is valid and authorized
- Check selected labels have messages
- Confirm backend endpoints are working

**Authentication failed**
- Re-authorize via `/api/gmail/auth`
- Check OAuth credentials in Google Cloud Console
- Verify redirect URI matches configuration

**Token expired**
- Backend should auto-refresh tokens
- If refresh fails, re-authorize
- Check refresh token is stored

**Rate limiting**
- Reduce refresh frequency
- Implement caching in backend
- Check Gmail API quotas

## Security

- OAuth tokens stored encrypted in Credential Manager
- Communication via authenticated backend API
- No direct Gmail API calls from browser
- Tokens automatically refreshed by backend
- Minimal required scopes requested

## Limitations

- OAuth setup required (one-time per user)
- Gmail API rate limits apply
- Read-only by default (unless additional scopes granted)
- Cannot send emails without additional scope

## Tips

**Recommended Settings**
- Refresh interval: 5-10 minutes for moderate checking
- Max results: 10-20 for clean display
- Labels: INBOX,UNREAD for new messages only

**Performance**
- Longer refresh intervals reduce API quota usage
- Backend caching can improve response times
- Consider webhook notifications for real-time updates

## Additional Resources

- [Complete Backend Setup Guide](../GMAIL_WIDGET_API.md)
- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google OAuth2 Guide](https://developers.google.com/identity/protocols/oauth2)
