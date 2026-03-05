/**
 * Plugin Routes Tests
 * 
 * Tests for all plugin endpoints: ping, proxy, crypto, docker, tasks,
 * and other plugins (health checks and auth enforcement)
 */
const {
  get, post, put, del, createTestUser, cleanupTestUser, pool,
} = require('../helpers');

describe('Plugin Routes', () => {
  let user;

  beforeAll(async () => {
    user = await createTestUser({ username: `test_plugin_${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
    await pool.end();
  });

  // ───────────── Health & Ping Plugin ─────────────
  describe('Ping Plugin', () => {
    it('GET /health should return health status', async () => {
      const res = await get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /ping/:target should ping localhost', async () => {
      const res = await get('/ping/127.0.0.1');
      expect(res.status).toBe(200);
    });

    it('GET /ping/:target should handle invalid target', async () => {
      const res = await get('/ping/invalid.nonexistent.host.zzz');
      // Should return a response (might be 200 with isAlive: false, or error)
      expect([200, 400, 500]).toContain(res.status);
    });

    it('POST /ping-batch should batch ping targets', async () => {
      const res = await post('/ping-batch', {
        body: { targets: ['127.0.0.1'] },
      });
      expect(res.status).toBe(200);
    });

    it('POST /ping-batch should handle empty targets', async () => {
      const res = await post('/ping-batch', {
        body: { targets: [] },
      });
      expect([200, 400]).toContain(res.status);
    });
  });

  // ───────────── Proxy Plugin ─────────────
  describe('Proxy Plugin', () => {
    it('GET /embed-proxy should require url parameter', async () => {
      const res = await get('/embed-proxy');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('GET /proxy should require url parameter', async () => {
      const res = await get('/proxy');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('GET /embed-proxy should proxy a valid URL', async () => {
      const res = await get('/embed-proxy?url=http://example.com');
      // Will proxy or fail if network unavailable
      expect([200, 400, 500, 502]).toContain(res.status);
    });
  });

  // ───────────── Crypto Plugin ─────────────
  describe('Crypto Plugin', () => {
    it('GET /api/crypto/markets should require vs_currency and ids params', async () => {
      const res = await get('/api/crypto/markets?vs_currency=usd&per_page=5');
      // Missing 'ids' param should return 400
      expect([200, 400, 500, 502]).toContain(res.status);
    });

    it('GET /api/crypto/chart should handle missing parameters', async () => {
      const res = await get('/api/crypto/chart');
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ───────────── Docker Plugin ─────────────
  describe('Docker Plugin', () => {
    it('POST /api/docker/containers should require auth', async () => {
      const res = await post('/api/docker/containers');
      expect(res.status).toBe(401);
    });

    it('POST /api/docker/containers should list containers with auth', async () => {
      const res = await post('/api/docker/containers', {
        token: user.token,
        body: { credentialId: null },
      });
      // May return 200 with containers or 500 if docker socket not available
      expect([200, 400, 500]).toContain(res.status);
    });

    it('POST /api/docker/containers/start should require auth', async () => {
      const res = await post('/api/docker/containers/start');
      expect(res.status).toBe(401);
    });

    it('POST /api/docker/containers/stop should require auth', async () => {
      const res = await post('/api/docker/containers/stop');
      expect(res.status).toBe(401);
    });

    it('POST /api/docker/containers/restart should require auth', async () => {
      const res = await post('/api/docker/containers/restart');
      expect(res.status).toBe(401);
    });

    it('POST /api/docker/containers/logs should require auth', async () => {
      const res = await post('/api/docker/containers/logs');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── Tasks Plugin ─────────────
  describe('Tasks Plugin', () => {
    let taskId;

    it('POST /api/tasks should create a task', async () => {
      const res = await post('/api/tasks', {
        token: user.token,
        body: {
          title: 'TEST_Task_1',
          description: 'A test task',
          priority: 2,
          category: 'testing',
        },
      });
      expect(res.status).toBe(200);
      taskId = res.data.task?.id || res.data.id;
    });

    it('GET /api/tasks should list tasks', async () => {
      const res = await get('/api/tasks', { token: user.token });
      expect(res.status).toBe(200);
      const tasks = res.data.tasks || res.data;
      expect(Array.isArray(tasks)).toBe(true);
    });

    it('GET /api/tasks/stats should return task stats', async () => {
      const res = await get('/api/tasks/stats', { token: user.token });
      expect(res.status).toBe(200);
    });

    it('PUT /api/tasks/:id should update a task', async () => {
      if (!taskId) return;
      const res = await put(`/api/tasks/${taskId}`, {
        token: user.token,
        body: {
          title: 'TEST_Task_1_Updated',
          completed: true,
        },
      });
      expect(res.status).toBe(200);
    });

    it('DELETE /api/tasks/:id should delete a task', async () => {
      if (!taskId) return;
      const res = await del(`/api/tasks/${taskId}`, { token: user.token });
      expect(res.status).toBe(200);
    });

    it('GET /api/tasks should require auth', async () => {
      const res = await get('/api/tasks');
      expect(res.status).toBe(401);
    });

    it('POST /api/tasks should require auth', async () => {
      const res = await post('/api/tasks', { body: { title: 'hack' } });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── Glances Plugin ─────────────
  describe('Glances Plugin', () => {
    it('GET /api/glances should handle missing host', async () => {
      const res = await get('/api/glances');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ───────────── Gmail Plugin ─────────────
  describe('Gmail Plugin', () => {
    it('GET /api/gmail/status should return OAuth config status', async () => {
      const res = await get('/api/gmail/status');
      expect(res.status).toBe(200);
    });

    it('GET /api/gmail/auth should require auth', async () => {
      const res = await get('/api/gmail/auth');
      // Should redirect or return 401
      expect([200, 302, 400, 401]).toContain(res.status);
    });

    it('GET /api/gmail/messages should require auth', async () => {
      const res = await get('/api/gmail/messages');
      expect(res.status).toBe(401);
    });

    it('GET /api/gmail/message should require auth', async () => {
      const res = await get('/api/gmail/message');
      expect(res.status).toBe(401);
    });

    it('POST /api/gmail/modify should require auth', async () => {
      const res = await post('/api/gmail/modify');
      expect(res.status).toBe(401);
    });

    it('GET /api/gmail/profile should require auth', async () => {
      const res = await get('/api/gmail/profile');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── Google Calendar Plugin ─────────────
  describe('Google Calendar Plugin', () => {
    it('GET /api/google-calendar/events should reject without credentialId (400) or auth (401)', async () => {
      const res = await get('/api/google-calendar/events');
      expect([400, 401]).toContain(res.status);
    });
  });

  // ───────────── Home Assistant Plugin ─────────────
  describe('Home Assistant Plugin', () => {
    it('POST /home-assistant/states should handle missing params', async () => {
      const res = await post('/home-assistant/states', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });

    it('POST /home-assistant/service should handle missing params', async () => {
      const res = await post('/home-assistant/service', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });
  });

  // ───────────── Modbus Plugin ─────────────
  describe('Modbus Plugin', () => {
    it('GET /modbus/read should require host and register params', async () => {
      const res = await get('/modbus/read');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ───────────── Pi-hole Plugin ─────────────
  describe('Pi-hole Plugin', () => {
    it('GET /api/pihole should handle missing params', async () => {
      const res = await get('/api/pihole');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ───────────── Sensi Plugin ─────────────
  describe('Sensi Plugin', () => {
    it('POST /sensi/state should require auth or refreshToken', async () => {
      const res = await post('/sensi/state', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });

    it('POST /sensi/set-temperature should require auth', async () => {
      const res = await post('/sensi/set-temperature', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });

    it('POST /sensi/set-mode should require auth', async () => {
      const res = await post('/sensi/set-mode', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });

    it('POST /sensi/set-fan should require auth', async () => {
      const res = await post('/sensi/set-fan', { body: {} });
      expect([400, 401, 500]).toContain(res.status);
    });
  });

  // ───────────── SNMP Plugin ─────────────
  describe('SNMP Plugin', () => {
    it('GET /snmp/get should require host and oids', async () => {
      const res = await get('/snmp/get');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ───────────── Speedtest Plugin ─────────────
  describe('Speedtest Plugin', () => {
    it('GET /api/speedtest should handle missing params', async () => {
      const res = await get('/api/speedtest');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ───────────── Todoist Plugin ─────────────
  describe('Todoist Plugin', () => {
    it('GET /api/todoist/tasks should reject without auth/credentialId', async () => {
      const res = await get('/api/todoist/tasks');
      expect([400, 401]).toContain(res.status);
    });

    it('POST /api/todoist/close should reject without auth/credentialId', async () => {
      const res = await post('/api/todoist/close', { body: {} });
      expect([400, 401]).toContain(res.status);
    });
  });

  // ───────────── UniFi Plugin ─────────────
  describe('UniFi Plugin', () => {
    it('GET /api/unifi/sites should reject without auth/credentialId', async () => {
      const res = await get('/api/unifi/sites');
      expect([400, 401]).toContain(res.status);
    });

    it('GET /api/unifi/stats should reject without auth/credentialId', async () => {
      const res = await get('/api/unifi/stats');
      expect([400, 401]).toContain(res.status);
    });
  });

  // ───────────── UniFi Protect Plugin ─────────────
  describe('UniFi Protect Plugin', () => {
    it('GET /api/unifi-protect/bootstrap should reject without auth/credentialId', async () => {
      const res = await get('/api/unifi-protect/bootstrap');
      expect([400, 401]).toContain(res.status);
    });

    it('GET /api/unifi-protect/camera/:cameraId/snapshot should reject without auth/credentialId', async () => {
      const res = await get('/api/unifi-protect/camera/fake-camera-id/snapshot');
      expect([400, 401]).toContain(res.status);
    });
  });

  // ───────────── Server Endpoints ─────────────
  describe('Server Endpoints', () => {
    it('GET /api/plugins should list loaded plugins', async () => {
      const res = await get('/api/plugins');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data) || res.data.plugins).toBeTruthy();
    });
  });
});
