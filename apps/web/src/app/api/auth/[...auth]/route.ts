import { betterAuth } from "better-auth";
import { NextRequest } from "next/server";
import { mkdir } from "fs/promises";
import { join } from "path";
import { env } from "@/lib/env";

// Ensure data directory exists
mkdir(env.AUTH_DATA_DIR, { recursive: true }).catch(() => {});

// Initialize Better Auth with persistent SQLite database
const auth = betterAuth({
  database: {
    type: "sqlite",
    url: env.BETTER_AUTH_DATABASE_URL,
  },
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