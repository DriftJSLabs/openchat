import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId } from "./auth";

export const getChats = query({
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      return [];
    }
    
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      return null;
    }
    
    const chat = await ctx.db.get(chatId);
    
    // Only return chat if it belongs to the current user
    if (chat && chat.userId !== userId) {
      return null;
    }
    
    return chat;
  },
});

export const createChat = mutation({
  args: {
    title: v.optional(v.string()),
    viewMode: v.optional(v.union(v.literal("chat"), v.literal("mindmap"))),
  },
  handler: async (ctx, { title, viewMode }) => {
    const userId = await getCurrentUserId(ctx);
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
  },
});

export const updateChat = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, { chatId, title }) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    const chat = await ctx.db.get(chatId);
    if (!chat) {
      console.warn(`Chat ${chatId} not found for update`);
      return;
    }
    
    // Only allow updating if the chat belongs to the current user
    if (chat.userId !== userId) {
      throw new Error("Not authorized to update this chat");
    }
    
    await ctx.db.patch(chatId, {
      title,
      updatedAt: Date.now(),
    });
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    
    const chat = await ctx.db.get(chatId);
    if (!chat) {
      console.warn(`Chat ${chatId} not found for deletion - may have been already deleted`);
      return;
    }
    
    // Only allow deleting if the chat belongs to the current user
    if (chat.userId !== userId) {
      throw new Error("Not authorized to delete this chat");
    }
    
    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    
    // Delete the chat
    await ctx.db.delete(chatId);
  },
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