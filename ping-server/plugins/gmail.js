/**
 * Gmail Plugin
 *
 * Provides Gmail OAuth2 flow and API proxy for the Gmail widget.
 * Handles: OAuth authorization, token refresh, message listing,
 * message details, label modification, and user profile.
 */

const express = require('express');
const router = express.Router();
const { db, authMiddleware, verifyAuth, getCredentials } = require('../src/plugin-helpers');
const { encryptCredentials, decryptCredentials } = require('../src/crypto-utils');

// Google OAuth2 constants from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Gmail API base URL
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ==================== HELPERS ====================

/**
 * Build an OAuth2 authorization URL
 */
function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange an authorization code or refresh token for access tokens
 */
async function exchangeToken(grantType, codeOrToken) {
  const fetch = (await import('node-fetch')).default;

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: grantType,
  });

  if (grantType === 'authorization_code') {
    body.set('code', codeOrToken);
  } else {
    body.set('refresh_token', codeOrToken);
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Get a valid access token for a credential, refreshing if expired.
 * Returns { accessToken, credentialData }
 */
async function getValidAccessToken(credentialId, userId) {
  const credData = await getCredentials(credentialId, userId);

  // Check if token is still valid (with 60s buffer)
  if (credData.expiry_date && credData.expiry_date > Date.now() + 60000) {
    return { accessToken: credData.access_token, credentialData: credData };
  }

  // Token expired — refresh it
  if (!credData.refresh_token) {
    throw new Error('No refresh token available. Please re-authorize Gmail.');
  }

  const tokens = await exchangeToken('refresh_token', credData.refresh_token);

  // Merge new tokens (Google may or may not return a new refresh_token)
  const updated = {
    ...credData,
    access_token: tokens.access_token,
    expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
  if (tokens.refresh_token) {
    updated.refresh_token = tokens.refresh_token;
  }

  // Persist updated tokens
  const encrypted = encryptCredentials(updated);
  await db.query(
    'UPDATE credentials SET credential_data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
    [encrypted, credentialId, userId]
  );

  return { accessToken: updated.access_token, credentialData: updated };
}

/**
 * Make an authenticated request to the Gmail API
 */
async function gmailFetch(accessToken, path, options = {}) {
  const fetch = (await import('node-fetch')).default;

  const url = path.startsWith('http') ? path : `${GMAIL_API}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Check if Google OAuth is configured
 */
function isGoogleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

// ==================== ROUTES ====================

/**
 * GET /api/gmail/status
 * Check if Google OAuth is configured on the server
 */
router.get('/api/gmail/status', (req, res) => {
  res.json({
    configured: isGoogleConfigured(),
    message: isGoogleConfigured()
      ? 'Google OAuth is configured'
      : 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables',
  });
});

/**
 * GET /api/gmail/auth
 * Initiate the OAuth2 authorization flow.
 * Redirects the user to Google's consent screen.
 */
router.get('/api/gmail/auth', authMiddleware, (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(500).json({
      error: 'Google OAuth not configured',
      message: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables',
    });
  }

  // Encode user ID in state so we can link the credential on callback
  const state = Buffer.from(JSON.stringify({ userId: req.user.userId })).toString('base64url');
  const authUrl = buildAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /api/gmail/callback
 * OAuth2 callback from Google. Exchanges code for tokens and stores credential.
 */
router.get('/api/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?gmail_auth=error&message=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  try {
    // Decode user info from state
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    const userId = stateData.userId;

    if (!userId) {
      throw new Error('Invalid state: missing userId');
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeToken('authorization_code', code);

    // Get user's Gmail profile to use as credential name
    let emailAddress = 'Gmail Account';
    try {
      const fetch = (await import('node-fetch')).default;
      const profileResponse = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        emailAddress = profile.emailAddress || emailAddress;
      }
    } catch (e) {
      // Non-fatal — just use the default name
    }

    // Store credential
    const credentialData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || '',
    };

    const encrypted = encryptCredentials(credentialData);

    // Check if a Gmail credential already exists for this email
    const existing = await db.query(
      "SELECT id FROM credentials WHERE user_id = $1 AND service_type = 'gmail' AND name = $2",
      [userId, emailAddress]
    );

    if (existing.rows.length > 0) {
      // Update existing credential
      await db.query(
        'UPDATE credentials SET credential_data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [encrypted, existing.rows[0].id, userId]
      );
    } else {
      // Insert new credential
      await db.query(
        'INSERT INTO credentials (user_id, name, service_type, credential_data, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [userId, emailAddress, 'gmail', encrypted]
      );
    }

    res.redirect('/?gmail_auth=success');
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    res.redirect(`/?gmail_auth=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /api/gmail/messages
 * List messages matching the given labels.
 * Query: credentialId, labelIds (comma-separated), maxResults, pageToken
 */
router.get('/api/gmail/messages', authMiddleware, async (req, res) => {
  const { credentialId, labelIds = 'INBOX', maxResults = '20', pageToken } = req.query;

  if (!credentialId) {
    return res.status(400).json({ error: 'credentialId is required' });
  }

  try {
    const { accessToken } = await getValidAccessToken(parseInt(credentialId), req.user.userId);

    const params = new URLSearchParams({
      labelIds: labelIds,
      maxResults: String(Math.min(parseInt(maxResults) || 20, 100)),
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const data = await gmailFetch(accessToken, `/messages?${params}`);
    res.json(data);
  } catch (err) {
    console.error('Gmail list messages error:', err);
    res.status(500).json({ error: err.message || 'Failed to list messages' });
  }
});

/**
 * GET /api/gmail/message
 * Get details of a single message.
 * Query: credentialId, messageId
 */
router.get('/api/gmail/message', authMiddleware, async (req, res) => {
  const { credentialId, messageId } = req.query;

  if (!credentialId || !messageId) {
    return res.status(400).json({ error: 'credentialId and messageId are required' });
  }

  try {
    const { accessToken } = await getValidAccessToken(parseInt(credentialId), req.user.userId);

    const params = new URLSearchParams({
      format: 'metadata',
      metadataHeaders: 'From,To,Subject,Date',
    });

    const data = await gmailFetch(accessToken, `/messages/${messageId}?${params}`);
    res.json(data);
  } catch (err) {
    console.error('Gmail get message error:', err);
    res.status(500).json({ error: err.message || 'Failed to get message' });
  }
});

/**
 * POST /api/gmail/modify
 * Modify message labels (e.g., mark as read/unread, star/unstar).
 * Body: { credentialId, messageId, addLabelIds, removeLabelIds }
 */
router.post('/api/gmail/modify', authMiddleware, async (req, res) => {
  const { credentialId, messageId, addLabelIds, removeLabelIds } = req.body;

  if (!credentialId || !messageId) {
    return res.status(400).json({ error: 'credentialId and messageId are required' });
  }

  try {
    const { accessToken } = await getValidAccessToken(parseInt(credentialId), req.user.userId);

    const data = await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || [],
      }),
    });

    res.json(data);
  } catch (err) {
    console.error('Gmail modify message error:', err);
    res.status(500).json({ error: err.message || 'Failed to modify message' });
  }
});

/**
 * GET /api/gmail/profile
 * Get the authenticated user's Gmail profile.
 * Query: credentialId
 */
router.get('/api/gmail/profile', authMiddleware, async (req, res) => {
  const { credentialId } = req.query;

  if (!credentialId) {
    return res.status(400).json({ error: 'credentialId is required' });
  }

  try {
    const { accessToken } = await getValidAccessToken(parseInt(credentialId), req.user.userId);
    const data = await gmailFetch(accessToken, '/profile');
    res.json(data);
  } catch (err) {
    console.error('Gmail profile error:', err);
    res.status(500).json({ error: err.message || 'Failed to get profile' });
  }
});

// ==================== PLUGIN EXPORT ====================

module.exports = {
  name: 'gmail',
  description: 'Gmail OAuth2 integration (auth flow, messages, labels, profile)',
  version: '1.0.0',
  routes: router,
  mountPath: '/',
};
