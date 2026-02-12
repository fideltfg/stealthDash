# Gmail Widget Backend API Requirements

## Overview
The Gmail widget requires backend API endpoints to handle OAuth2 authentication and proxy Gmail API requests. This document outlines the required endpoints and implementation details.

## Gmail API Setup

### 1. Google Cloud Console Setup
Before implementing the backend, you'll need to:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs (e.g., `https://yourdomain.com/api/gmail/callback`)
   - Save the Client ID and Client Secret

### 2. Required OAuth2 Scopes
The following Gmail API scopes are required:
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.modify` - Modify labels (mark as read/unread)

For more permissions (send, delete), add:
- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://mail.google.com/` - Full access

## Required Backend Endpoints

### 1. OAuth2 Authorization Flow

#### Initiate OAuth Flow
**Path**: `/api/gmail/auth`  
**Method**: GET  
**Headers**: `Authorization: Bearer <user-token>`  
**Query Parameters**:
- `redirect_uri` (optional) - Custom redirect URI after auth

**Response**: Redirect to Google OAuth consent screen

**Implementation**:
```javascript
const { google } = require('googleapis');

app.get('/api/gmail/auth', isAuthenticated, async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ],
    state: req.user.id // Pass user ID to link credential
  });

  res.redirect(authUrl);
});
```

#### OAuth Callback
**Path**: `/api/gmail/callback`  
**Method**: GET  
**Query Parameters**:
- `code` - Authorization code from Google
- `state` - User ID passed in initial request

**Response**: Redirect to dashboard or credential management page

**Implementation**:
```javascript
app.get('/api/gmail/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = state;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in credentials table
    await db.query(`
      INSERT INTO credentials (user_id, name, service_type, data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [
      userId,
      'Gmail Account',
      'gmail',
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      })
    ]);

    res.redirect('/?credentials=success');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?credentials=error');
  }
});
```

### 2. List Messages
**Path**: `/api/gmail/messages`  
**Method**: GET  
**Headers**: `Authorization: Bearer <user-token>`  
**Query Parameters**:
- `credentialId` (required) - Credential ID
- `labelIds` (optional) - Comma-separated list of label IDs (default: INBOX)
- `maxResults` (optional) - Number of messages to return (default: 20, max: 100)
- `pageToken` (optional) - Token for pagination

**Response**:
```json
{
  "messages": [
    {
      "id": "1234567890abcdef",
      "threadId": "1234567890abcdef"
    }
  ],
  "nextPageToken": "...",
  "resultSizeEstimate": 42
}
```

**Implementation**:
```javascript
app.get('/api/gmail/messages', isAuthenticated, async (req, res) => {
  const { credentialId, labelIds = 'INBOX', maxResults = 20 } = req.query;

  try {
    // Get credential
    const credential = await getCredential(req.user.id, credentialId);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Setup OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(credential.data);

    // Check if token needs refresh
    if (credential.data.expiry_date < Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      // Update stored credentials
      await updateCredential(credentialId, credentials);
      oauth2Client.setCredentials(credentials);
    }

    // Get Gmail service
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // List messages
    const response = await gmail.users.messages.list({
      userId: 'me',
      labelIds: labelIds.split(','),
      maxResults: parseInt(maxResults),
    });

    res.json(response.data);
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ error: 'Failed to list messages', message: error.message });
  }
});
```

### 3. Get Message Details
**Path**: `/api/gmail/message`  
**Method**: GET  
**Headers**: `Authorization: Bearer <user-token>`  
**Query Parameters**:
- `credentialId` (required) - Credential ID
- `messageId` (required) - Message ID

**Response**:
```json
{
  "id": "1234567890abcdef",
  "threadId": "1234567890abcdef",
  "labelIds": ["INBOX", "UNREAD"],
  "snippet": "Email preview text...",
  "internalDate": "1234567890000",
  "payload": {
    "headers": [
      { "name": "From", "value": "sender@example.com" },
      { "name": "Subject", "value": "Email subject" },
      { "name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000" }
    ]
  }
}
```

**Implementation**:
```javascript
app.get('/api/gmail/message', isAuthenticated, async (req, res) => {
  const { credentialId, messageId } = req.query;

  try {
    const credential = await getCredential(req.user.id, credentialId);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(credential.data);

    // Refresh token if needed
    if (credential.data.expiry_date < Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await updateCredential(credentialId, credentials);
      oauth2Client.setCredentials(credentials);
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date']
    });

    res.json(response.data);
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ error: 'Failed to get message', message: error.message });
  }
});
```

### 4. Modify Message Labels
**Path**: `/api/gmail/modify`  
**Method**: POST  
**Headers**: 
- `Authorization: Bearer <user-token>`
- `Content-Type: application/json`

**Body**:
```json
{
  "credentialId": 123,
  "messageId": "1234567890abcdef",
  "addLabelIds": ["STARRED"],
  "removeLabelIds": ["UNREAD"]
}
```

**Response**:
```json
{
  "id": "1234567890abcdef",
  "threadId": "1234567890abcdef",
  "labelIds": ["INBOX", "STARRED"]
}
```

**Implementation**:
```javascript
app.post('/api/gmail/modify', isAuthenticated, async (req, res) => {
  const { credentialId, messageId, addLabelIds, removeLabelIds } = req.body;

  try {
    const credential = await getCredential(req.user.id, credentialId);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(credential.data);

    if (credential.data.expiry_date < Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await updateCredential(credentialId, credentials);
      oauth2Client.setCredentials(credentials);
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || []
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Modify message error:', error);
    res.status(500).json({ error: 'Failed to modify message', message: error.message });
  }
});
```

## Database Schema

The credentials table should already exist, but ensure it can store OAuth tokens:

```sql
CREATE TABLE IF NOT EXISTS credentials (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  service_type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credentials_user_service ON credentials(user_id, service_type);
```

The `data` JSONB field should store:
```json
{
  "access_token": "ya29.a0...",
  "refresh_token": "1//0e...",
  "expiry_date": 1234567890000,
  "token_type": "Bearer",
  "scope": "https://www.googleapis.com/auth/gmail.readonly ..."
}
```

## Environment Variables

Add these to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/gmail/callback
```

## NPM Packages Required

```bash
npm install googleapis
```

## Security Considerations

1. **Token Encryption**: Consider encrypting OAuth tokens in the database
2. **Token Refresh**: Implement automatic token refresh before expiry
3. **Rate Limiting**: Implement rate limiting on Gmail API endpoints
4. **Scope Validation**: Only request necessary scopes
5. **User Verification**: Always verify user owns the credential

## Testing

### Manual Testing
1. Visit `/api/gmail/auth` while logged in
2. Authorize the app with your Google account
3. Verify credential is created in database
4. Test listing messages: `/api/gmail/messages?credentialId=1`
5. Test getting message: `/api/gmail/message?credentialId=1&messageId=xxx`
6. Test marking as read: POST to `/api/gmail/modify`

### cURL Examples

```bash
# List messages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/gmail/messages?credentialId=1&labelIds=INBOX,UNREAD&maxResults=10"

# Get message
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/gmail/message?credentialId=1&messageId=MESSAGE_ID"

# Mark as read
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"credentialId":1,"messageId":"MESSAGE_ID","removeLabelIds":["UNREAD"]}' \
  "http://localhost:3000/api/gmail/modify"
```

## Additional Features (Optional)

### 5. Send Email (Optional)
For sending emails, add:

**Path**: `/api/gmail/send`  
**Method**: POST  
**Body**:
```json
{
  "credentialId": 123,
  "to": "recipient@example.com",
  "subject": "Email subject",
  "body": "Email body content",
  "isHtml": false
}
```

### 6. Get User Profile (Optional)
To display user's email address:

**Path**: `/api/gmail/profile`  
**Method**: GET  
**Query**: `credentialId`

Returns:
```json
{
  "emailAddress": "user@gmail.com",
  "messagesTotal": 1234,
  "threadsTotal": 567,
  "historyId": "12345"
}
```

## Frontend Integration

The frontend Gmail widget expects these exact endpoint paths:
- `GET /api/gmail/messages?credentialId={id}&labelIds={labels}&maxResults={max}`
- `GET /api/gmail/message?credentialId={id}&messageId={id}`
- `POST /api/gmail/modify` with JSON body

Make sure your backend implements these endpoints exactly as specified.

## Troubleshooting

### Common Issues

1. **"invalid_grant" error**: Refresh token expired, user needs to re-authorize
2. **Token refresh fails**: Check client credentials and redirect URI
3. **Rate limiting**: Gmail API has quotas, implement caching
4. **Scope mismatch**: Ensure requested scopes match what was authorized

### Debug Mode

Add logging to see OAuth flow:
```javascript
oauth2Client.on('tokens', (tokens) => {
  console.log('New tokens:', tokens);
  if (tokens.refresh_token) {
    // Store refresh token
  }
});
```

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google OAuth2 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Node.js Client](https://github.com/googleapis/google-api-nodejs-client)
