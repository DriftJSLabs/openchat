import { betterAuth } from "better-auth";
import { NextRequest } from "next/server";

// Initialize Better Auth with simple in-memory database for now
const auth = betterAuth({
  database: {
    type: "sqlite",
    url: ":memory:", // In-memory database for testing
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: process.env.BETTER_AUTH_SECRET || "secret",
  baseURL: process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || "http://localhost:3001",
});

export const GET = async (req: NextRequest) => {
  return auth.handler(req);
};

export const POST = async (req: NextRequest) => {
  return auth.handler(req);
};