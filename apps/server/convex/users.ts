import { query, mutation } from "./_generated/server";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // For Convex Auth, the identity contains the user info
    return {
      _id: identity.subject,
      _creationTime: Date.now(),
      name: identity.name || identity.email?.split("@")[0] || "User",
      email: identity.email || "",
      tokenIdentifier: identity.subject,
    };
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // For Convex Auth, the identity contains the user info
    return {
      _id: identity.subject,
      _creationTime: Date.now(),
      name: identity.name || identity.email?.split("@")[0] || "User",
      email: identity.email || "",
      tokenIdentifier: identity.subject,
    };
  },
});

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    
    // For Convex Auth, we don't need to create a separate user record
    // The auth system handles user creation
    // Just return the user info from the identity
    return {
      _id: identity.subject,
      _creationTime: Date.now(),
      name: identity.name || identity.email?.split("@")[0] || "User",
      email: identity.email || "",
      tokenIdentifier: identity.subject,
    };
  },
});