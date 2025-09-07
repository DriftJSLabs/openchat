import { action } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./auth";
import { api } from "./_generated/api";

export const whoami = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return { identity };
  },
});

export const createChat = action({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx as any);
    if (!userId) throw new Error("Not authenticated");
    const chatId = await ctx.runMutation(api.chats.createChat, { title: args.title ?? "E2E Chat" } as any);
    return { chatId };
  },
});

export const getChats = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx as any);
    if (!userId) throw new Error("Not authenticated");
    const chats = await ctx.runQuery(api.chats.getChats, {} as any);
    return { count: Array.isArray(chats) ? chats.length : 0 };
  },
});
