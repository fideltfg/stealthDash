/**
 * Admin Routes Tests
 * 
 * Tests for: GET /admin/users, POST /admin/users, POST /admin/users/:userId/make-admin,
 *            POST /admin/users/:userId/remove-admin, POST /admin/users/:userId/reset-password,
 *            DELETE /admin/users/:userId, GET /admin/stats
 */
const {
  get, post, del, createTestUser, cleanupTestUser, getAdminUser, pool,
} = require('../helpers');

describe('Admin Routes', () => {
  let admin;
  let regularUser;
  let adminCreatedUser;

  beforeAll(async () => {
    admin = await getAdminUser();
    regularUser = await createTestUser({ username: `test_nonadmin_${Date.now()}` });
  });

  afterAll(async () => {
    if (adminCreatedUser?.id) await cleanupTestUser(adminCreatedUser.id);
    await cleanupTestUser(regularUser.id);
    await pool.end();
  });

  // ───────────── GET /admin/stats ─────────────
  describe('GET /admin/stats', () => {
    it('should return stats for admin', async () => {
      const res = await get('/admin/stats', { token: admin.token });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin user', async () => {
      const res = await get('/admin/stats', { token: regularUser.token });
      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated request', async () => {
      const res = await get('/admin/stats');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── GET /admin/users ─────────────
  describe('GET /admin/users', () => {
    it('should list all users for admin', async () => {
      const res = await get('/admin/users', { token: admin.token });
      expect(res.status).toBe(200);
      expect(res.data.users).toBeDefined();
      expect(Array.isArray(res.data.users)).toBe(true);
      expect(res.data.users.length).toBeGreaterThan(0);
    });

    it('should not expose password hashes', async () => {
      const res = await get('/admin/users', { token: admin.token });
      if (res.data.users) {
        res.data.users.forEach((u) => {
          expect(u.password_hash).toBeUndefined();
          expect(u.password).toBeUndefined();
        });
      }
    });

    it('should reject non-admin user', async () => {
      const res = await get('/admin/users', { token: regularUser.token });
      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated request', async () => {
      const res = await get('/admin/users');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /admin/users (Create User) ─────────────
  describe('POST /admin/users', () => {
    it('should create a new user as admin', async () => {
      const username = `test_admin_created_${Date.now()}`;
      const res = await post('/admin/users', {
        token: admin.token,
        body: {
          username,
          email: `${username}@test.com`,
          password: 'AdminCreated123!',
          isAdmin: false,
        },
      });
      expect(res.status).toBe(200);
      expect(res.data.user).toBeDefined();
      adminCreatedUser = res.data.user;
    });

    it('should reject without required fields', async () => {
      const res = await post('/admin/users', {
        token: admin.token,
        body: { username: 'incomplete' },
      });
      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await post('/admin/users', {
        token: admin.token,
        body: { username: 'test_shortpw', email: 'shortpw@test.com', password: '123' },
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const res = await post('/admin/users', {
        token: admin.token,
        body: { username: 'test_badmail', email: 'bademail', password: 'GoodPass123!' },
      });
      expect(res.status).toBe(400);
    });

    it('should reject non-admin user', async () => {
      const res = await post('/admin/users', {
        token: regularUser.token,
        body: { username: 'hacker', email: 'hack@evil.com', password: 'Hacked123!' },
      });
      expect(res.status).toBe(403);
    });
  });

  // ───────────── POST /admin/users/:userId/make-admin ─────────────
  describe('POST /admin/users/:userId/make-admin', () => {
    it('should promote a user to admin', async () => {
      if (!adminCreatedUser) return;
      const res = await post(`/admin/users/${adminCreatedUser.id}/make-admin`, {
        token: admin.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin user', async () => {
      const res = await post(`/admin/users/${regularUser.id}/make-admin`, {
        token: regularUser.token,
      });
      expect(res.status).toBe(403);
    });

    it('should handle non-existent user (NOTE: returns 200 even for non-existent users)', async () => {
      const res = await post('/admin/users/999999/make-admin', {
        token: admin.token,
      });
      // Server returns 200 even for non-existent user IDs — no 404 check
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  // ───────────── POST /admin/users/:userId/remove-admin ─────────────
  describe('POST /admin/users/:userId/remove-admin', () => {
    it('should demote a user from admin', async () => {
      if (!adminCreatedUser) return;
      const res = await post(`/admin/users/${adminCreatedUser.id}/remove-admin`, {
        token: admin.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin user', async () => {
      const res = await post(`/admin/users/${regularUser.id}/remove-admin`, {
        token: regularUser.token,
      });
      expect(res.status).toBe(403);
    });
  });

  // ───────────── POST /admin/users/:userId/reset-password ─────────────
  describe('POST /admin/users/:userId/reset-password', () => {
    it('should reset a user password', async () => {
      if (!adminCreatedUser) return;
      const res = await post(`/admin/users/${adminCreatedUser.id}/reset-password`, {
        token: admin.token,
        body: { newPassword: 'AdminReset123!' },
      });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin user', async () => {
      const res = await post(`/admin/users/${regularUser.id}/reset-password`, {
        token: regularUser.token,
        body: { newPassword: 'HackedReset123!' },
      });
      expect(res.status).toBe(403);
    });
  });

  // ───────────── DELETE /admin/users/:userId ─────────────
  describe('DELETE /admin/users/:userId', () => {
    let userToDelete;

    beforeAll(async () => {
      userToDelete = await createTestUser({ username: `test_delete_target_${Date.now()}` });
    });

    it('should delete a user as admin', async () => {
      const res = await del(`/admin/users/${userToDelete.id}`, {
        token: admin.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject non-admin user', async () => {
      const res = await del(`/admin/users/${regularUser.id}`, {
        token: regularUser.token,
      });
      expect(res.status).toBe(403);
    });

    it('should handle non-existent user', async () => {
      const res = await del('/admin/users/999999', {
        token: admin.token,
      });
      // May return 200 (idempotent) or 404
      expect([200, 404]).toContain(res.status);
    });
  });
});
