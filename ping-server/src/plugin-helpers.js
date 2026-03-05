/**
 * Plugin Helpers
 * 
 * Shared utilities available to all widget plugins.
 * Provides database access, authentication, credentials, and common functions.
 */

const db = require('./db');
const { authMiddleware } = require('./auth');
const { decryptCredentials } = require('./crypto-utils');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Helper function to fetch and decrypt credentials
 * @param {number} credentialId - The credential ID
 * @param {number} userId - The user ID (for security check)
 * @returns {Promise<object>} - Decrypted credential data
 */
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

/**
 * Extract and verify JWT token from request
 * @param {Request} req - Express request object
 * @returns {object} - Decoded JWT payload with userId
 * @throws {Error} - If token is missing or invalid
 */
function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }
  const token = authHeader.substring(7);
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Create a simple caching system for API responses
 * @param {number} ttlMs - Cache TTL in milliseconds (default: 60 seconds)
 * @returns {object} - Cache object with get/set/clear methods
 */
function createCache(ttlMs = 60000) {
  const cache = new Map();
  
  return {
    get(key) {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
      }
      return entry.data;
    },
    
    set(key, data, customTtl = null) {
      cache.set(key, {
        data,
        expiresAt: Date.now() + (customTtl || ttlMs)
      });
    },
    
    clear(key) {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    },
    
    has(key) {
      const entry = cache.get(key);
      if (!entry) return false;
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return false;
      }
      return true;
    }
  };
}

/**
 * Wrap an async route handler with error handling
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped handler with error catching
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create standard JSON response helpers
 */
const respond = {
  success(res, data, status = 200) {
    res.status(status).json({ success: true, ...data, timestamp: Date.now() });
  },
  
  error(res, message, status = 500) {
    res.status(status).json({ success: false, error: message, timestamp: Date.now() });
  },
  
  unauthorized(res, message = 'Unauthorized') {
    res.status(401).json({ success: false, error: message });
  },
  
  badRequest(res, message) {
    res.status(400).json({ success: false, error: message });
  },
  
  notFound(res, message = 'Not found') {
    res.status(404).json({ success: false, error: message });
  }
};

module.exports = {
  // Database
  db,
  
  // Authentication
  authMiddleware,
  verifyAuth,
  JWT_SECRET,
  
  // Credentials
  getCredentials,
  decryptCredentials,
  
  // Utilities
  createCache,
  asyncHandler,
  respond,
};
