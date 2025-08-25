const { Pool } = require('pg');

// Create minimal dev-login endpoint simulation
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'openchat',
  password: 'openchat_dev',
  database: 'openchat_dev'
});

const DEV_USER = {
  email: 'dev@openchat.local',
  name: 'Developer User',
  username: 'dev',
  displayName: 'Dev User'
};

async function testDevLogin() {
  console.log('🔄 Testing dev-login functionality...');
  
  try {
    // First, try to connect to database
    console.log('1. Testing database connection...');
    const client = await pool.connect();
    console.log('✅ Database connected');
    
    // Check if user table exists and dev user exists
    console.log('2. Checking dev user exists...');
    const userResult = await client.query(
      'SELECT id, email, name FROM "user" WHERE email = $1',
      [DEV_USER.email]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ Dev user not found');
      client.release();
      return false;
    }
    
    console.log('✅ Dev user found:', userResult.rows[0]);
    const devUser = userResult.rows[0];
    
    // Test session creation
    console.log('3. Testing session creation...');
    const sessionToken = 'test-session-token-' + Date.now();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await client.query(
      'INSERT INTO session (token, user_id, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [sessionToken, devUser.id, expiresAt, 'test-ip', 'test-user-agent']
    );
    
    console.log('✅ Session created successfully');
    
    // Verify session exists
    const sessionResult = await client.query(
      'SELECT token, user_id, expires_at FROM session WHERE token = $1',
      [sessionToken]
    );
    
    if (sessionResult.rows.length === 0) {
      console.log('❌ Session not found after creation');
      client.release();
      return false;
    }
    
    console.log('✅ Session verified:', sessionResult.rows[0].token.substring(0, 20) + '...');
    
    client.release();
    
    console.log('\n🎉 Dev-login functionality test PASSED!');
    console.log('✅ Database connection: Working');
    console.log('✅ Dev user exists: Working'); 
    console.log('✅ Session creation: Working');
    console.log('✅ Session verification: Working');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

testDevLogin();