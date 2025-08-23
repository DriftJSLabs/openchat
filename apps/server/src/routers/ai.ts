import { protectedProcedure, publicProcedure } from "../lib/orpc";
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { db, aiUsage, chat, message, userPreferences } from "../db";
import { eq, and, gt, desc, count, sum, avg, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { commonRateLimits } from "../middleware/rate-limit";
import { ErrorFactory, ErrorLogger, safeAsync } from "../lib/error-handler";

// Schema definitions for AI operations
const generateResponseSchema = z.object({
  chatId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  model: z.string().optional().default("claude-3-sonnet-20240229"),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().min(1).max(4096).optional().default(1024),
  streaming: z.boolean().optional().default(false),
});

const getModelsSchema = z.object({
  provider: z.enum(["anthropic", "openai", "google", "all"]).optional().default("all"),
});

const modelUsageSchema = z.object({
  model: z.string(),
  tokensUsed: z.number(),
  operation: z.enum(["generation", "embedding", "moderation"]),
  cost: z.number().optional(),
});

const getUsageStatsSchema = z.object({
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),
  groupBy: z.enum(["day", "week", "month", "model"]).default("day"),
});

const moderateContentSchema = z.object({
  content: z.string(),
  categories: z.array(z.string()).optional(),
});

const generateEmbeddingSchema = z.object({
  text: z.string(),
  model: z.string().optional().default("text-embedding-ada-002"),
});

const summarizeChatSchema = z.object({
  chatId: z.string(),
  maxLength: z.number().min(50).max(500).optional().default(200),
});

const translateTextSchema = z.object({
  text: z.string(),
  targetLanguage: z.string(),
  sourceLanguage: z.string().optional(),
});

const analyzeContentSchema = z.object({
  content: z.string(),
  analysisType: z.enum(["sentiment", "topics", "language", "complexity"]),
});

// Additional enhanced schemas for new endpoints
const provideFeedbackSchema = z.object({
  usageId: z.string(),
  feedback: z.enum(["positive", "negative", "neutral"]),
  comment: z.string().optional(),
});

const getModelPerformanceSchema = z.object({
  model: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "google", "local", "all"]).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  operation: z.enum(["generation", "embedding", "moderation", "summarization", "translation", "analysis", "all"]).default("all"),
});

const getUserUsageQuotaSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("monthly"),
});

const setUsageQuotaSchema = z.object({
  userId: z.string(),
  dailyTokenLimit: z.number().min(0).optional(),
  monthlyTokenLimit: z.number().min(0).optional(),
  dailyCostLimit: z.number().min(0).optional(), // in micro-cents
  monthlyCostLimit: z.number().min(0).optional(), // in micro-cents
});

const estimateCostSchema = z.object({
  model: z.string(),
  operation: z.enum(["generation", "embedding", "moderation"]),
  inputTokens: z.number().min(0),
  outputTokens: z.number().min(0).optional(),
});

const bulkModerationSchema = z.object({
  contents: z.array(z.string()).min(1).max(10), // Limit to 10 items per request
  categories: z.array(z.string()).optional(),
});

/**
 * AI Router - Handles all AI-related operations including model management,
 * content generation, moderation, and usage tracking.
 * 
 * This router provides comprehensive AI functionality with proper error handling,
 * rate limiting integration, and usage analytics.
 */
export const aiRouter = {
  // Generate AI response for chat messages
  generateResponse: protectedProcedure
    .use(commonRateLimits.ai)
    .input(generateResponseSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const startTime = Date.now();

      try {
        // Validate message format and content
        if (input.messages.length === 0) {
          throw ErrorFactory.invalidInput("Messages array cannot be empty", { messagesCount: 0 }, context).toORPCError();
        }

        // Check for content safety and appropriateness
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.role !== "user") {
          throw ErrorFactory.invalidInput(
            "Last message must be from user", 
            { lastMessageRole: lastMessage.role },
            context
          ).toORPCError();
        }

        // Sanitize and validate content length
        const totalContentLength = input.messages.reduce(
          (acc, msg) => acc + msg.content.length,
          0
        );

        if (totalContentLength > 50000) {
          throw ErrorFactory.invalidInput(
            "Total message content exceeds maximum length",
            { totalLength: totalContentLength, maxLength: 50000 },
            context
          ).toORPCError();
        }

        // Determine provider from model name
        const provider = input.model.includes("claude") ? "anthropic" :
                        input.model.includes("gpt") ? "openai" :
                        input.model.includes("gemini") ? "google" : "local";

        // TODO: Implement actual AI provider integration
        // This would integrate with the AI providers service
        const mockResponse = {
          id: `msg_${Date.now()}`,
          content: `This is a mock AI response to: "${lastMessage.content}". In a real implementation, this would integrate with ${input.model} to generate actual responses.`,
          model: input.model,
          usage: {
            promptTokens: Math.floor(totalContentLength / 4), // Rough token estimation
            completionTokens: 50,
            totalTokens: Math.floor(totalContentLength / 4) + 50,
          },
          finishReason: "stop" as const,
          createdAt: new Date().toISOString(),
        };

        const endTime = Date.now();
        const latency = endTime - startTime;

        // Track usage statistics with comprehensive metrics
        const trackingResult = await this.trackModelUsage({
          userId,
          model: input.model,
          provider,
          operation: "generation",
          promptTokens: mockResponse.usage.promptTokens,
          completionTokens: mockResponse.usage.completionTokens,
          totalTokens: mockResponse.usage.totalTokens,
          cost: mockResponse.usage.totalTokens * 0.0001, // Mock cost calculation
          latency,
          status: "success",
          finishReason: mockResponse.finishReason,
          chatId: input.chatId,
          requestMetadata: {
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            streaming: input.streaming,
            messageCount: input.messages.length,
          },
          responseMetadata: {
            responseId: mockResponse.id,
          },
          userAgent: context.userAgent,
          ipAddress: context.ip,
        });

        return {
          ...mockResponse,
          usageId: trackingResult.usageId, // Include usage ID for potential feedback
        };
      } catch (error) {
        const endTime = Date.now();
        const latency = endTime - startTime;

        // Track failed usage
        await this.trackModelUsage({
          userId,
          model: input.model,
          provider: input.model.includes("claude") ? "anthropic" :
                   input.model.includes("gpt") ? "openai" :
                   input.model.includes("gemini") ? "google" : "local",
          operation: "generation",
          totalTokens: 0,
          latency,
          status: error instanceof ORPCError ? "error" : "error",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          chatId: input.chatId,
          requestMetadata: {
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            streaming: input.streaming,
            messageCount: input.messages.length,
          },
          userAgent: context.userAgent,
          ipAddress: context.ip,
        });

        // Enhanced error handling with proper categorization
        if (error instanceof ORPCError) {
          throw error;
        }

        // Log the error for monitoring
        console.error("AI generation error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to generate AI response");
      }
    }),

  // Get available AI models
  getModels: protectedProcedure
    .use(commonRateLimits.api)
    .input(getModelsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Mock model data - would be fetched from actual providers
      const models = {
        anthropic: [
          {
            id: "claude-3-opus-20240229",
            name: "Claude 3 Opus",
            provider: "anthropic",
            maxTokens: 4096,
            costPer1kTokens: 0.015,
            capabilities: ["text-generation", "reasoning", "analysis"],
            available: true,
          },
          {
            id: "claude-3-sonnet-20240229",
            name: "Claude 3 Sonnet",
            provider: "anthropic",
            maxTokens: 4096,
            costPer1kTokens: 0.003,
            capabilities: ["text-generation", "reasoning"],
            available: true,
          },
        ],
        openai: [
          {
            id: "gpt-4-turbo-preview",
            name: "GPT-4 Turbo",
            provider: "openai",
            maxTokens: 4096,
            costPer1kTokens: 0.01,
            capabilities: ["text-generation", "reasoning", "coding"],
            available: true,
          },
          {
            id: "gpt-3.5-turbo",
            name: "GPT-3.5 Turbo",
            provider: "openai",
            maxTokens: 4096,
            costPer1kTokens: 0.001,
            capabilities: ["text-generation"],
            available: true,
          },
        ],
        google: [
          {
            id: "gemini-pro",
            name: "Gemini Pro",
            provider: "google",
            maxTokens: 2048,
            costPer1kTokens: 0.0005,
            capabilities: ["text-generation", "multimodal"],
            available: true,
          },
        ],
      };

      if (input.provider === "all") {
        return Object.values(models).flat();
      }

      return models[input.provider] || [];
    }),

  // Get AI usage statistics
  getUsageStats: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUsageStatsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Parse date filters
        const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

        // Get real usage statistics from database
        const overallStats = await db
          .select({
            totalRequests: count(),
            totalTokens: sum(aiUsage.totalTokens),
            totalCost: sum(aiUsage.cost),
            avgLatency: avg(aiUsage.latency),
          })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.userId, userId),
              gt(aiUsage.createdAt, dateFrom),
              sql`${aiUsage.createdAt} <= ${dateTo}`
            )
          );

        // Get usage breakdown by date
        const dateBreakdown = await db
          .select({
            date: sql<string>`DATE(${aiUsage.createdAt})`.as('date'),
            model: aiUsage.model,
            tokens: sum(aiUsage.totalTokens),
            requests: count(),
            cost: sum(aiUsage.cost),
            avgLatency: avg(aiUsage.latency),
          })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.userId, userId),
              gt(aiUsage.createdAt, dateFrom),
              sql`${aiUsage.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(sql`DATE(${aiUsage.createdAt})`, aiUsage.model)
          .orderBy(sql`DATE(${aiUsage.createdAt})`);

        // Get top models by usage
        const topModels = await db
          .select({
            model: aiUsage.model,
            provider: aiUsage.provider,
            usage: sum(aiUsage.totalTokens),
            requests: count(),
            cost: sum(aiUsage.cost),
          })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.userId, userId),
              gt(aiUsage.createdAt, dateFrom),
              sql`${aiUsage.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(aiUsage.model, aiUsage.provider)
          .orderBy(desc(sum(aiUsage.totalTokens)))
          .limit(10);

        const totalTokens = overallStats[0]?.totalTokens || 0;
        const topModelsWithPercentage = topModels.map(model => ({
          ...model,
          cost: (model.cost || 0) / 1000000, // Convert to dollars
          percentage: totalTokens > 0 ? ((model.usage || 0) / totalTokens) * 100 : 0,
        }));

        return {
          period: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
            groupBy: input.groupBy,
          },
          totalTokens: totalTokens,
          totalCost: (overallStats[0]?.totalCost || 0) / 1000000, // Convert to dollars
          totalRequests: overallStats[0]?.totalRequests || 0,
          avgLatency: overallStats[0]?.avgLatency || 0,
          breakdown: dateBreakdown.map(item => ({
            ...item,
            cost: (item.cost || 0) / 1000000, // Convert to dollars
          })),
          topModels: topModelsWithPercentage,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Get usage stats error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve usage statistics");
      }
    }),

  // Moderate content for safety
  moderateContent: protectedProcedure
    .use(commonRateLimits.api)
    .input(moderateContentSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // Content length validation
      if (input.content.length > 10000) {
        throw new ORPCError("BAD_REQUEST", "Content too long for moderation");
      }

      // Mock moderation response - would integrate with actual moderation APIs
      const mockModerationResult = {
        flagged: false,
        categories: {
          sexual: false,
          hate: false,
          harassment: false,
          "self-harm": false,
          "sexual/minors": false,
          "hate/threatening": false,
          "violence/graphic": false,
          "self-harm/intent": false,
          "self-harm/instructions": false,
          "harassment/threatening": false,
          violence: false,
        },
        categoryScores: {
          sexual: 0.001,
          hate: 0.002,
          harassment: 0.001,
          "self-harm": 0.0001,
          "sexual/minors": 0.0001,
          "hate/threatening": 0.0001,
          "violence/graphic": 0.0002,
          "self-harm/intent": 0.0001,
          "self-harm/instructions": 0.0001,
          "harassment/threatening": 0.0001,
          violence: 0.0003,
        },
        confidence: 0.97,
        processed_at: new Date().toISOString(),
      };

      // Track moderation usage
      await this.trackModelUsage({
        userId,
        model: "moderation-latest",
        tokensUsed: Math.floor(input.content.length / 4),
        operation: "moderation",
        cost: 0, // Usually free
      });

      return mockModerationResult;
    }),

  // Generate text embeddings
  generateEmbedding: protectedProcedure
    .use(commonRateLimits.api)
    .input(generateEmbeddingSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      if (input.text.length > 8000) {
        throw new ORPCError("BAD_REQUEST", "Text too long for embedding generation");
      }

      // Mock embedding response - would integrate with actual embedding APIs
      const mockEmbedding = {
        object: "embedding",
        embedding: Array.from({ length: 1536 }, () => Math.random() * 2 - 1), // Random embedding vector
        index: 0,
        model: input.model,
        usage: {
          promptTokens: Math.floor(input.text.length / 4),
          totalTokens: Math.floor(input.text.length / 4),
        },
      };

      // Track embedding usage
      await this.trackModelUsage({
        userId,
        model: input.model,
        tokensUsed: mockEmbedding.usage.totalTokens,
        operation: "embedding",
        cost: mockEmbedding.usage.totalTokens * 0.0001,
      });

      return mockEmbedding;
    }),

  // Summarize chat conversation
  summarizeChat: protectedProcedure
    .use(commonRateLimits.ai)
    .input(summarizeChatSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      // TODO: Verify user owns the chat (integrate with chat router logic)
      // This would fetch messages from the chat and generate a summary

      const mockSummary = {
        chatId: input.chatId,
        summary: `This is a mock summary of chat ${input.chatId}. The conversation covered various topics and the user engaged in meaningful dialogue. The actual implementation would analyze the full message history and generate a concise summary within ${input.maxLength} characters.`,
        length: input.maxLength,
        generatedAt: new Date().toISOString(),
        model: "claude-3-sonnet-20240229",
      };

      return mockSummary;
    }),

  // Translate text
  translateText: protectedProcedure
    .use(commonRateLimits.api)
    .input(translateTextSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      if (input.text.length > 5000) {
        throw new ORPCError("BAD_REQUEST", "Text too long for translation");
      }

      // Mock translation response
      const mockTranslation = {
        originalText: input.text,
        translatedText: `[TRANSLATED TO ${input.targetLanguage.toUpperCase()}] ${input.text}`,
        sourceLanguage: input.sourceLanguage || "auto-detected",
        targetLanguage: input.targetLanguage,
        confidence: 0.95,
        model: "translation-latest",
        translatedAt: new Date().toISOString(),
      };

      return mockTranslation;
    }),

  // Analyze content (sentiment, topics, etc.)
  analyzeContent: protectedProcedure
    .use(commonRateLimits.api)
    .input(analyzeContentSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      if (input.content.length > 10000) {
        throw new ORPCError("BAD_REQUEST", "Content too long for analysis");
      }

      // Mock analysis response based on type
      const baseResponse = {
        content: input.content,
        analysisType: input.analysisType,
        analyzedAt: new Date().toISOString(),
        model: "analysis-latest",
      };

      switch (input.analysisType) {
        case "sentiment":
          return {
            ...baseResponse,
            sentiment: {
              overall: "positive",
              score: 0.7,
              confidence: 0.89,
              emotions: {
                joy: 0.6,
                sadness: 0.1,
                anger: 0.05,
                fear: 0.05,
                surprise: 0.1,
                disgust: 0.1,
              },
            },
          };

        case "topics":
          return {
            ...baseResponse,
            topics: [
              { topic: "technology", confidence: 0.85 },
              { topic: "artificial intelligence", confidence: 0.72 },
              { topic: "programming", confidence: 0.64 },
            ],
          };

        case "language":
          return {
            ...baseResponse,
            language: {
              detected: "en",
              confidence: 0.98,
              alternatives: [
                { language: "en-US", confidence: 0.95 },
                { language: "en-GB", confidence: 0.92 },
              ],
            },
          };

        case "complexity":
          return {
            ...baseResponse,
            complexity: {
              readingLevel: "college",
              gradeLevel: 14,
              averageWordsPerSentence: 18.5,
              averageSyllablesPerWord: 1.8,
              complexWords: 25,
              readabilityScore: 72,
            },
          };

        default:
          throw new ORPCError("BAD_REQUEST", "Invalid analysis type");
      }
    }),

  // Get AI model health status
  getModelHealth: protectedProcedure
    .use(commonRateLimits.api)
    .handler(async ({ context }) => {
    const userId = context.session!.user.id;

    // Mock health check data - would ping actual AI provider APIs
    const healthStatus = {
      timestamp: new Date().toISOString(),
      overall: "healthy",
      services: {
        anthropic: {
          status: "healthy",
          latency: 245,
          uptime: 99.9,
          lastChecked: new Date().toISOString(),
        },
        openai: {
          status: "healthy",
          latency: 312,
          uptime: 99.5,
          lastChecked: new Date().toISOString(),
        },
        google: {
          status: "degraded",
          latency: 856,
          uptime: 97.2,
          lastChecked: new Date().toISOString(),
          issues: ["Elevated response times"],
        },
      },
      recommendations: [
        "Consider using Anthropic or OpenAI for best performance",
        "Google services experiencing temporary delays",
      ],
    };

    return healthStatus;
  }),

  // Real implementation of usage tracking using database
  async trackModelUsage(params: {
    userId: string;
    model: string;
    provider: string;
    operation: "generation" | "embedding" | "moderation" | "summarization" | "translation" | "analysis";
    promptTokens?: number;
    completionTokens?: number;
    totalTokens: number;
    cost?: number;
    latency?: number;
    status: "success" | "error" | "timeout" | "rate_limited";
    errorMessage?: string;
    finishReason?: "stop" | "length" | "content_filter" | "function_call";
    chatId?: string;
    messageId?: string;
    requestMetadata?: Record<string, any>;
    responseMetadata?: Record<string, any>;
    userAgent?: string;
    ipAddress?: string;
  }) {
    try {
      const now = new Date();
      const usageRecord = {
        id: nanoid(),
        userId: params.userId,
        chatId: params.chatId || null,
        messageId: params.messageId || null,
        operation: params.operation,
        model: params.model,
        provider: params.provider,
        promptTokens: params.promptTokens || 0,
        completionTokens: params.completionTokens || 0,
        totalTokens: params.totalTokens,
        cost: params.cost ? Math.round(params.cost * 1000000) : 0, // Convert to micro-cents
        latency: params.latency || 0,
        status: params.status,
        errorMessage: params.errorMessage || null,
        finishReason: params.finishReason || null,
        qualityScore: null,
        userFeedback: null,
        requestMetadata: params.requestMetadata ? JSON.stringify(params.requestMetadata) : null,
        responseMetadata: params.responseMetadata ? JSON.stringify(params.responseMetadata) : null,
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        createdAt: now,
        completedAt: params.status === "success" ? now : null,
      };

      await db.insert(aiUsage).values(usageRecord);
      return { success: true, usageId: usageRecord.id };
    } catch (error) {
      console.error("Failed to track AI usage:", error);
      return { success: false, error: "Failed to track usage" };
    }
  },

  // Provide feedback on AI response quality
  provideFeedback: protectedProcedure
    .use(commonRateLimits.api)
    .input(provideFeedbackSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Verify the usage record exists and belongs to the user
        const usageRecord = await db
          .select({ id: aiUsage.id, userId: aiUsage.userId })
          .from(aiUsage)
          .where(eq(aiUsage.id, input.usageId))
          .limit(1);

        if (usageRecord.length === 0) {
          throw new ORPCError("NOT_FOUND", "Usage record not found");
        }

        if (usageRecord[0].userId !== userId) {
          throw new ORPCError("FORBIDDEN", "You can only provide feedback on your own AI usage");
        }

        // Update the usage record with feedback
        await db
          .update(aiUsage)
          .set({ userFeedback: input.feedback })
          .where(eq(aiUsage.id, input.usageId));

        return {
          success: true,
          message: "Feedback recorded successfully",
          usageId: input.usageId,
          feedback: input.feedback,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Provide feedback error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to record feedback");
      }
    }),

  // Get model performance metrics and analytics
  getModelPerformance: protectedProcedure
    .use(commonRateLimits.api)
    .input(getModelPerformanceSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Build filter conditions
        const conditions = [eq(aiUsage.userId, userId)];
        
        if (input.model) {
          conditions.push(eq(aiUsage.model, input.model));
        }
        
        if (input.provider !== "all") {
          conditions.push(eq(aiUsage.provider, input.provider));
        }
        
        if (input.operation !== "all") {
          conditions.push(eq(aiUsage.operation, input.operation));
        }
        
        if (input.dateFrom) {
          conditions.push(gt(aiUsage.createdAt, new Date(input.dateFrom)));
        }
        
        if (input.dateTo) {
          conditions.push(sql`${aiUsage.createdAt} <= ${new Date(input.dateTo)}`);
        }

        // Get overall performance metrics
        const overallStats = await db
          .select({
            totalRequests: count(),
            totalTokens: sum(aiUsage.totalTokens),
            totalCost: sum(aiUsage.cost),
            avgLatency: avg(aiUsage.latency),
            successRate: sql<number>`CAST(SUM(CASE WHEN ${aiUsage.status} = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100`.as('successRate'),
          })
          .from(aiUsage)
          .where(and(...conditions));

        // Get performance by model
        const modelStats = await db
          .select({
            model: aiUsage.model,
            provider: aiUsage.provider,
            requests: count(),
            tokens: sum(aiUsage.totalTokens),
            cost: sum(aiUsage.cost),
            avgLatency: avg(aiUsage.latency),
            successRate: sql<number>`CAST(SUM(CASE WHEN ${aiUsage.status} = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100`.as('successRate'),
          })
          .from(aiUsage)
          .where(and(...conditions))
          .groupBy(aiUsage.model, aiUsage.provider)
          .orderBy(desc(count()));

        // Get error breakdown
        const errorStats = await db
          .select({
            status: aiUsage.status,
            errorMessage: aiUsage.errorMessage,
            count: count(),
          })
          .from(aiUsage)
          .where(and(...conditions, sql`${aiUsage.status} != 'success'`))
          .groupBy(aiUsage.status, aiUsage.errorMessage)
          .orderBy(desc(count()));

        return {
          overall: {
            totalRequests: overallStats[0]?.totalRequests || 0,
            totalTokens: overallStats[0]?.totalTokens || 0,
            totalCost: (overallStats[0]?.totalCost || 0) / 1000000, // Convert back to dollars
            avgLatency: overallStats[0]?.avgLatency || 0,
            successRate: overallStats[0]?.successRate || 0,
          },
          modelBreakdown: modelStats.map(stat => ({
            ...stat,
            cost: (stat.cost || 0) / 1000000, // Convert back to dollars
          })),
          errors: errorStats,
          filters: {
            model: input.model,
            provider: input.provider,
            operation: input.operation,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
          },
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Get model performance error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve model performance metrics");
      }
    }),

  // Get user's current usage and quota status
  getUserUsageQuota: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUserUsageQuotaSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Calculate date range based on period
        const now = new Date();
        let startDate: Date;
        
        switch (input.period) {
          case "daily":
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case "weekly":
            const dayOfWeek = now.getDay();
            startDate = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
            startDate.setHours(0, 0, 0, 0);
            break;
          case "monthly":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        }

        // Get current period usage
        const currentUsage = await db
          .select({
            totalRequests: count(),
            totalTokens: sum(aiUsage.totalTokens),
            totalCost: sum(aiUsage.cost),
            successfulRequests: sql<number>`SUM(CASE WHEN ${aiUsage.status} = 'success' THEN 1 ELSE 0 END)`.as('successfulRequests'),
          })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.userId, userId),
              gt(aiUsage.createdAt, startDate)
            )
          );

        // Get user preferences for quota limits (mock implementation)
        // In a real implementation, you'd have user-specific quota settings
        const defaultQuotas = {
          daily: { tokens: 50000, cost: 10 * 1000000 }, // $10 in micro-cents
          weekly: { tokens: 200000, cost: 30 * 1000000 }, // $30 in micro-cents
          monthly: { tokens: 500000, cost: 100 * 1000000 }, // $100 in micro-cents
        };

        const quota = defaultQuotas[input.period];
        const usage = currentUsage[0] || { totalRequests: 0, totalTokens: 0, totalCost: 0, successfulRequests: 0 };

        return {
          period: input.period,
          periodStart: startDate.toISOString(),
          periodEnd: now.toISOString(),
          usage: {
            requests: usage.totalRequests,
            tokens: usage.totalTokens || 0,
            cost: (usage.totalCost || 0) / 1000000, // Convert to dollars
            successfulRequests: usage.successfulRequests,
          },
          limits: {
            tokens: quota.tokens,
            cost: quota.cost / 1000000, // Convert to dollars
          },
          remaining: {
            tokens: Math.max(0, quota.tokens - (usage.totalTokens || 0)),
            cost: Math.max(0, (quota.cost - (usage.totalCost || 0)) / 1000000),
          },
          percentageUsed: {
            tokens: Math.min(100, ((usage.totalTokens || 0) / quota.tokens) * 100),
            cost: Math.min(100, ((usage.totalCost || 0) / quota.cost) * 100),
          },
          isNearLimit: {
            tokens: ((usage.totalTokens || 0) / quota.tokens) > 0.8,
            cost: ((usage.totalCost || 0) / quota.cost) > 0.8,
          },
        };
      } catch (error) {
        console.error("Get user usage quota error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to retrieve usage quota information");
      }
    }),

  // Estimate cost for AI operations before execution
  estimateCost: protectedProcedure
    .use(commonRateLimits.api)
    .input(estimateCostSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Mock pricing data - in production, this would come from a pricing service
        const pricingModel = {
          "gpt-4": { input: 0.03, output: 0.06 }, // per 1K tokens
          "gpt-3.5-turbo": { input: 0.001, output: 0.002 },
          "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
          "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
          "text-embedding-ada-002": { input: 0.0001, output: 0 },
          "moderation-latest": { input: 0, output: 0 },
        };

        const modelPricing = pricingModel[input.model as keyof typeof pricingModel];
        
        if (!modelPricing) {
          throw new ORPCError("BAD_REQUEST", `Pricing not available for model: ${input.model}`);
        }

        const inputCost = (input.inputTokens / 1000) * modelPricing.input;
        const outputCost = ((input.outputTokens || 0) / 1000) * modelPricing.output;
        const totalCost = inputCost + outputCost;

        return {
          model: input.model,
          operation: input.operation,
          tokens: {
            input: input.inputTokens,
            output: input.outputTokens || 0,
            total: input.inputTokens + (input.outputTokens || 0),
          },
          cost: {
            input: inputCost,
            output: outputCost,
            total: totalCost,
            currency: "USD",
          },
          pricing: {
            inputPer1K: modelPricing.input,
            outputPer1K: modelPricing.output,
          },
          estimatedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Estimate cost error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to estimate cost");
      }
    }),

  // Bulk content moderation for efficiency
  bulkModeration: protectedProcedure
    .use(commonRateLimits.bulk)
    .input(bulkModerationSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Validate total content length
        const totalLength = input.contents.reduce((sum, content) => sum + content.length, 0);
        if (totalLength > 50000) {
          throw new ORPCError("BAD_REQUEST", "Total content length exceeds maximum for bulk moderation");
        }

        const results = [];
        const startTime = Date.now();

        for (let i = 0; i < input.contents.length; i++) {
          const content = input.contents[i];
          
          // Mock moderation result - in production, this would call actual moderation APIs
          const moderationResult = {
            index: i,
            content: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
            flagged: Math.random() < 0.05, // 5% chance of being flagged for demo
            categories: {
              sexual: false,
              hate: false,
              harassment: false,
              "self-harm": false,
              "sexual/minors": false,
              "hate/threatening": false,
              "violence/graphic": false,
              "self-harm/intent": false,
              "self-harm/instructions": false,
              "harassment/threatening": false,
              violence: false,
            },
            confidence: 0.95 + Math.random() * 0.05,
            processed_at: new Date().toISOString(),
          };

          results.push(moderationResult);

          // Track usage for each moderation
          await this.trackModelUsage({
            userId,
            model: "moderation-latest",
            provider: "openai",
            operation: "moderation",
            totalTokens: Math.floor(content.length / 4),
            cost: 0,
            latency: 50 + Math.random() * 100,
            status: "success",
            requestMetadata: { bulkIndex: i, bulkTotal: input.contents.length },
          });
        }

        const endTime = Date.now();
        const totalFlagged = results.filter(r => r.flagged).length;

        return {
          results,
          summary: {
            totalItems: input.contents.length,
            flaggedItems: totalFlagged,
            cleanItems: input.contents.length - totalFlagged,
            averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
            processingTime: endTime - startTime,
          },
          processedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        console.error("Bulk moderation error:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", "Failed to perform bulk moderation");
      }
    }),
};