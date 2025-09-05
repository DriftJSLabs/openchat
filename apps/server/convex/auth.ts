import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

// Ensure issuer is consistent with the Convex URL
// This helps avoid mismatched `iss` causing auth to fail silently
if (process.env.NEXT_PUBLIC_CONVEX_URL) {
  if (!process.env.CONVEX_SITE_URL) {
    process.env.CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  } else if (
    process.env.NODE_ENV !== "production" &&
    process.env.CONVEX_SITE_URL !== process.env.NEXT_PUBLIC_CONVEX_URL
  ) {
    // In development, prefer the client URL to avoid issuer mismatches
    process.env.CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  }
}

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      id: "password",
      profile(params) {
        const email = params.email as string;
        return {
          email: email,
          name: email.split('@')[0],
        };
      },
    }),
  ],
});

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  // Use Convex Auth to get the current user
  const identity = await ctx.auth.getUserIdentity();
  
  if (!identity) {
    // Development fallback - only enable in development with explicit flag
    // This ensures it won't accidentally activate in production
    if (
      process.env.NODE_ENV === "development" &&
      process.env.CONVEX_ENV !== "production" &&
      process.env.ENABLE_DEV_AUTH === "true"
    ) {
      return "dev_user";
    }
    return null;
  }
  
  return identity.subject;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getCurrentUserId(ctx);
  
  if (!userId) {
    throw new ConvexError("Authentication required");
  }
  
  return userId;
}// JWT keys configured in production
