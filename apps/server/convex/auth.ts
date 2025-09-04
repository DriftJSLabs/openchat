import type { QueryCtx, MutationCtx } from "./_generated/server";

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  // For development: return a default user ID
  // In production, this would validate JWT tokens from ctx.auth
  return "user_default";
}