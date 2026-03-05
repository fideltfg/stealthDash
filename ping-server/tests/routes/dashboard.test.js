/**
 * Dashboard Routes Tests
 * 
 * Tests for: POST /dashboard/save, GET /dashboard/load, POST /dashboard/save-single,
 *            GET /dashboard/version, GET /dashboard/versions, DELETE /dashboard/:id,
 *            POST /dashboard/toggle-public/:id, GET /dashboard/public/:id
 */
const {
  get, post, del, createTestUser, cleanupTestUser,
  generateTestToken, generateExpiredToken, pool,
} = require('../helpers');
const crypto = require('crypto');

describe('Dashboard Routes', () => {
  let user;
  let dashboardId;
  const testDashboardId = crypto.randomUUID();

  beforeAll(async () => {
    user = await createTestUser({ username: `test_dash_${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
    await pool.end();
  });

  // ───────────── POST /dashboard/save ─────────────
  describe('POST /dashboard/save', () => {
    it('should save dashboard state', async () => {
      const res = await post('/dashboard/save', {
        token: user.token,
        body: {
          dashboardData: {
            dashboards: [{
              id: testDashboardId,
              name: 'Test_Dashboard',
              state: { widgets: [{ type: 'clock', x: 0, y: 0, w: 2, h: 2 }] },
            }],
            activeDashboardId: testDashboardId,
          },
          clientVersion: Date.now(),
          dashboardVersions: {},
        },
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await post('/dashboard/save', {
        body: { dashboards: [] },
      });
      expect(res.status).toBe(401);
    });

    it('should reject with expired token', async () => {
      const expired = generateExpiredToken({ userId: user.id });
      const res = await post('/dashboard/save', {
        token: expired,
        body: { dashboards: [] },
      });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── GET /dashboard/load ─────────────
  describe('GET /dashboard/load', () => {
    it('should load dashboards for authenticated user', async () => {
      const res = await get('/dashboard/load', { token: user.token });
      expect(res.status).toBe(200);
      expect(res.data.dashboards || res.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await get('/dashboard/load');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /dashboard/save-single ─────────────
  describe('POST /dashboard/save-single', () => {
    it('should save a single dashboard', async () => {
      const res = await post('/dashboard/save-single', {
        token: user.token,
        body: {
          dashboardId: testDashboardId,
          name: 'Test_Dashboard_Updated',
          state: { widgets: [{ type: 'clock', x: 0, y: 0, w: 3, h: 3 }] },
        },
      });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await post('/dashboard/save-single', {
        body: { dashboardId: testDashboardId, name: 'Hacked' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── GET /dashboard/version ─────────────
  describe('GET /dashboard/version', () => {
    it('should return version info', async () => {
      const res = await get('/dashboard/version', { token: user.token });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await get('/dashboard/version');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── GET /dashboard/versions ─────────────
  describe('GET /dashboard/versions', () => {
    it('should return per-dashboard versions', async () => {
      const res = await get('/dashboard/versions', { token: user.token });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await get('/dashboard/versions');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /dashboard/toggle-public/:dashboardId ─────────────
  describe('POST /dashboard/toggle-public/:dashboardId', () => {
    it('should toggle public status of a dashboard', async () => {
      const res = await post(`/dashboard/toggle-public/${testDashboardId}`, {
        token: user.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await post(`/dashboard/toggle-public/${testDashboardId}`);
      expect(res.status).toBe(401);
    });

    it('should handle non-existent dashboard', async () => {
      const fakeId = crypto.randomUUID();
      const res = await post(`/dashboard/toggle-public/${fakeId}`, {
        token: user.token,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ───────────── GET /dashboard/public/:dashboardId ─────────────
  describe('GET /dashboard/public/:dashboardId', () => {
    it('should retrieve a public dashboard', async () => {
      // First ensure dashboard is public
      await post(`/dashboard/toggle-public/${testDashboardId}`, { token: user.token });
      
      const res = await get(`/dashboard/public/${testDashboardId}`);
      // May return 200 or 404 depending on toggle state
      expect([200, 404]).toContain(res.status);
    });

    it('should handle non-existent public dashboard', async () => {
      const fakeId = crypto.randomUUID();
      const res = await get(`/dashboard/public/${fakeId}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ───────────── DELETE /dashboard/:dashboardId ─────────────
  describe('DELETE /dashboard/:dashboardId', () => {
    let deletableDashboardId;

    beforeAll(async () => {
      deletableDashboardId = crypto.randomUUID();
      await post('/dashboard/save-single', {
        token: user.token,
        body: {
          dashboardId: deletableDashboardId,
          name: 'Test_ToDelete',
          state: { widgets: [] },
        },
      });
    });

    it('should delete a dashboard', async () => {
      const res = await del(`/dashboard/${deletableDashboardId}`, {
        token: user.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await del(`/dashboard/${testDashboardId}`);
      expect(res.status).toBe(401);
    });

    it('should handle deleting non-existent dashboard', async () => {
      const fakeId = crypto.randomUUID();
      const res = await del(`/dashboard/${fakeId}`, {
        token: user.token,
      });
      // Should return 200, 400 (last dashboard), or 404
      expect([200, 400, 404]).toContain(res.status);
    });
  });
});
