import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      id: "password",
      profile(params) {
        const email = params.email as string;
        return {
          email: email,
          name: email.split("@")[0],
        };
      },
    }),
  ],
  // Verbose logging hooks to help diagnose sign-in issues locally.
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      console.log("[auth] afterUserCreatedOrUpdated", {
        type: args.type,
        provider: (args.provider as any)?.id,
        userId: args.userId,
        email: (args.profile as any)?.email,
      });
    },
  },
});

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  // Use Convex Auth to get the current user
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) return null;
  return identity.subject;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getCurrentUserId(ctx);
  
  if (!userId) {
    throw new ConvexError("Authentication required");
  }
  
  return userId;
}// JWT keys configured in production
