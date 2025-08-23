import { protectedProcedure } from "../lib/orpc";
import { db, chat, message, aiUsage, chatAnalytics, userPreferences } from "../db";
import { eq, and, gt, desc, count, sum, avg, sql, max, min } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { commonRateLimits } from "../middleware/rate-limit";
import { ErrorFactory, ErrorLogger, safeAsync } from "../lib/error-handler";

/**
 * Schema definitions for analytics operations
 */

// Get user analytics overview
const getUserAnalyticsSchema = z.object({
  period: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
  timezone: z.string().optional().default("UTC"),
});

// Get detailed chat analytics
const getChatAnalyticsSchema = z.object({
  chatId: z.string().optional(), // If not provided, returns analytics for all chats
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),
  groupBy: z.enum(["hour", "day", "week", "month"]).default("day"),
  metrics: z.array(z.enum([
    "messages", "tokens", "response_time", "user_engagement", "ai_usage", "all"
  ])).default(["all"]),
});

// Get usage trends
const getUsageTrendsSchema = z.object({
  period: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  granularity: z.enum(["hour", "day", "week"]).default("day"),
  compareWithPrevious: z.boolean().default(false),
});

// Get user behavior insights
const getUserBehaviorSchema = z.object({
  analysisType: z.enum([
    "activity_patterns", 
    "feature_usage", 
    "conversation_types",
    "ai_model_preferences",
    "performance_metrics"
  ]),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// Track custom event
const trackEventSchema = z.object({
  eventType: z.string().min(1).max(50),
  eventData: z.record(z.any()).optional(),
  chatId: z.string().optional(),
  messageId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Get performance metrics
const getPerformanceMetricsSchema = z.object({
  scope: z.enum(["user", "system", "chat"]).default("user"),
  chatId: z.string().optional(), // Required if scope is "chat"
  period: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
  metrics: z.array(z.enum([
    "response_times",
    "error_rates", 
    "throughput",
    "user_satisfaction",
    "ai_performance"
  ])).default(["response_times", "error_rates"]),
});

/**
 * Utility functions for analytics calculations
 */

// Calculate date range based on period
function calculateDateRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  let from: Date;

  switch (period) {
    case "24h":
    case "1h":
      from = new Date(now.getTime() - (period === "1h" ? 1 : 24) * 60 * 60 * 1000);
      break;
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default: // "all"
      from = new Date(0); // Beginning of time
  }

  return { from, to };
}

// Calculate engagement score based on various factors
function calculateEngagementScore(metrics: {
  messageCount: number;
  avgResponseTime: number;
  sessionDuration: number;
  returnRate: number;
}): number {
  const messageScore = Math.min(metrics.messageCount / 10, 1) * 30; // Up to 30 points
  const responseScore = Math.max(0, 1 - metrics.avgResponseTime / 10000) * 25; // Up to 25 points
  const durationScore = Math.min(metrics.sessionDuration / 1800, 1) * 25; // Up to 25 points (30 min)
  const returnScore = metrics.returnRate * 20; // Up to 20 points

  return Math.round(messageScore + responseScore + durationScore + returnScore);
}

/**
 * Chat Analytics Router - Provides comprehensive analytics and insights
 * 
 * This router offers detailed analytics capabilities including:
 * - User activity and engagement metrics
 * - Chat performance analytics
 * - AI usage patterns and insights
 * - Custom event tracking
 * - Comparative analysis and trends
 */
export const analyticsRouter = {
  // Get comprehensive user analytics overview
  getUserAnalytics: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUserAnalyticsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        const { from, to } = calculateDateRange(input.period);

        // Get basic user statistics
        const userStats = await db
          .select({
            totalChats: count(chat.id),
            totalMessages: sql<number>`(
              SELECT COUNT(*) 
              FROM ${message} m 
              INNER JOIN ${chat} c ON m.chat_id = c.id 
              WHERE c.user_id = ${userId} AND m.is_deleted = 0
            )`.as('totalMessages'),
            totalTokens: sql<number>`(
              SELECT COALESCE(SUM(total_tokens), 0) 
              FROM ${aiUsage} 
              WHERE user_id = ${userId}
            )`.as('totalTokens'),
            totalCost: sql<number>`(
              SELECT COALESCE(SUM(cost), 0) 
              FROM ${aiUsage} 
              WHERE user_id = ${userId}
            )`.as('totalCost'),
          })
          .from(chat)
          .where(and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            gt(chat.createdAt, from),
            sql`${chat.createdAt} <= ${to}`
          ));

        // Get activity metrics for the period
        const activityMetrics = await db
          .select({
            activeDays: sql<number>`COUNT(DISTINCT DATE(${chat.createdAt}))`.as('activeDays'),
            avgChatsPerDay: sql<number>`CAST(COUNT(*) AS FLOAT) / NULLIF(COUNT(DISTINCT DATE(${chat.createdAt})), 0)`.as('avgChatsPerDay'),
            mostActiveDay: sql<string>`
              SELECT strftime('%w', ${chat.createdAt}) as day_of_week 
              FROM ${chat} 
              WHERE user_id = ${userId} AND is_deleted = 0
              GROUP BY day_of_week 
              ORDER BY COUNT(*) DESC 
              LIMIT 1
            `.as('mostActiveDay'),
          })
          .from(chat)
          .where(and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            gt(chat.createdAt, from),
            sql`${chat.createdAt} <= ${to}`
          ));

        // Get AI usage breakdown
        const aiUsageBreakdown = await db
          .select({
            model: aiUsage.model,
            provider: aiUsage.provider,
            requests: count(),
            tokens: sum(aiUsage.totalTokens),
            cost: sum(aiUsage.cost),
            avgLatency: avg(aiUsage.latency),
          })
          .from(aiUsage)
          .where(and(
            eq(aiUsage.userId, userId),
            gt(aiUsage.createdAt, from),
            sql`${aiUsage.createdAt} <= ${to}`
          ))
          .groupBy(aiUsage.model, aiUsage.provider)
          .orderBy(desc(count()));

        // Get most used chat types
        const chatTypeUsage = await db
          .select({
            chatType: chat.chatType,
            count: count(),
            percentage: sql<number>`CAST(COUNT(*) AS FLOAT) * 100 / (
              SELECT COUNT(*) 
              FROM ${chat} 
              WHERE user_id = ${userId} AND is_deleted = 0
            )`.as('percentage'),
          })
          .from(chat)
          .where(and(
            eq(chat.userId, userId),
            eq(chat.isDeleted, false),
            gt(chat.createdAt, from),
            sql`${chat.createdAt} <= ${to}`
          ))
          .groupBy(chat.chatType)
          .orderBy(desc(count()));

        // Calculate engagement score
        const engagementMetrics = {
          messageCount: userStats[0]?.totalMessages || 0,
          avgResponseTime: 2000, // Mock - would calculate from actual response times
          sessionDuration: 1200, // Mock - would calculate from session data
          returnRate: 0.7, // Mock - would calculate from user return patterns
        };

        const engagementScore = calculateEngagementScore(engagementMetrics);

        return {
          period: {
            from: from.toISOString(),
            to: to.toISOString(),
            description: input.period,
          },
          overview: {
            totalChats: userStats[0]?.totalChats || 0,
            totalMessages: userStats[0]?.totalMessages || 0,
            totalTokens: userStats[0]?.totalTokens || 0,
            totalCost: (userStats[0]?.totalCost || 0) / 1000000, // Convert from micro-cents
            engagementScore,
          },
          activity: {
            activeDays: activityMetrics[0]?.activeDays || 0,
            avgChatsPerDay: Math.round((activityMetrics[0]?.avgChatsPerDay || 0) * 100) / 100,
            mostActiveDay: activityMetrics[0]?.mostActiveDay || "0",
          },
          aiUsage: aiUsageBreakdown.map(usage => ({
            ...usage,
            cost: (usage.cost || 0) / 1000000, // Convert from micro-cents
          })),
          chatTypes: chatTypeUsage,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "analytics query",
          "user analytics",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "retrieve",
          "user analytics",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Get detailed chat analytics
  getChatAnalytics: protectedProcedure
    .use(commonRateLimits.api)
    .input(getChatAnalyticsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Parse date range
        const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

        // Build base conditions
        let conditions = [
          eq(chat.userId, userId),
          eq(chat.isDeleted, false),
          gt(chat.createdAt, dateFrom),
          sql`${chat.createdAt} <= ${dateTo}`,
        ];

        // Add chat-specific filter if provided
        if (input.chatId) {
          // Verify user owns the chat
          const chatExists = await db
            .select({ id: chat.id })
            .from(chat)
            .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId)))
            .limit(1);

          if (chatExists.length === 0) {
            throw ErrorFactory.resourceNotFound("Chat", input.chatId, context).toORPCError();
          }

          conditions.push(eq(chat.id, input.chatId));
        }

        // Get message analytics
        const messageAnalytics = await db
          .select({
            chatId: message.chatId,
            chatTitle: chat.title,
            messageCount: count(message.id),
            avgTokensPerMessage: avg(message.tokenCount),
            userMessages: sql<number>`SUM(CASE WHEN ${message.role} = 'user' THEN 1 ELSE 0 END)`.as('userMessages'),
            assistantMessages: sql<number>`SUM(CASE WHEN ${message.role} = 'assistant' THEN 1 ELSE 0 END)`.as('assistantMessages'),
            firstMessage: min(message.createdAt),
            lastMessage: max(message.createdAt),
          })
          .from(message)
          .innerJoin(chat, eq(message.chatId, chat.id))
          .where(and(
            ...conditions,
            eq(message.isDeleted, false),
            gt(message.createdAt, dateFrom),
            sql`${message.createdAt} <= ${dateTo}`
          ))
          .groupBy(message.chatId, chat.title)
          .orderBy(desc(count(message.id)));

        // Get AI usage analytics for these chats
        const aiAnalytics = input.chatId 
          ? await db
              .select({
                chatId: aiUsage.chatId,
                totalRequests: count(),
                totalTokens: sum(aiUsage.totalTokens),
                totalCost: sum(aiUsage.cost),
                avgLatency: avg(aiUsage.latency),
                successRate: sql<number>`CAST(SUM(CASE WHEN ${aiUsage.status} = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100`.as('successRate'),
              })
              .from(aiUsage)
              .where(and(
                eq(aiUsage.userId, userId),
                eq(aiUsage.chatId, input.chatId),
                gt(aiUsage.createdAt, dateFrom),
                sql`${aiUsage.createdAt} <= ${dateTo}`
              ))
              .groupBy(aiUsage.chatId)
          : [];

        // Get trend data based on groupBy parameter
        const trendData = await this.getTrendData(
          userId,
          dateFrom,
          dateTo,
          input.groupBy,
          input.chatId
        );

        return {
          dateRange: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
          },
          chatId: input.chatId,
          groupBy: input.groupBy,
          messageAnalytics: messageAnalytics.map(analytics => ({
            ...analytics,
            conversationDuration: analytics.firstMessage && analytics.lastMessage
              ? new Date(analytics.lastMessage).getTime() - new Date(analytics.firstMessage).getTime()
              : 0,
            turnRatio: analytics.userMessages && analytics.assistantMessages
              ? analytics.assistantMessages / analytics.userMessages
              : 0,
          })),
          aiAnalytics: aiAnalytics.map(analytics => ({
            ...analytics,
            cost: (analytics.totalCost || 0) / 1000000, // Convert from micro-cents
          })),
          trends: trendData,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ErrorFactory.constructor) {
          throw error;
        }
        ErrorLogger.log(ErrorFactory.databaseError(
          "chat analytics query",
          "chat analytics",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "retrieve",
          "chat analytics",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Get usage trends with comparison
  getUsageTrends: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUsageTrendsSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        const { from, to } = calculateDateRange(input.period);
        
        // Get current period data
        const currentPeriodData = await this.getTrendData(
          userId,
          from,
          to,
          input.granularity
        );

        // Get previous period data for comparison if requested
        let previousPeriodData = null;
        let comparison = null;

        if (input.compareWithPrevious) {
          const periodDuration = to.getTime() - from.getTime();
          const previousFrom = new Date(from.getTime() - periodDuration);
          const previousTo = from;

          previousPeriodData = await this.getTrendData(
            userId,
            previousFrom,
            previousTo,
            input.granularity
          );

          // Calculate comparison metrics
          const currentTotal = currentPeriodData.reduce((sum, item) => sum + item.value, 0);
          const previousTotal = previousPeriodData.reduce((sum, item) => sum + item.value, 0);
          
          comparison = {
            currentPeriod: currentTotal,
            previousPeriod: previousTotal,
            change: currentTotal - previousTotal,
            changePercentage: previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0,
            trend: currentTotal > previousTotal ? "up" : currentTotal < previousTotal ? "down" : "stable",
          };
        }

        return {
          period: input.period,
          granularity: input.granularity,
          dateRange: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
          currentPeriod: currentPeriodData,
          previousPeriod: previousPeriodData,
          comparison,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "usage trends query",
          "usage trends",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "retrieve",
          "usage trends",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Get user behavior insights
  getUserBehavior: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUserBehaviorSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

        let insights: any = {
          analysisType: input.analysisType,
          dateRange: {
            from: dateFrom.toISOString(),
            to: dateTo.toISOString(),
          },
        };

        switch (input.analysisType) {
          case "activity_patterns":
            insights.data = await this.getActivityPatterns(userId, dateFrom, dateTo);
            break;
          case "feature_usage":
            insights.data = await this.getFeatureUsage(userId, dateFrom, dateTo);
            break;
          case "conversation_types":
            insights.data = await this.getConversationTypes(userId, dateFrom, dateTo);
            break;
          case "ai_model_preferences":
            insights.data = await this.getAIModelPreferences(userId, dateFrom, dateTo);
            break;
          case "performance_metrics":
            insights.data = await this.getPerformanceInsights(userId, dateFrom, dateTo);
            break;
        }

        insights.generatedAt = new Date().toISOString();
        return insights;
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "user behavior query",
          "user behavior insights",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "retrieve",
          "user behavior insights",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Track custom events
  trackEvent: protectedProcedure
    .use(commonRateLimits.api)
    .input(trackEventSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Validate chat/message ownership if provided
        if (input.chatId) {
          const chatExists = await db
            .select({ id: chat.id })
            .from(chat)
            .where(and(eq(chat.id, input.chatId), eq(chat.userId, userId)))
            .limit(1);

          if (chatExists.length === 0) {
            throw ErrorFactory.resourceNotFound("Chat", input.chatId, context).toORPCError();
          }
        }

        if (input.messageId) {
          const messageExists = await db
            .select({ id: message.id, chatId: message.chatId })
            .from(message)
            .innerJoin(chat, eq(message.chatId, chat.id))
            .where(and(
              eq(message.id, input.messageId),
              eq(chat.userId, userId)
            ))
            .limit(1);

          if (messageExists.length === 0) {
            throw ErrorFactory.resourceNotFound("Message", input.messageId, context).toORPCError();
          }
        }

        // For now, we'll log the event - in production, you'd store in an events table
        const eventData = {
          id: nanoid(),
          userId,
          eventType: input.eventType,
          eventData: input.eventData,
          chatId: input.chatId,
          messageId: input.messageId,
          metadata: input.metadata,
          timestamp: now,
          userAgent: context.userAgent,
          ipAddress: context.ip,
        };

        // TODO: Store in events table when implemented
        console.log("Custom event tracked:", eventData);

        return {
          success: true,
          eventId: eventData.id,
          eventType: input.eventType,
          timestamp: now.toISOString(),
        };
      } catch (error) {
        if (error instanceof ErrorFactory.constructor) {
          throw error;
        }
        ErrorLogger.log(ErrorFactory.databaseError(
          "track event",
          "custom events",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "track",
          "custom event",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Internal helper methods for analytics calculations
  async getTrendData(
    userId: string, 
    from: Date, 
    to: Date, 
    granularity: string, 
    chatId?: string
  ): Promise<Array<{ date: string; value: number; label: string }>> {
    // This would implement actual trend calculation
    // For now, returning mock data structure
    const mockData = [];
    const period = to.getTime() - from.getTime();
    const intervals = granularity === "hour" ? 24 : granularity === "day" ? 7 : 4;
    
    for (let i = 0; i < intervals; i++) {
      const date = new Date(from.getTime() + (period / intervals) * i);
      mockData.push({
        date: date.toISOString(),
        value: Math.floor(Math.random() * 100),
        label: granularity === "hour" 
          ? date.toLocaleTimeString()
          : date.toLocaleDateString(),
      });
    }
    
    return mockData;
  },

  async getActivityPatterns(userId: string, from: Date, to: Date) {
    // Mock implementation - would analyze actual user activity patterns
    return {
      peakHours: [9, 14, 20], // Hours of highest activity
      weekdayActivity: {
        weekdays: 75, // Percentage
        weekends: 25,
      },
      averageSessionDuration: 1800, // seconds
      conversationStarters: ["How", "What", "Can you"],
    };
  },

  async getFeatureUsage(userId: string, from: Date, to: Date) {
    // Mock implementation - would analyze feature usage
    return {
      mostUsedFeatures: [
        { feature: "chat", usage: 85 },
        { feature: "search", usage: 45 },
        { feature: "export", usage: 15 },
      ],
      advancedFeatures: {
        used: 3,
        available: 10,
        adoption: 30, // percentage
      },
    };
  },

  async getConversationTypes(userId: string, from: Date, to: Date) {
    // Mock implementation - would analyze conversation patterns
    return {
      types: [
        { type: "question_answer", percentage: 60 },
        { type: "creative_writing", percentage: 25 },
        { type: "code_assistance", percentage: 15 },
      ],
      averageLength: {
        messages: 8,
        tokens: 150,
      },
    };
  },

  async getAIModelPreferences(userId: string, from: Date, to: Date) {
    // Get actual AI model usage from aiUsage table
    return await db
      .select({
        model: aiUsage.model,
        provider: aiUsage.provider,
        usage: count(),
        preference: sql<number>`CAST(COUNT(*) AS FLOAT) * 100 / (
          SELECT COUNT(*) FROM ${aiUsage} WHERE user_id = ${userId}
        )`.as('preference'),
      })
      .from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        gt(aiUsage.createdAt, from),
        sql`${aiUsage.createdAt} <= ${to}`
      ))
      .groupBy(aiUsage.model, aiUsage.provider)
      .orderBy(desc(count()));
  },

  async getPerformanceInsights(userId: string, from: Date, to: Date) {
    // Mock implementation - would analyze performance metrics
    return {
      averageResponseTime: 2500, // ms
      errorRate: 2.5, // percentage
      satisfactionScore: 8.5, // out of 10
      recommendations: [
        "Consider using faster AI models for simple queries",
        "Your usage patterns suggest you'd benefit from the premium plan",
      ],
    };
  },
};