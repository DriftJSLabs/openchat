import { betterAuth } from "better-auth";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

// Initialize Better Auth with appropriate database for environment
const getDatabaseConfig = () => {
  // On Vercel serverless, use in-memory SQLite
  // Note: This means sessions won't persist across function invocations
  // For production, use a proper database service like Vercel Postgres or Neon
  if (process.env.VERCEL === '1') {
    return {
      type: "sqlite" as const,
      url: ":memory:",
    };
  }
  
  // Local development uses file-based SQLite
  return {
    type: "sqlite" as const,
    url: env.BETTER_AUTH_DATABASE_URL,
  };
};

// Only create directory in local development
if (process.env.VERCEL !== '1') {
  import('fs/promises').then(({ mkdir }) => {
    mkdir(env.AUTH_DATA_DIR, { recursive: true }).catch(() => {});
  });
}

const auth = betterAuth({
  database: getDatabaseConfig(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.getBaseURL(),
});

export const GET = async (req: NextRequest) => {
  return auth.handler(req);
};

export const POST = async (req: NextRequest) => {
  return auth.handler(req);
};