/**
 * Test helpers — shared utilities for all test files
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dashboard',
  user: process.env.DB_USER || 'dashboard',
  password: process.env.DB_PASSWORD || 'dashboard123',
});

/**
 * Generate a JWT token for testing
 */
function generateTestToken(user = {}) {
  return jwt.sign(
    {
      userId: user.userId || user.id || 1,
      username: user.username || 'admin',
      email: user.email || 'admin@test.com',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Generate an expired JWT token
 */
function generateExpiredToken(user = {}) {
  return jwt.sign(
    {
      userId: user.userId || user.id || 1,
      username: user.username || 'admin',
      email: user.email || 'admin@test.com',
    },
    JWT_SECRET,
    { expiresIn: '-1h' }
  );
}

/**
 * Generate a token with a wrong secret
 */
function generateInvalidToken(user = {}) {
  return jwt.sign(
    {
      userId: user.userId || 1,
      username: user.username || 'admin',
      email: user.email || 'admin@test.com',
    },
    'wrong-secret-key',
    { expiresIn: '1h' }
  );
}

/**
 * Create a test user in the database, return user object + token
 */
async function createTestUser(overrides = {}) {
  const username = overrides.username || `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = overrides.email || `${username}@test.com`;
  const password = overrides.password || 'TestPass123!';
  const isAdmin = overrides.isAdmin || false;

  const passwordHash = await bcrypt.hash(password, 10);
  
  const result = await pool.query(
    'INSERT INTO users (username, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, username, email, is_admin',
    [username, email, passwordHash, isAdmin]
  );
  
  const user = result.rows[0];
  const token = generateTestToken({ userId: user.id, username: user.username, email: user.email });
  
  return { ...user, password, token };
}

/**
 * Get the admin user from the database (seeded admin/admin123)
 */
async function getAdminUser() {
  const result = await pool.query(
    "SELECT id, username, email, is_admin FROM users WHERE username = 'admin'"
  );
  
  if (result.rows.length === 0) {
    throw new Error('Admin user not found — ensure init-db.sql has been executed');
  }
  
  const user = result.rows[0];
  const token = generateTestToken({ userId: user.id, username: user.username, email: user.email });
  
  return { ...user, token };
}

/**
 * Cleanup test user(s) after tests
 */
async function cleanupTestUser(userId) {
  try {
    await pool.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM credentials WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM dashboards WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM password_recovery_tokens WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  } catch (err) {
    // Ignore cleanup errors
  }
}

/**
 * Make an HTTP request to the test server
 */
async function request(method, path, { body, token, headers: extraHeaders } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

// Convenience methods
const get = (path, opts) => request('GET', path, opts);
const post = (path, opts) => request('POST', path, opts);
const put = (path, opts) => request('PUT', path, opts);
const del = (path, opts) => request('DELETE', path, opts);

module.exports = {
  pool,
  JWT_SECRET,
  BASE_URL,
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
  createTestUser,
  getAdminUser,
  cleanupTestUser,
  request,
  get,
  post,
  put,
  del,
};
