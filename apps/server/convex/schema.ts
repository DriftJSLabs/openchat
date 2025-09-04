import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
	...authTables,
	users: defineTable({
		name: v.optional(v.string()),
		email: v.optional(v.string()),
	}).index("email", ["email"]),
	
	chats: defineTable({
		userId: v.string(),
		title: v.string(),
		model: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		viewMode: v.optional(v.union(v.literal("chat"), v.literal("mindmap"))),
		viewport: v.optional(v.object({
			x: v.number(),
			y: v.number(),
			zoom: v.number(),
		})),
	})
		.index("by_user", ["userId"])
		.index("by_user_updated", ["userId", "updatedAt"]),
	
	messages: defineTable({
		chatId: v.id("chats"),
		userId: v.string(),
		content: v.string(),
		role: v.union(v.literal("user"), v.literal("assistant")),
		model: v.optional(v.string()),
		isStreaming: v.optional(v.boolean()),
		createdAt: v.number(),
		position: v.optional(v.object({ x: v.number(), y: v.number() })),
		parentMessageId: v.optional(v.id("messages")),
		highlightedText: v.optional(v.string()),
		nodeStyle: v.optional(v.string()),
	})
		.index("by_chat", ["chatId"])
		.index("by_chat_created", ["chatId", "createdAt"]),
});