import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for database migrations and introspection
 * Supports both local development and Docker environments
 */

/**
 * Determines the correct database URL for Drizzle operations
 * Follows the same logic as the main database connection
 */
function getDrizzleDatabaseUrl(): string {
  // If explicit DATABASE_URL is provided, use it
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Check if running in Docker environment
  const isDocker = process.env.DOCKER === 'true' || 
                   process.env.DATABASE_URL?.includes('postgres:5432');

  // Use Docker networking if in Docker, localhost otherwise
  if (isDocker) {
    return "postgresql://openchat:openchat_dev@postgres:5432/openchat_dev";
  }

  return "postgresql://openchat:openchat_dev@localhost:5432/openchat_dev";
}

export default defineConfig({
  schema: ["./src/db/schema/auth.ts", "./src/db/schema/chat.ts"],
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDrizzleDatabaseUrl(),
  },
  // Enhanced configuration for better development experience
  verbose: process.env.NODE_ENV === 'development',
  strict: true,
  migrations: {
    prefix: 'timestamp',
  },
});
