/**
 * Global test teardown — cleanup
 */
const { Pool } = require('pg');

module.exports = async function globalTeardown() {
  console.log('\n🧹 Global test teardown: cleaning up...');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'dashboard',
    user: process.env.DB_USER || 'dashboard',
    password: process.env.DB_PASSWORD || 'dashboard123',
  });
  
  try {
    await pool.query("DELETE FROM tasks WHERE title LIKE 'TEST_%'");
    await pool.query("DELETE FROM credentials WHERE name LIKE 'test_%'");
    await pool.query("DELETE FROM dashboards WHERE name LIKE 'Test_%'");
    await pool.query("DELETE FROM password_recovery_tokens WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')");
    await pool.query("DELETE FROM users WHERE username LIKE 'test_%'");
    console.log('✅ Test data cleaned up');
  } catch (err) {
    console.warn('⚠️  Cleanup warning:', err.message);
  }
  
  await pool.end();
};
