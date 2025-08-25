const { Pool } = require('pg');

async function testConnection() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'openchat',
    password: 'openchat_dev',
    database: 'openchat_dev'
  });

  try {
    console.log('Testing PostgreSQL connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Connection successful:', result.rows[0]);
    
    // Test user query
    const userResult = await pool.query("SELECT COUNT(*) as user_count FROM \"user\"");
    console.log('✅ User table accessible, count:', userResult.rows[0].user_count);
    
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    await pool.end();
    return false;
  }
}

testConnection();