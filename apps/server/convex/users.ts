import { query, mutation } from "./_generated/server";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Get or create user based on the authentication provider's token
    const tokenIdentifier = identity.tokenIdentifier;
    
    // Try to find existing user by email if email is available
    if (identity.email) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email!))
        .first();
      
      if (user) {
        return {
          ...user,
          tokenIdentifier,
        };
      }
    }
    
    // Return minimal user info from identity if no user record
    return {
      _id: tokenIdentifier as any,
      _creationTime: Date.now(),
      name: identity.name || identity.email?.split("@")[0] || "User",
      email: identity.email || "",
      tokenIdentifier,
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

    const tokenIdentifier = identity.tokenIdentifier;
    
    if (identity.email) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email!))
        .first();
      
      if (user) {
        return {
          ...user,
          tokenIdentifier,
        };
      }
    }
    
    // Return minimal user info from identity if no user record
    return {
      _id: tokenIdentifier as any,
      _creationTime: Date.now(),
      name: identity.name || identity.email?.split("@")[0] || "User",
      email: identity.email || "",
      tokenIdentifier,
    };
  },
});

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) {
      return null;
    }
    
    // Check if user exists
    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .first();
    
    if (!user) {
      // Create new user
      const userId = await ctx.db.insert("users", {
        name: identity.name || identity.email.split("@")[0],
        email: identity.email,
      });
      
      user = await ctx.db.get(userId);
    }
    
    return user;
  },
});