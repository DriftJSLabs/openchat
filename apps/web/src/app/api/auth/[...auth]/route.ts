import { betterAuth } from "better-auth";
import { NextRequest } from "next/server";

// Use in-memory database for now (works in all environments)
// For production, switch to a proper database service
const auth = betterAuth({
  database: {
    type: "sqlite",
    url: ":memory:",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production",
  baseURL: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || "http://localhost:3001",
});

export const GET = async (req: NextRequest) => {
  return auth.handler(req);
};

export const POST = async (req: NextRequest) => {
  return auth.handler(req);
};