import { protectedProcedure, publicProcedure } from "../lib/orpc";
import { chatRouter } from "./chat";
import { aiRouter } from "./ai";
import { preferencesRouter } from "./preferences";
import { analyticsRouter } from "./analytics";
import { syncRouter } from "./sync";
import { userProfileRouter } from "./user-profile";
import { userRelationshipsRouter } from "./user-relationships";
import type { RouterClient } from "@orpc/server";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  chat: chatRouter,
  ai: aiRouter,
  preferences: preferencesRouter,
  analytics: analyticsRouter,
  sync: syncRouter,
  // Enhanced authentication and user management routes
  userProfile: userProfileRouter,
  userRelationships: userRelationshipsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
