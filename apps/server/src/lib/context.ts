import type { Context as HonoContext } from "hono";
import { createAuth } from "./auth";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  try {
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: context.req.raw.headers,
    });
    return {
      session,
    };
  } catch (error) {
    console.warn('[Auth] Failed to get session:', error);
    return {
      session: null,
    };
  }
}


export type Context = Awaited<ReturnType<typeof createContext>>;
