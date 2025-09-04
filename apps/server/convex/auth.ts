import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  // For now, we'll use a simple session-based approach
  // In production, this should validate JWT tokens from Better Auth
  
  // Check if there's an auth header or session
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
  
  // Use the tokenIdentifier as the user ID (this is stable across sessions)
  return identity.tokenIdentifier;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getCurrentUserId(ctx);
  
  if (!userId) {
    throw new ConvexError("Authentication required");
  }
  
  return userId;
}