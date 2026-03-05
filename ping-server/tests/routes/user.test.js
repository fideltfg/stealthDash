/**
 * User Routes Tests
 * 
 * Tests for: POST /user/change-password, POST /user/update-profile, GET /user/profile
 */
const {
  get, post, createTestUser, cleanupTestUser,
  generateExpiredToken, pool,
} = require('../helpers');

describe('User Routes', () => {
  let user;

  beforeAll(async () => {
    user = await createTestUser({ username: `test_user_${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
    await pool.end();
  });

  // ───────────── GET /user/profile ─────────────
  describe('GET /user/profile', () => {
    it('should return user profile', async () => {
      const res = await get('/user/profile', { token: user.token });
      expect(res.status).toBe(200);
      expect(res.data.username || res.data.user?.username).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await get('/user/profile');
      expect(res.status).toBe(401);
    });

    it('should reject with expired token', async () => {
      const expired = generateExpiredToken({ userId: user.id });
      const res = await get('/user/profile', { token: expired });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /user/change-password ─────────────
  describe('POST /user/change-password', () => {
    it('should change password with correct current password', async () => {
      const res = await post('/user/change-password', {
        token: user.token,
        body: {
          currentPassword: user.password,
          newPassword: 'NewSecurePass456!',
        },
      });
      expect(res.status).toBe(200);

      // Update stored password for subsequent tests
      user.password = 'NewSecurePass456!';
    });

    it('should reject with wrong current password', async () => {
      const res = await post('/user/change-password', {
        token: user.token,
        body: {
          currentPassword: 'WrongCurrentPassword!',
          newPassword: 'Whatever123!',
        },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject without current password', async () => {
      const res = await post('/user/change-password', {
        token: user.token,
        body: { newPassword: 'Whatever123!' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject without new password', async () => {
      const res = await post('/user/change-password', {
        token: user.token,
        body: { currentPassword: user.password },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject short new password', async () => {
      const res = await post('/user/change-password', {
        token: user.token,
        body: { currentPassword: user.password, newPassword: '123' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject without auth', async () => {
      const res = await post('/user/change-password', {
        body: { currentPassword: 'x', newPassword: 'y' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /user/update-profile ─────────────
  describe('POST /user/update-profile', () => {
    it('should update email', async () => {
      const newEmail = `updated_${Date.now()}@test.com`;
      const res = await post('/user/update-profile', {
        token: user.token,
        body: { email: newEmail },
      });
      expect(res.status).toBe(200);
    });

    it('should accept invalid email format (SECURITY NOTE: no server-side email validation)', async () => {
      const res = await post('/user/update-profile', {
        token: user.token,
        body: { email: 'not-valid-email' },
      });
      // NOTE: Server does NOT validate email format — this is a security finding
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await post('/user/update-profile', {
        body: { email: 'hacker@evil.com' },
      });
      expect(res.status).toBe(401);
    });
  });
});
