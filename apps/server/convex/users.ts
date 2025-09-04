import { query } from "./_generated/server";
import { getCurrentUserId } from "./auth";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      return null;
    }
    
    // For development: return a mock user object
    return {
      _id: "user_default" as any,
      _creationTime: Date.now(),
      name: "Test User",
      email: "test@example.com",
    };
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      return null;
    }
    
    // For development: return a mock user object
    return {
      _id: "user_default" as any,
      _creationTime: Date.now(),
      name: "Test User",
      email: "test@example.com",
    };
  },
});