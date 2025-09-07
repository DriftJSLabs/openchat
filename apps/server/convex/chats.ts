import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId } from "./auth";

export async function getChatsHandler(ctx: any) {
  const userId = await getCurrentUserId(ctx);
  console.log('[chats.getChats] userId', userId);
  if (!userId) {
    return [];
  }
  return await ctx.db
    .query("chats")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .order("desc")
    .collect();
}

export const getChats = query({
  handler: getChatsHandler,
});

export async function getChatHandler(ctx: any, { chatId }: { chatId: any }) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    return null;
  }
  const chat = await ctx.db.get(chatId);
  if (chat && chat.userId !== userId) {
    return null;
  }
  return chat;
}

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: getChatHandler,
});

export async function createChatHandler(
  ctx: any,
  { title, viewMode }: { title?: string; viewMode?: "chat" | "mindmap" },
) {
  const userId = await getCurrentUserId(ctx);
  console.log('[chats.createChat] userId', userId);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  const now = Date.now();
  return await ctx.db.insert("chats", {
    userId,
    title: title || (viewMode === "mindmap" ? "New Mind Map" : "New Chat"),
    createdAt: now,
    updatedAt: now,
    viewMode: viewMode || "chat",
  });
}

export const createChat = mutation({
  args: {
    title: v.optional(v.string()),
    viewMode: v.optional(v.union(v.literal("chat"), v.literal("mindmap"))),
  },
  handler: createChatHandler,
});

export async function updateChatHandler(ctx: any, { chatId, title }: { chatId: any; title: string }) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  const chat = await ctx.db.get(chatId);
  if (!chat) {
    return;
  }
  if (chat.userId !== userId) {
    throw new Error("Not authorized to update this chat");
  }
  await ctx.db.patch(chatId, {
    title,
    updatedAt: Date.now(),
  });
}

export const updateChat = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: updateChatHandler,
});

export async function deleteChatHandler(ctx: any, { chatId }: { chatId: any }) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  const chat = await ctx.db.get(chatId);
  if (!chat) {
    return;
  }
  if (chat.userId !== userId) {
    throw new Error("Not authorized to delete this chat");
  }
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_chat", (q: any) => q.eq("chatId", chatId))
    .collect();
  for (const message of messages) {
    await ctx.db.delete(message._id);
  }
  await ctx.db.delete(chatId);
}

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: deleteChatHandler,
});

export const updateViewport = mutation({
  args: {
    chatId: v.id("chats"),
    viewport: v.object({
      x: v.number(),
      y: v.number(),
      zoom: v.number(),
    }),
  },
  handler: async (ctx, { chatId, viewport }) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Not authorized to update this chat");
    }
    
    await ctx.db.patch(chatId, { viewport });
  },
});
