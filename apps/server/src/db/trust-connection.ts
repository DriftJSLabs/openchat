import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./schema/auth";
import * as chatSchema from "./schema/chat";

// Create pool with explicit trust connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'openchat',
  database: 'openchat_dev',
  password: 'openchat_dev', // Container password
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0]);
  }
});

export const db = drizzle(pool, { 
  schema: { ...authSchema, ...chatSchema } 
});

export { pool };