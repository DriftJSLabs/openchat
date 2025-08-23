import { protectedProcedure, publicProcedure } from "../lib/orpc";
import { chatRouter } from "./chat";
import { aiRouter } from "./ai";
import { preferencesRouter } from "./preferences";
import { analyticsRouter } from "./analytics";
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
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
