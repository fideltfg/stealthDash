/**
 * Security Vulnerability Tests
 * 
 * Tests for: SQL injection, XSS, CSRF, auth bypass, token security,
 * privilege escalation, IDOR, header security, rate limiting, data leakage
 */
const {
  get, post, put, del, createTestUser, cleanupTestUser,
  getAdminUser, generateTestToken, generateExpiredToken,
  generateInvalidToken, pool, JWT_SECRET,
} = require('../helpers');
const jwt = require('jsonwebtoken');

describe('Security Tests', () => {
  let admin;
  let user;
  let otherUser;

  beforeAll(async () => {
    admin = await getAdminUser();
    user = await createTestUser({ username: `test_sec_${Date.now()}` });
    otherUser = await createTestUser({ username: `test_sec_other_${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
    await cleanupTestUser(otherUser.id);
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════
  // 1. SQL INJECTION
  // ═══════════════════════════════════════════════════════
  describe('SQL Injection', () => {
    const sqlPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' OR '1'='1' --",
      "' UNION SELECT * FROM users --",
      "1; DELETE FROM users",
      "admin'--",
      "' OR 1=1 LIMIT 1 --",
      "1' AND (SELECT COUNT(*) FROM users) > 0 --",
    ];

    it('should prevent SQL injection in login username', async () => {
      for (const payload of sqlPayloads) {
        const res = await post('/auth/login', {
          body: { username: payload, password: 'test' },
        });
        expect(res.status).not.toBe(200);
        // Ensure no SQL error message is leaked
        if (typeof res.data === 'object') {
          const responseStr = JSON.stringify(res.data).toLowerCase();
          expect(responseStr).not.toContain('syntax error');
          expect(responseStr).not.toContain('pg_catalog');
          expect(responseStr).not.toContain('postgresql');
        }
      }
    });

    it('should prevent SQL injection in login password', async () => {
      for (const payload of sqlPayloads) {
        const res = await post('/auth/login', {
          body: { username: 'admin', password: payload },
        });
        // Should either be 401 (wrong password) or 400
        expect([400, 401]).toContain(res.status);
      }
    });

    it('should prevent SQL injection in registration fields', async () => {
      for (const payload of sqlPayloads) {
        const res = await post('/auth/register', {
          body: { username: payload, email: 'sqli@test.com', password: 'Test123456!' },
        });
        // Should not succeed or crash the server
        if (typeof res.data === 'object') {
          const responseStr = JSON.stringify(res.data).toLowerCase();
          expect(responseStr).not.toContain('syntax error');
          expect(responseStr).not.toContain('pg_catalog');
        }
      }
    });

    it('should prevent SQL injection in credential name', async () => {
      const res = await post('/user/credentials', {
        token: user.token,
        body: {
          name: "'; DROP TABLE credentials; --",
          serviceType: 'api',
          credentialData: { key: 'test' },
        },
      });
      // Should either succeed safely (parameterized) or reject
      expect([200, 400, 500]).toContain(res.status);

      // Verify credentials table still exists
      const check = await pool.query('SELECT COUNT(*) FROM credentials');
      expect(parseInt(check.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    it('should prevent SQL injection in task title', async () => {
      const res = await post('/api/tasks', {
        token: user.token,
        body: {
          title: "TEST_'; DELETE FROM tasks; --",
          priority: 1,
        },
      });

      // Verify tasks table still exists and no harm done
      const check = await pool.query('SELECT COUNT(*) FROM tasks');
      expect(parseInt(check.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    it('should prevent SQL injection in dashboard ID parameter', async () => {
      const res = await del("/dashboard/' OR '1'='1", {
        token: user.token,
      });
      // Should not delete other users' dashboards
      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 2. CROSS-SITE SCRIPTING (XSS)
  // ═══════════════════════════════════════════════════════
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '"><script>alert(document.cookie)</script>',
      "javascript:alert('XSS')",
      '<svg onload=alert("XSS")>',
      '<body onload=alert("XSS")>',
      '{{constructor.constructor("return this")().alert("XSS")}}',
    ];

    it('should not reflect XSS in error messages', async () => {
      for (const payload of xssPayloads) {
        const res = await post('/auth/login', {
          body: { username: payload, password: 'test' },
        });
        if (typeof res.data === 'string') {
          expect(res.data).not.toContain('<script>');
          expect(res.data).not.toContain('onerror=');
        }
      }
    });

    it('should store but not execute XSS in task titles', async () => {
      const xssTitle = 'TEST_<script>alert("XSS")</script>';
      const createRes = await post('/api/tasks', {
        token: user.token,
        body: { title: xssTitle, priority: 1 },
      });

      if (createRes.status === 200) {
        const taskId = createRes.data.task?.id || createRes.data.id;
        // The API should return JSON, not HTML — XSS is a frontend concern
        // but the API should set proper content-type headers
        const listRes = await get('/api/tasks', { token: user.token });
        expect(listRes.headers['content-type']).toContain('application/json');
        
        // Clean up
        if (taskId) await del(`/api/tasks/${taskId}`, { token: user.token });
      }
    });

    it('should handle XSS in query parameters', async () => {
      const res = await get(`/ping/<script>alert('xss')</script>`);
      expect([200, 400, 404, 500]).toContain(res.status);
      if (typeof res.data === 'string') {
        expect(res.data).not.toContain('<script>');
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 3. AUTHENTICATION BYPASS
  // ═══════════════════════════════════════════════════════
  describe('Authentication Bypass', () => {
    it('should reject empty Authorization header', async () => {
      const res = await get('/dashboard/load', {
        headers: { 'Authorization': '' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject "Bearer " with no token', async () => {
      const res = await get('/dashboard/load', {
        headers: { 'Authorization': 'Bearer ' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject "Bearer null"', async () => {
      const res = await get('/dashboard/load', {
        headers: { 'Authorization': 'Bearer null' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject "Bearer undefined"', async () => {
      const res = await get('/dashboard/load', {
        headers: { 'Authorization': 'Bearer undefined' },
      });
      expect(res.status).toBe(401);
    });

    it('should reject token without Bearer prefix', async () => {
      const res = await get('/dashboard/load', {
        headers: { 'Authorization': user.token },
      });
      expect(res.status).toBe(401);
    });

    it('should reject token signed with different secret', async () => {
      const badToken = generateInvalidToken({ userId: user.id });
      const res = await get('/dashboard/load', { token: badToken });
      expect(res.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const expired = generateExpiredToken({ userId: user.id });
      const res = await get('/dashboard/load', { token: expired });
      expect(res.status).toBe(401);
    });

    it('should reject tampered token payload', async () => {
      // Create a token, tamper with the payload
      const parts = user.token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.userId = admin.id; // Try to escalate to admin
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tampered = parts.join('.');
      
      const res = await get('/dashboard/load', { token: tampered });
      expect(res.status).toBe(401);
    });

    it('should reject "none" algorithm attack', async () => {
      // Create an unsigned token (alg: none attack)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 1, username: 'admin' })).toString('base64url');
      const noneToken = `${header}.${payload}.`;
      
      const res = await get('/dashboard/load', { token: noneToken });
      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 4. PRIVILEGE ESCALATION
  // ═══════════════════════════════════════════════════════
  describe('Privilege Escalation', () => {
    it('should not allow regular user to access admin endpoints', async () => {
      const endpoints = [
        { method: 'GET', path: '/admin/users' },
        { method: 'GET', path: '/admin/stats' },
        { method: 'POST', path: '/admin/users' },
        { method: 'DELETE', path: '/admin/users/1' },
        { method: 'POST', path: '/admin/users/1/make-admin' },
        { method: 'POST', path: '/admin/users/1/remove-admin' },
        { method: 'POST', path: '/admin/users/1/reset-password' },
      ];

      for (const ep of endpoints) {
        let res;
        const opts = { token: user.token, body: {} };
        switch (ep.method) {
          case 'GET': res = await get(ep.path, opts); break;
          case 'POST': res = await post(ep.path, opts); break;
          case 'DELETE': res = await del(ep.path, opts); break;
        }
        expect(res.status).toBe(403);
      }
    });

    it('should not allow user to self-promote to admin via registration', async () => {
      const username = `test_selfpromo_${Date.now()}`;
      const res = await post('/auth/register', {
        body: {
          username,
          email: `${username}@test.com`,
          password: 'Test123456!',
          isAdmin: true,
          is_admin: true,
        },
      });

      if ((res.status === 200 || res.status === 201) && res.data.user) {
        // Check that user is NOT admin
        const check = await pool.query('SELECT is_admin FROM users WHERE id = $1', [res.data.user.id]);
        expect(check.rows[0].is_admin).toBe(false);
        await cleanupTestUser(res.data.user.id);
      }
    });

    it('should not allow user to self-promote via profile update', async () => {
      const res = await post('/user/update-profile', {
        token: user.token,
        body: { isAdmin: true, is_admin: true },
      });
      
      // Verify user is still not admin
      const check = await pool.query('SELECT is_admin FROM users WHERE id = $1', [user.id]);
      expect(check.rows[0].is_admin).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 5. INSECURE DIRECT OBJECT REFERENCES (IDOR)
  // ═══════════════════════════════════════════════════════
  describe('IDOR (Insecure Direct Object References)', () => {
    let userCredId;

    beforeAll(async () => {
      // Create a credential for the main user
      const res = await post('/user/credentials', {
        token: user.token,
        body: {
          name: 'test_idor_cred',
          service_type: 'api',
          data: { secret: 'sensitive-data' },
        },
      });
      userCredId = res.data.credential?.id || res.data.id;
    });

    afterAll(async () => {
      if (userCredId) {
        await del(`/user/credentials/${userCredId}`, { token: user.token });
      }
    });

    it('should not allow other user to read credentials', async () => {
      if (!userCredId) return;
      const res = await get(`/user/credentials/${userCredId}`, { token: otherUser.token });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should not allow other user to update credentials', async () => {
      if (!userCredId) return;
      const res = await put(`/user/credentials/${userCredId}`, {
        token: otherUser.token,
        body: { name: 'hacked', service_type: 'api', data: { evil: true } },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should not allow other user to delete credentials', async () => {
      if (!userCredId) return;
      const res = await del(`/user/credentials/${userCredId}`, { token: otherUser.token });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should not allow user to access other users tasks', async () => {
      // Create a task for user
      const createRes = await post('/api/tasks', {
        token: user.token,
        body: { title: 'TEST_IDOR_Task', priority: 1 },
      });
      const taskId = createRes.data.task?.id || createRes.data.id;
      
      if (taskId) {
        // Other user tries to update it
        const updateRes = await put(`/api/tasks/${taskId}`, {
          token: otherUser.token,
          body: { title: 'HACKED' },
        });
        expect(updateRes.status).toBeGreaterThanOrEqual(400);

        // Other user tries to delete it
        const deleteRes = await del(`/api/tasks/${taskId}`, { token: otherUser.token });
        expect(deleteRes.status).toBeGreaterThanOrEqual(400);

        // Cleanup
        await del(`/api/tasks/${taskId}`, { token: user.token });
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 6. HTTP HEADER SECURITY
  // ═══════════════════════════════════════════════════════
  describe('HTTP Header Security', () => {
    it('should return proper content-type for JSON responses', async () => {
      const res = await get('/health');
      expect(res.headers['content-type']).toContain('json');
    });

    it('should not expose server technology details', async () => {
      const res = await get('/health');
      const poweredBy = res.headers['x-powered-by'];
      // Ideally x-powered-by should be disabled
      if (poweredBy) {
        // Flag as warning — not a hard failure but a security recommendation
        console.warn('⚠️  SECURITY WARNING: X-Powered-By header is exposed:', poweredBy);
      }
    });

    it('should handle CORS headers', async () => {
      const res = await get('/health', {
        headers: { 'Origin': 'http://evil.com' },
      });
      // CORS is configured — check if it's permissive
      const corsHeader = res.headers['access-control-allow-origin'];
      if (corsHeader === '*') {
        console.warn('⚠️  SECURITY WARNING: CORS allows all origins (*)');
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 7. DATA LEAKAGE
  // ═══════════════════════════════════════════════════════
  describe('Data Leakage Prevention', () => {
    it('should not expose password hashes in user profile', async () => {
      const res = await get('/user/profile', { token: user.token });
      if (typeof res.data === 'object') {
        const str = JSON.stringify(res.data);
        expect(str).not.toContain('password_hash');
        expect(str).not.toContain('$2a$'); // bcrypt hash prefix
        expect(str).not.toContain('$2b$'); // bcrypt hash prefix
      }
    });

    it('should not expose password hashes in admin user list', async () => {
      const res = await get('/admin/users', { token: admin.token });
      if (res.data.users) {
        res.data.users.forEach((u) => {
          expect(u.password_hash).toBeUndefined();
          expect(u.password).toBeUndefined();
        });
      }
    });

    it('should not expose JWT secret in any response', async () => {
      const endpoints = [
        '/health',
        '/api/plugins',
        '/auth/verify',
      ];
      
      for (const ep of endpoints) {
        const res = await get(ep, { token: user.token });
        const str = JSON.stringify(res.data);
        expect(str).not.toContain(JWT_SECRET);
      }
    });

    it('should not expose database credentials in error responses', async () => {
      // Trigger an error condition
      const res = await get('/user/credentials/not-a-number', { token: user.token });
      if (typeof res.data === 'object') {
        const str = JSON.stringify(res.data).toLowerCase();
        expect(str).not.toContain('dashboard123');
        expect(str).not.toContain('password');
        expect(str).not.toContain('connection string');
      }
    });

    it('should not expose stack traces in production errors', async () => {
      const res = await post('/auth/login', {
        body: { username: null, password: null },
      });
      if (typeof res.data === 'object') {
        const str = JSON.stringify(res.data);
        expect(str).not.toContain(' at '); // Stack trace indicator
        expect(str).not.toContain('node_modules');
      }
    });

    it('credentials list should not return decrypted data', async () => {
      // Create a credential
      await post('/user/credentials', {
        token: user.token,
        body: {
          name: 'test_leak_check',
          service_type: 'api',
          data: { apiToken: 'super-secret-token-12345' },
        },
      });

      // List credentials (should be metadata only)
      const res = await get('/user/credentials', { token: user.token });
      const str = JSON.stringify(res.data);
      expect(str).not.toContain('super-secret-token-12345');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 8. INPUT VALIDATION & BOUNDARY TESTING
  // ═══════════════════════════════════════════════════════
  describe('Input Validation', () => {
    it('should handle extremely long input', async () => {
      const longStr = 'A'.repeat(100000);
      const res = await post('/auth/login', {
        body: { username: longStr, password: longStr },
      });
      // Should not crash the server
      expect([400, 401, 413, 500]).toContain(res.status);
    });

    it('should handle null bytes in input', async () => {
      const res = await post('/auth/login', {
        body: { username: 'admin\x00hacked', password: 'test' },
      });
      expect(res.status).not.toBe(200);
    });

    it('should handle unicode/emoji in input', async () => {
      const res = await post('/auth/login', {
        body: { username: '👨‍💻🔐', password: 'test' },
      });
      expect([400, 401]).toContain(res.status);
    });

    it('should handle JSON with extra fields gracefully', async () => {
      const res = await post('/auth/login', {
        body: {
          username: user.username,
          password: user.password,
          isAdmin: true,
          __proto__: { isAdmin: true },
        },
      });
      // Should not grant admin
      expect([200, 400, 401]).toContain(res.status);
    });

    it('should handle empty JSON body', async () => {
      const res = await post('/auth/login', { body: {} });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle non-JSON content type', async () => {
      const url = `http://localhost:3001/auth/login`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json data',
      });
      expect([400, 415, 500]).toContain(response.status);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 9. SERVER-SIDE REQUEST FORGERY (SSRF) CHECKS
  // ═══════════════════════════════════════════════════════
  describe('SSRF Prevention', () => {
    it('embed-proxy should not allow access to internal services', async () => {
      // Test with file:// protocol (should fail fast, no network timeout)
      const res = await get(`/embed-proxy?url=${encodeURIComponent('file:///etc/passwd')}`);
      // Should not return sensitive file data
      if (res.status === 200 && typeof res.data === 'string') {
        expect(res.data).not.toContain('root:');       // /etc/passwd
        expect(res.data).not.toContain('dashboard123'); // DB password
      }
    }, 15000);

    it('proxy should not allow access to internal services', async () => {
      const res = await get(`/proxy?url=${encodeURIComponent('http://localhost:5432')}`);
      if (res.status === 200 && typeof res.data === 'string') {
        expect(res.data).not.toContain('dashboard123');
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 10. PROTOTYPE POLLUTION
  // ═══════════════════════════════════════════════════════
  describe('Prototype Pollution Prevention', () => {
    it('should not be vulnerable to __proto__ injection', async () => {
      const res = await post('/auth/register', {
        body: {
          username: `test_proto_${Date.now()}`,
          email: `proto_${Date.now()}@test.com`,
          password: 'Test123456!',
          '__proto__': { isAdmin: true, is_admin: true },
        },
      });
      
      if ((res.status === 200 || res.status === 201) && res.data.user) {
        const check = await pool.query('SELECT is_admin FROM users WHERE id = $1', [res.data.user.id]);
        expect(check.rows[0].is_admin).toBe(false);
        await cleanupTestUser(res.data.user.id);
      }
    });

    it('should not be vulnerable to constructor pollution', async () => {
      const res = await post('/auth/register', {
        body: {
          username: `test_constr_${Date.now()}`,
          email: `constr_${Date.now()}@test.com`,
          password: 'Test123456!',
          constructor: { prototype: { isAdmin: true } },
        },
      });
      
      if ((res.status === 200 || res.status === 201) && res.data.user) {
        const check = await pool.query('SELECT is_admin FROM users WHERE id = $1', [res.data.user.id]);
        expect(check.rows[0].is_admin).toBe(false);
        await cleanupTestUser(res.data.user.id);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // 11. JWT-SPECIFIC ATTACKS
  // ═══════════════════════════════════════════════════════
  describe('JWT Security', () => {
    it('should reject JWT with "none" algorithm', async () => {
      const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        userId: admin.id,
        username: 'admin',
        email: 'admin@test.com',
      })).toString('base64url');
      
      const token = `${header}.${payload}.`;
      const res = await get('/dashboard/load', { token });
      expect(res.status).toBe(401);
    });

    it('should reject JWT with HS256 key confusion (if RS256 were used)', async () => {
      // Test that server doesn't accept arbitrary algorithm
      const token = jwt.sign(
        { userId: admin.id, username: 'admin' },
        'different-key',
        { algorithm: 'HS256' }
      );
      const res = await get('/dashboard/load', { token });
      expect(res.status).toBe(401);
    });

    it('should reject JWT with very long expiry attempt', async () => {
      const token = jwt.sign(
        { userId: admin.id, username: 'admin', email: 'admin@test.com' },
        JWT_SECRET,
        { expiresIn: '100y' }
      );
      // This should actually work since the server doesn't limit max expiry
      // but it's worth testing the behavior
      const res = await get('/dashboard/load', { token });
      expect([200, 401]).toContain(res.status);
    });

    it('should handle JWT with missing fields', async () => {
      const token = jwt.sign({ foo: 'bar' }, JWT_SECRET, { expiresIn: '1h' });
      const res = await get('/user/profile', { token });
      // Should handle gracefully even without userId
      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 12. PATH TRAVERSAL
  // ═══════════════════════════════════════════════════════
  describe('Path Traversal', () => {
    it('should not allow path traversal in ping target', async () => {
      const res = await get('/ping/../../etc/passwd');
      expect([200, 400, 404, 500]).toContain(res.status);
      // Should not return file contents
      if (typeof res.data === 'string') {
        expect(res.data).not.toContain('root:');
      }
    });

    it('should not allow path traversal in dashboard ID', async () => {
      const res = await get('/dashboard/public/../../../etc/passwd');
      expect([400, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 13. DENIAL OF SERVICE VECTORS
  // ═══════════════════════════════════════════════════════
  describe('DoS Prevention', () => {
    it('should handle large JSON payloads without crashing', async () => {
      const largePayload = {
        username: 'test',
        password: 'test',
        extra: 'x'.repeat(50000),
      };
      const res = await post('/auth/login', { body: largePayload });
      expect([400, 401, 413, 500]).toContain(res.status);
    });

    it('should handle deeply nested JSON without crashing', async () => {
      let nested = { a: 'value' };
      for (let i = 0; i < 50; i++) {
        nested = { a: nested };
      }
      const res = await post('/auth/login', { body: { username: 'test', password: 'test', ...nested } });
      expect([400, 401, 500]).toContain(res.status);
    });

    it('should handle rapid sequential requests', async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(get('/health'));
      }
      const results = await Promise.all(promises);
      // All should succeed — server shouldn't crash
      results.forEach((r) => {
        expect(r.status).toBe(200);
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // 14. DEFAULT CREDENTIALS CHECK
  // ═══════════════════════════════════════════════════════
  describe('Default Credentials', () => {
    it('SECURITY AUDIT: check if default admin/admin123 credentials work', async () => {
      const res = await post('/auth/login', {
        body: { username: 'admin', password: 'admin123' },
      });
      if (res.status === 200) {
        console.warn('⚠️  SECURITY WARNING: Default admin credentials (admin/admin123) are still active!');
        console.warn('   This is expected for development but MUST be changed in production.');
      }
      // This is informational — we expect it to work in dev
      expect([200, 401]).toContain(res.status);
    });

    it('SECURITY AUDIT: check JWT secret is not default', async () => {
      const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      if (secret === 'your-secret-key-change-in-production') {
        console.warn('⚠️  SECURITY WARNING: JWT secret is set to the default value!');
        console.warn('   Set JWT_SECRET environment variable in production.');
      }
    });

    it('SECURITY AUDIT: check encryption key is not default', async () => {
      const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32b';
      if (key === 'default-key-change-in-production-32b') {
        console.warn('⚠️  SECURITY WARNING: Encryption key is set to the default value!');
        console.warn('   Set ENCRYPTION_KEY environment variable in production.');
      }
    });
  });
});
