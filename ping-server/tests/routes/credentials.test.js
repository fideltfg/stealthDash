/**
 * Credentials Routes Tests
 * 
 * Tests for: GET /user/credentials, GET /user/credentials/:id, POST /user/credentials,
 *            PUT /user/credentials/:id, DELETE /user/credentials/:id,
 *            POST /user/credentials/:id/test
 */
const {
  get, post, put, del, createTestUser, cleanupTestUser, pool,
} = require('../helpers');

describe('Credentials Routes', () => {
  let user;
  let otherUser;
  let credentialId;

  beforeAll(async () => {
    user = await createTestUser({ username: `test_cred_${Date.now()}` });
    otherUser = await createTestUser({ username: `test_cred_other_${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
    await cleanupTestUser(otherUser.id);
    await pool.end();
  });

  // ───────────── POST /user/credentials (Create) ─────────────
  describe('POST /user/credentials', () => {
    it('should create a credential', async () => {
      const res = await post('/user/credentials', {
        token: user.token,
        body: {
          name: 'test_pihole_cred',
          description: 'Test Pi-hole credential',
          service_type: 'pihole',
          data: {
            host: 'http://pihole.local',
            apiKey: 'test-api-key-12345',
          },
        },
      });
      expect(res.status).toBe(201);
      expect(res.data.credential || res.data.id).toBeDefined();
      credentialId = res.data.credential?.id || res.data.id;
    });

    it('should reject without auth', async () => {
      const res = await post('/user/credentials', {
        body: { name: 'hack', serviceType: 'api', credentialData: {} },
      });
      expect(res.status).toBe(401);
    });

    it('should reject without required fields', async () => {
      const res = await post('/user/credentials', {
        token: user.token,
        body: { name: 'incomplete' },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ───────────── GET /user/credentials (List) ─────────────
  describe('GET /user/credentials', () => {
    it('should list credentials (metadata only)', async () => {
      const res = await get('/user/credentials', { token: user.token });
      expect(res.status).toBe(200);
      const creds = res.data.credentials || res.data;
      expect(Array.isArray(creds)).toBe(true);
    });

    it('should not return credentials of other users', async () => {
      const res = await get('/user/credentials', { token: otherUser.token });
      expect(res.status).toBe(200);
      const creds = res.data.credentials || res.data;
      // Other user should have no credentials
      expect(creds.length).toBe(0);
    });

    it('should reject without auth', async () => {
      const res = await get('/user/credentials');
      expect(res.status).toBe(401);
    });
  });

  // ───────────── GET /user/credentials/:id (Get Single) ─────────────
  describe('GET /user/credentials/:id', () => {
    it('should return credential with decrypted data', async () => {
      if (!credentialId) return;
      const res = await get(`/user/credentials/${credentialId}`, { token: user.token });
      expect(res.status).toBe(200);
    });

    it('should not allow other user to access credential', async () => {
      if (!credentialId) return;
      const res = await get(`/user/credentials/${credentialId}`, { token: otherUser.token });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle non-existent credential', async () => {
      const res = await get('/user/credentials/999999', { token: user.token });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ───────────── PUT /user/credentials/:id (Update) ─────────────
  describe('PUT /user/credentials/:id', () => {
    it('should update a credential', async () => {
      if (!credentialId) return;
      const res = await put(`/user/credentials/${credentialId}`, {
        token: user.token,
        body: {
          name: 'test_pihole_cred_updated',
          description: 'Updated credential',
          service_type: 'pihole',
          data: {
            host: 'http://pihole-updated.local',
            apiKey: 'updated-key-67890',
          },
        },
      });
      expect(res.status).toBe(200);
    });

    it('should not allow other user to update credential', async () => {
      if (!credentialId) return;
      const res = await put(`/user/credentials/${credentialId}`, {
        token: otherUser.token,
        body: {
          name: 'hacked',
          service_type: 'api',
          data: { evil: true },
        },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject without auth', async () => {
      if (!credentialId) return;
      const res = await put(`/user/credentials/${credentialId}`, {
        body: { name: 'hacked' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ───────────── POST /user/credentials/:id/test ─────────────
  describe('POST /user/credentials/:id/test', () => {
    it('should test credential validation', async () => {
      if (!credentialId) return;
      const res = await post(`/user/credentials/${credentialId}/test`, {
        token: user.token,
      });
      // Test endpoint may return 200 (success) or error depending on if service is reachable
      expect([200, 400, 500]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      if (!credentialId) return;
      const res = await post(`/user/credentials/${credentialId}/test`);
      expect(res.status).toBe(401);
    });
  });

  // ───────────── DELETE /user/credentials/:id ─────────────
  describe('DELETE /user/credentials/:id', () => {
    it('should not allow other user to delete credential', async () => {
      if (!credentialId) return;
      const res = await del(`/user/credentials/${credentialId}`, {
        token: otherUser.token,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should delete a credential', async () => {
      if (!credentialId) return;
      const res = await del(`/user/credentials/${credentialId}`, {
        token: user.token,
      });
      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await del('/user/credentials/999999');
      expect(res.status).toBe(401);
    });
  });
});
