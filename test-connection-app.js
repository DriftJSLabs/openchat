const { Pool } = require('pg');

// Test with container hostname instead of localhost
const pool = new Pool({
  host: 'test-postgres',  // Use container name
  port: 5432,
  user: 'openchat',
  password: 'openchat_dev',
  database: 'openchat_dev'
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT current_user, current_database(), COUNT(*) as user_count FROM "user"');
    console.log('✅ Connection successful!');
    console.log('User:', result.rows[0].current_user);
    console.log('Database:', result.rows[0].current_database);
    console.log('Users in table:', result.rows[0].user_count);
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    await pool.end();
    return false;
  }
}

testConnection();