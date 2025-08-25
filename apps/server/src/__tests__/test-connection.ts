import { Pool } from "pg";

console.log("DATABASE_URL:", process.env.DATABASE_URL);
console.log("NODE_ENV:", process.env.NODE_ENV);

const connectionString = process.env.DATABASE_URL || "postgresql://openchat@localhost:5432/openchat_dev";
console.log("Using connection string:", connectionString);

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5000,
  ssl: false
});

async function test() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Connection successful:", result.rows[0]);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Connection failed:", error);
    await pool.end();
    process.exit(1);
  }
}

test();