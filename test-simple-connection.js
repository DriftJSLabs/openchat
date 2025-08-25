const { Client } = require('pg');

console.log('Testing PostgreSQL connection from Node.js...');
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const client = new Client(process.env.DATABASE_URL);

async function test() {
  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const result = await client.query('SELECT current_user, current_database(), COUNT(*) as user_count FROM "user"');
    console.log('✅ Query successful:', result.rows[0]);
    
    await client.end();
    console.log('✅ Connection closed');
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    return false;
  }
}

test();