import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import { auth } from "./auth.config";

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  // Use Convex Auth to get the current user
  const userId = await auth.getUserId(ctx);
  
  if (!userId) {
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
  
  return userId;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getCurrentUserId(ctx);
  
  if (!userId) {
    throw new ConvexError("Authentication required");
  }
  
  return userId;
}