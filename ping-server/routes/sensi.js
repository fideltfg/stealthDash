const express = require('express');
const router = express.Router();
const db = require('../src/db');
const { decryptCredentials } = require('../src/crypto-utils');

// ==================== CREDENTIALS HELPER ====================

async function getCredentials(credentialId, userId) {
  const result = await db.query(
    'SELECT credential_data FROM credentials WHERE id = $1 AND user_id = $2',
    [credentialId, userId]
  );
  if (result.rows.length === 0) {
    throw new Error('Credential not found or access denied');
  }
  return decryptCredentials(result.rows[0].credential_data);
}

function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }
  const token = authHeader.substring(7);
  const jwt = require('jsonwebtoken');
  return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
}

// ==================== SENSI API CONSTANTS ====================

const OAUTH_URL = 'https://oauth.sensiapi.io/token';
const SOCKET_URL = 'https://rt.sensiapi.io';
const CLIENT_ID = 'fleet';
const CLIENT_SECRET = 'JLFjJmketRhj>M9uoDhusYKyi?zUyNqhGB)H2XiwLEF#KcGKrRD2JZsDQ7ufNven';

// Capabilities query string sent when connecting
const CAPABILITIES_QUERY = '?capabilities=display_humidity,operating_mode_settings,fan_mode_settings,indoor_equipment,outdoor_equipment,indoor_stages,outdoor_stages,continuous_backlight,degrees_fc,display_time,keypad_lockout,temp_offset,compressor_lockout,boost,heat_cycle_rate,cool_cycle_rate,aux_cycle_rate,early_start,min_heat_setpoint,max_heat_setpoint,min_cool_setpoint,max_cool_setpoint,circulating_fan,humidity_control,humidity_offset,humidity_offset_lower_bound,humidity_offset_upper_bound,temp_offset_lower_bound,temp_offset_upper_bound';

// In-memory token cache: { refreshToken -> { accessToken, expiresAt, userId } }
const tokenCache = new Map();

// ==================== TOKEN MANAGEMENT ====================

async function getAccessToken(refreshToken) {
  // Check cache
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30000) {
    return cached;
  }

  const fetch = (await import('node-fetch')).default;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'accept-language': 'en-US,en;q=0.9',
      'accept': '*/*',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const result = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    userId: data.user_id,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  tokenCache.set(refreshToken, result);

  // If we got a new refresh token, also update the credential in the DB
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    tokenCache.set(data.refresh_token, result);
    // Return the new refresh token so the caller can update it
    result.newRefreshToken = data.refresh_token;
  }

  return result;
}

// ==================== SOCKET.IO HELPERS ====================

/**
 * Connect to Sensi via Socket.IO, wait for state, return devices.
 * This is a stateless approach — connect, get data, disconnect.
 */
async function connectAndGetState(accessToken, timeoutMs = 15000) {
  const { io } = require('socket.io-client');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for Sensi state'));
    }, timeoutMs);

    const socket = io(SOCKET_URL + CAPABILITIES_QUERY, {
      path: '/thermostat',
      transports: ['websocket'],
      extraHeaders: {
        Authorization: 'bearer ' + accessToken,
      },
    });

    const devices = [];

    socket.on('connect', () => {
      console.log('Sensi socket connected');
    });

    socket.on('state', (data) => {
      if (Array.isArray(data)) {
        for (const item of data) {
          devices.push(item);
        }
      }
      // We have state data — resolve
      clearTimeout(timer);
      socket.disconnect();
      resolve(devices);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('Sensi connection error: ' + (err.message || err)));
    });
  });
}

/**
 * Connect to Sensi, emit a command, wait for callback response, disconnect.
 */
async function connectAndEmit(accessToken, eventName, eventData, timeoutMs = 10000) {
  const { io } = require('socket.io-client');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for Sensi command response'));
    }, timeoutMs);

    let stateReceived = false;

    const socket = io(SOCKET_URL + CAPABILITIES_QUERY, {
      path: '/thermostat',
      transports: ['websocket'],
      extraHeaders: {
        Authorization: 'bearer ' + accessToken,
      },
    });

    socket.on('state', () => {
      if (stateReceived) return;
      stateReceived = true;

      // Now emit the command once connected and state is received
      socket.emit(eventName, eventData, (error, data) => {
        clearTimeout(timer);
        socket.disconnect();
        if (error) {
          const errDesc = error?.error?.description || error?.message || JSON.stringify(error);
          reject(new Error(errDesc));
        } else {
          resolve(data || { success: true });
        }
      });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('Sensi connection error: ' + (err.message || err)));
    });
  });
}

// ==================== HELPER: resolve refresh token from request ====================

async function resolveRefreshToken(req) {
  const { credentialId, refreshToken } = req.body;

  if (credentialId) {
    const decoded = verifyAuth(req);
    const credentials = await getCredentials(credentialId, decoded.userId);
    if (!credentials.refresh_token) {
      throw new Error('Credential does not contain refresh_token field');
    }
    return { refreshToken: credentials.refresh_token, credentialId, userId: decoded.userId };
  }

  if (refreshToken) {
    return { refreshToken, credentialId: null, userId: null };
  }

  throw new Error('credentialId or refreshToken is required');
}

/**
 * If the OAuth flow returned a new refresh_token, update the stored credential.
 */
async function updateStoredRefreshToken(credentialId, userId, newRefreshToken) {
  if (!credentialId || !userId || !newRefreshToken) return;
  try {
    const result = await db.query(
      'SELECT credential_data FROM credentials WHERE id = $1 AND user_id = $2',
      [credentialId, userId]
    );
    if (result.rows.length === 0) return;

    const { encryptCredentials } = require('../src/crypto-utils');
    const existing = decryptCredentials(result.rows[0].credential_data);
    existing.refresh_token = newRefreshToken;
    const encrypted = encryptCredentials(existing);
    await db.query(
      'UPDATE credentials SET credential_data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [encrypted, credentialId, userId]
    );
    console.log(`Updated Sensi refresh_token for credential ${credentialId}`);
  } catch (err) {
    console.error('Failed to update stored refresh token:', err);
  }
}

// ==================== ROUTES ====================

/**
 * POST /sensi/state
 * Returns all thermostat states for the account.
 * Body: { credentialId } or { refreshToken }
 */
router.post('/sensi/state', async (req, res) => {
  try {
    const { refreshToken, credentialId, userId } = await resolveRefreshToken(req);
    const tokenData = await getAccessToken(refreshToken);

    if (tokenData.newRefreshToken) {
      await updateStoredRefreshToken(credentialId, userId, tokenData.newRefreshToken);
    }

    const devices = await connectAndGetState(tokenData.accessToken);
    res.json({ success: true, devices });
  } catch (error) {
    console.error('Error in /sensi/state:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

/**
 * POST /sensi/set-temperature
 * Body: { credentialId, icd_id, scale, mode, target_temp }
 */
router.post('/sensi/set-temperature', async (req, res) => {
  const { icd_id, scale, mode, target_temp } = req.body;

  if (!icd_id || !scale || !mode || target_temp === undefined) {
    return res.status(400).json({
      error: 'icd_id, scale, mode, and target_temp are required',
      success: false,
    });
  }

  try {
    const { refreshToken, credentialId, userId } = await resolveRefreshToken(req);
    const tokenData = await getAccessToken(refreshToken);

    if (tokenData.newRefreshToken) {
      await updateStoredRefreshToken(credentialId, userId, tokenData.newRefreshToken);
    }

    const data = await connectAndEmit(tokenData.accessToken, 'set_temperature', {
      icd_id,
      scale,
      mode,
      target_temp: parseInt(target_temp, 10),
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in /sensi/set-temperature:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

/**
 * POST /sensi/set-mode
 * Body: { credentialId, icd_id, value }
 * value: "off" | "heat" | "cool" | "auto" | "aux"
 */
router.post('/sensi/set-mode', async (req, res) => {
  const { icd_id, value } = req.body;

  if (!icd_id || !value) {
    return res.status(400).json({
      error: 'icd_id and value are required',
      success: false,
    });
  }

  try {
    const { refreshToken, credentialId, userId } = await resolveRefreshToken(req);
    const tokenData = await getAccessToken(refreshToken);

    if (tokenData.newRefreshToken) {
      await updateStoredRefreshToken(credentialId, userId, tokenData.newRefreshToken);
    }

    const data = await connectAndEmit(tokenData.accessToken, 'set_operating_mode', {
      icd_id,
      value,
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in /sensi/set-mode:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

/**
 * POST /sensi/set-fan
 * Body: { credentialId, icd_id, value }
 * value: "auto" | "on"
 */
router.post('/sensi/set-fan', async (req, res) => {
  const { icd_id, value } = req.body;

  if (!icd_id || !value) {
    return res.status(400).json({
      error: 'icd_id and value are required',
      success: false,
    });
  }

  try {
    const { refreshToken, credentialId, userId } = await resolveRefreshToken(req);
    const tokenData = await getAccessToken(refreshToken);

    if (tokenData.newRefreshToken) {
      await updateStoredRefreshToken(credentialId, userId, tokenData.newRefreshToken);
    }

    const data = await connectAndEmit(tokenData.accessToken, 'set_fan_mode', {
      icd_id,
      value,
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in /sensi/set-fan:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

module.exports = router;
