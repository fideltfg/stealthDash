/**
 * Global test setup — waits for database/server readiness
 */
const { Pool } = require('pg');

module.exports = async function globalSetup() {
  console.log('\n🔧 Global test setup: checking database connection...');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'dashboard',
    user: process.env.DB_USER || 'dashboard',
    password: process.env.DB_PASSWORD || 'dashboard123',
  });
  
  // Wait for DB to be ready (up to 30s)
  let retries = 15;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database is ready');
      break;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('❌ Database not available after 30s');
        throw err;
      }
      console.log(`   Waiting for database... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // Clean test data from previous runs
  try {
    await pool.query("DELETE FROM users WHERE username LIKE 'test_%'");
    await pool.query("DELETE FROM tasks WHERE title LIKE 'TEST_%'");
    console.log('✅ Cleaned previous test data');
  } catch (err) {
    // Tables may not exist yet, that's fine
  }
  
  await pool.end();
};
