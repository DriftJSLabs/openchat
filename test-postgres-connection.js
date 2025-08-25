const { Client } = require('pg');

async function testConnection() {
  console.log('Testing postgres connection...');
  
  // First test connection to postgres database
  const client1 = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'postgres'
  });
  
  try {
    await client1.connect();
    console.log('✅ Connected to postgres database');
    
    const result = await client1.query('SELECT datname FROM pg_database WHERE datname = $1', ['openchat_dev']);
    console.log('Database check result:', result.rows);
    
    await client1.end();
  } catch (error) {
    console.error('❌ Failed to connect to postgres database:', error.message);
    return false;
  }
  
  // Now test connection to openchat_dev database
  const client2 = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres', 
    password: 'password',
    database: 'openchat_dev'
  });
  
  try {
    await client2.connect();
    console.log('✅ Connected to openchat_dev database');
    
    const result = await client2.query('SELECT current_database(), current_user');
    console.log('Database info:', result.rows[0]);
    
    await client2.end();
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to openchat_dev database:', error.message);
    console.error('Error details:', {
      code: error.code,
      severity: error.severity,
      detail: error.detail
    });
    return false;
  }
}

testConnection();