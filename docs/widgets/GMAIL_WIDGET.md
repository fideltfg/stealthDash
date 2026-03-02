# Gmail Widget

Display and manage Gmail inbox directly from your dashboard.

## Overview

The Gmail widget provides a clean interface to view unread emails, read messages, and mark them as read/unread using OAuth2 authentication.

## Requirements

- Google Cloud Console project with Gmail API enabled
- OAuth 2.0 credentials configured
- Backend API endpoints for Gmail integration

## Setup

For detailed backend setup instructions, see [Gmail Widget Backend API Documentation](../GMAIL_WIDGET_API.md).

### Quick Setup

1. **Google Cloud Console**
   - Create/select project
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Configure authorized redirect URIs

2. **Backend Configuration**
   - Set environment variables (Client ID, Secret, Redirect URI)
   - Implement required API endpoints
   - Install googleapis npm package

3. **Dashboard Setup**
   - Navigate to `/api/gmail/auth` to authorize
   - Complete OAuth flow
   - Credential automatically saved
   - Add Gmail widget to dashboard

4. **Widget Configuration**
   - Select Gmail credential from dropdown
   - Choose labels to monitor (INBOX, UNREAD, etc.)
   - Set refresh interval

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

## Required Backend Endpoints

The Gmail widget requires these backend API endpoints:

1. **OAuth Flow**
   - `GET /api/gmail/auth` - Initiate OAuth
   - `GET /api/gmail/callback` - OAuth callback

2. **Message Operations**
   - `GET /api/gmail/messages` - List messages
   - `GET /api/gmail/message` - Get message details
   - `POST /api/gmail/modify` - Modify message labels

See [Gmail Widget Backend API Documentation](../GMAIL_WIDGET_API.md) for complete implementation details.

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

- Requires backend API implementation
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
