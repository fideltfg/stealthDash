/**
 * Auth Routes Tests
 * 
 * Tests for: POST /auth/register, POST /auth/login, GET /auth/verify,
 *            POST /auth/request-recovery, POST /auth/validate-token,
 *            POST /auth/reset-password-with-token, GET /auth/validate-token/:token
 */
const {
  get, post, createTestUser, cleanupTestUser, getAdminUser,
  generateTestToken, generateExpiredToken, generateInvalidToken, pool,
} = require('../helpers');

describe('Auth Routes', () => {
  const testUsers = [];

  afterAll(async () => {
    for (const u of testUsers) {
      await cleanupTestUser(u.id);
    }
    await pool.end();
  });

  // ───────────── POST /auth/register ─────────────
  describe('POST /auth/register', () => {
    it('should register a new user with valid data', async () => {
      const username = `test_reg_${Date.now()}`;
      const res = await post('/auth/register', {
        body: { username, email: `${username}@test.com`, password: 'Password123!' },
      });
      expect(res.status).toBe(201);
      expect(res.data.token).toBeDefined();
      expect(res.data.user).toBeDefined();
      expect(res.data.user.username).toBe(username);

      // Store for cleanup
      testUsers.push({ id: res.data.user.id });
    });

    it('should reject registration without username', async () => {
      const res = await post('/auth/register', {
        body: { email: 'test@test.com', password: 'Password123!' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject registration without email', async () => {
      const res = await post('/auth/register', {
        body: { username: 'test_noemail', password: 'Password123!' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject registration without password', async () => {
      const res = await post('/auth/register', {
        body: { username: 'test_nopass', email: 'nopass@test.com' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject registration with short password', async () => {
      const res = await post('/auth/register', {
        body: { username: 'test_shortpw', email: 'shortpw@test.com', password: '123' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject duplicate username', async () => {
      const username = `test_dup_${Date.now()}`;
      // Register first
      const first = await post('/auth/register', {
        body: { username, email: `${username}@test.com`, password: 'Password123!' },
      });
      testUsers.push({ id: first.data.user?.id });

      // Try duplicate
      const res = await post('/auth/register', {
        body: { username, email: `${username}2@test.com`, password: 'Password123!' },
      });
      expect(res.status).toBe(409);
    });

    it('should reject duplicate email', async () => {
      const username = `test_dupmail_${Date.now()}`;
      const email = `${username}@test.com`;
      const first = await post('/auth/register', {
        body: { username, email, password: 'Password123!' },
      });
      testUsers.push({ id: first.data.user?.id });

      const res = await post('/auth/register', {
        body: { username: `${username}_2`, email, password: 'Password123!' },
      });
      expect(res.status).toBe(409);
    });

    it('should accept registration without strict email validation (SECURITY NOTE: no server-side email format check)', async () => {
      const res = await post('/auth/register', {
        body: { username: `test_bademail_${Date.now()}`, email: 'not-an-email', password: 'Password123!' },
      });
      // NOTE: The server does NOT validate email format — this is a security finding
      // Registration succeeds with any non-empty email string
      expect(res.status).toBe(201);
      if (res.data.user) testUsers.push({ id: res.data.user.id });
    });
  });

  // ───────────── POST /auth/login ─────────────
  describe('POST /auth/login', () => {
    let loginUser;

    beforeAll(async () => {
      loginUser = await createTestUser({ username: `test_login_${Date.now()}` });
      testUsers.push({ id: loginUser.id });
    });

    it('should login with correct credentials', async () => {
      const res = await post('/auth/login', {
        body: { username: loginUser.username, password: loginUser.password },
      });
      expect(res.status).toBe(200);
      expect(res.data.token).toBeDefined();
      expect(res.data.user.username).toBe(loginUser.username);
    });

    it('should reject login with wrong password', async () => {
      const res = await post('/auth/login', {
        body: { username: loginUser.username, password: 'WrongPassword!' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject login with non-existent user', async () => {
      const res = await post('/auth/login', {
        body: { username: 'nonexistent_user_xyzzy', password: 'Whatever123!' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject login without username', async () => {
      const res = await post('/auth/login', {
        body: { password: 'Whatever123!' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject login without password', async () => {
      const res = await post('/auth/login', {
        body: { username: loginUser.username },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ───────────── GET /auth/verify ─────────────
  describe('GET /auth/verify', () => {
    let verifyUser;

    beforeAll(async () => {
      verifyUser = await createTestUser({ username: `test_verify_${Date.now()}` });
      testUsers.push({ id: verifyUser.id });
    });

    it('should verify a valid token', async () => {
      const res = await get('/auth/verify', { token: verifyUser.token });
      expect(res.status).toBe(200);
      expect(res.data.user).toBeDefined();
    });

    it('should reject request without token', async () => {
      const res = await get('/auth/verify');
      expect(res.status).toBe(401);
    });

    it('should reject expired token', async () => {
      const expired = generateExpiredToken({ userId: verifyUser.id });
      const res = await get('/auth/verify', { token: expired });
      expect(res.status).toBe(401);
    });

    it('should reject token with wrong secret', async () => {
      const bad = generateInvalidToken({ userId: verifyUser.id });
      const res = await get('/auth/verify', { token: bad });
      expect(res.status).toBe(401);
    });

    it('should reject malformed token', async () => {
      const res = await get('/auth/verify', { token: 'not.a.real.token' });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── Password Recovery ─────────────
  describe('Password Recovery Flow', () => {
    let recoveryUser;
    let recoveryToken;

    beforeAll(async () => {
      recoveryUser = await createTestUser({ username: `test_recovery_${Date.now()}` });
      testUsers.push({ id: recoveryUser.id });
    });

    it('POST /auth/request-recovery should accept valid usernameOrEmail', async () => {
      const res = await post('/auth/request-recovery', {
        body: { usernameOrEmail: recoveryUser.email },
      });
      // Should return 200 whether or not user exists (info leakage protection)
      expect(res.status).toBe(200);
    });

    it('POST /auth/request-recovery should handle non-existent user gracefully', async () => {
      const res = await post('/auth/request-recovery', {
        body: { usernameOrEmail: 'doesnotexist@nowhere.com' },
      });
      // Should still return 200 to prevent enumeration
      expect(res.status).toBe(200);
    });

    it('POST /auth/request-recovery should reject without usernameOrEmail', async () => {
      const res = await post('/auth/request-recovery', { body: {} });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should create a recovery token in the database', async () => {
      // Request recovery to get a token in DB
      await post('/auth/request-recovery', {
        body: { usernameOrEmail: recoveryUser.email },
      });

      const result = await pool.query(
        'SELECT token FROM password_recovery_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [recoveryUser.id]
      );
      expect(result.rows.length).toBeGreaterThan(0);
      recoveryToken = result.rows[0].token;
    });

    it('POST /auth/validate-token should validate a good token', async () => {
      if (!recoveryToken) return;
      const res = await post('/auth/validate-token', {
        body: { token: recoveryToken },
      });
      expect(res.status).toBe(200);
    });

    it('GET /auth/validate-token/:token should validate a good token', async () => {
      if (!recoveryToken) return;
      const res = await get(`/auth/validate-token/${recoveryToken}`);
      expect(res.status).toBe(200);
    });

    it('POST /auth/validate-token should reject an invalid token', async () => {
      const res = await post('/auth/validate-token', {
        body: { token: 'completely-invalid-token-value' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('POST /auth/reset-password-with-token should reset password', async () => {
      if (!recoveryToken) return;
      const newPassword = 'NewSecurePass456!';
      const res = await post('/auth/reset-password-with-token', {
        body: { token: recoveryToken, newPassword },
      });
      expect(res.status).toBe(200);

      // Verify login with new password works
      const loginRes = await post('/auth/login', {
        body: { username: recoveryUser.username, password: newPassword },
      });
      expect(loginRes.status).toBe(200);
    });

    it('POST /auth/reset-password-with-token should reject reused token', async () => {
      if (!recoveryToken) return;
      const res = await post('/auth/reset-password-with-token', {
        body: { token: recoveryToken, newPassword: 'AnotherPass789!' },
      });
      // Token already used — should fail
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('POST /auth/reset-password-with-token should reject short password', async () => {
      const res = await post('/auth/reset-password-with-token', {
        body: { token: 'some-token', newPassword: '123' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
