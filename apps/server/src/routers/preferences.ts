import { protectedProcedure } from "../lib/orpc";
import { db, userPreferences, syncEvent } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { commonRateLimits } from "../middleware/rate-limit";
import { ErrorFactory, ErrorLogger, safeAsync } from "../lib/error-handler";

/**
 * Schema definitions for user preferences operations
 */

// Get user preferences (no input needed - uses session user ID)
const getUserPreferencesSchema = z.object({}).optional();

// Update user preferences with partial updates
const updateUserPreferencesSchema = z.object({
  // UI/UX preferences
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.string().optional(),
  fontSize: z.enum(["small", "medium", "large"]).optional(),
  compactMode: z.boolean().optional(),
  
  // Chat preferences
  defaultChatType: z.enum(["conversation", "assistant", "group", "system"]).optional(),
  autoSaveChats: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
  enableNotifications: z.boolean().optional(),
  
  // AI behavior preferences
  defaultModel: z.string().optional(),
  temperature: z.number().min(0).max(100).optional(), // 0-100 scale
  maxTokens: z.number().min(1).max(8192).optional(),
  contextWindow: z.number().min(1024).max(32768).optional(),
  
  // Privacy and data preferences
  allowAnalytics: z.boolean().optional(),
  allowDataSharing: z.boolean().optional(),
  retentionPeriod: z.number().min(1).max(3650).optional(), // 1 day to 10 years
  
  // Export/import preferences
  exportFormat: z.enum(["json", "markdown", "txt"]).optional(),
  includeMetadata: z.boolean().optional(),
  
  // Custom preferences (JSON for extensibility)
  customSettings: z.record(z.any()).optional(),
});

// Reset preferences to defaults
const resetPreferencesSchema = z.object({
  categories: z.array(z.enum([
    "ui",
    "chat", 
    "ai",
    "privacy",
    "export",
    "custom",
    "all"
  ])).min(1).optional().default(["all"]),
});

// Import/export preferences
const exportPreferencesSchema = z.object({
  format: z.enum(["json", "yaml"]).default("json"),
  includeDefaults: z.boolean().default(false),
});

const importPreferencesSchema = z.object({
  preferences: z.record(z.any()),
  overwrite: z.boolean().default(false), // Whether to overwrite existing preferences
  validate: z.boolean().default(true), // Whether to validate imported preferences
});

// Bulk update multiple users' preferences (admin only - for future use)
const bulkUpdatePreferencesSchema = z.object({
  userIds: z.array(z.string()).min(1).max(50),
  preferences: updateUserPreferencesSchema,
  overwrite: z.boolean().default(false),
});

/**
 * Default preferences configuration
 */
const defaultPreferences = {
  // UI/UX preferences
  theme: "system" as const,
  language: "en",
  fontSize: "medium" as const,
  compactMode: false,
  
  // Chat preferences
  defaultChatType: "conversation" as const,
  autoSaveChats: true,
  showTimestamps: true,
  enableNotifications: true,
  
  // AI behavior preferences
  defaultModel: "gpt-4",
  temperature: 70, // 0-100 scale (0.7 in 0-1 scale)
  maxTokens: 2048,
  contextWindow: 8192,
  
  // Privacy and data preferences
  allowAnalytics: true,
  allowDataSharing: false,
  retentionPeriod: 365, // days
  
  // Export/import preferences
  exportFormat: "json" as const,
  includeMetadata: true,
  
  // Custom preferences
  customSettings: null,
};

/**
 * User Preferences Router - Handles all user preference management operations
 * 
 * This router provides comprehensive user preference functionality with:
 * - Secure preference management with user isolation
 * - Comprehensive validation and error handling
 * - Sync event tracking for cross-device consistency
 * - Import/export capabilities
 * - Bulk operations for administrative use
 */
export const preferencesRouter = {
  // Get user preferences (creates defaults if none exist)
  getUserPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .input(getUserPreferencesSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Try to get existing preferences
        const existingPreferences = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        if (existingPreferences.length > 0) {
          const prefs = existingPreferences[0];
          
          // Parse custom settings if they exist
          const customSettings = prefs.customSettings 
            ? JSON.parse(prefs.customSettings) 
            : null;

          return {
            ...prefs,
            customSettings,
            isDefault: false,
          };
        }

        // Create default preferences if none exist
        const now = new Date();
        const newPreferences = {
          id: nanoid(),
          userId,
          ...defaultPreferences,
          customSettings: null, // Store as null in DB
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(userPreferences).values(newPreferences);

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "preference",
          entityId: newPreferences.id,
          operation: "create",
          data: JSON.stringify(newPreferences),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          ...newPreferences,
          customSettings: null, // Return as null for consistency
          isDefault: true,
        };
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "select/insert",
          "userPreferences",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "retrieve",
          "user preferences",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Update user preferences (partial updates supported)
  updateUserPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .input(updateUserPreferencesSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Get existing preferences or create defaults
        let existingPreferences = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        let preferencesId: string;
        let isNewRecord = false;

        if (existingPreferences.length === 0) {
          // Create new preferences record with defaults + updates
          preferencesId = nanoid();
          isNewRecord = true;
          
          const newPreferences = {
            id: preferencesId,
            userId,
            ...defaultPreferences,
            ...input,
            customSettings: input.customSettings ? JSON.stringify(input.customSettings) : null,
            createdAt: now,
            updatedAt: now,
          };

          await db.insert(userPreferences).values(newPreferences);
        } else {
          // Update existing preferences
          preferencesId = existingPreferences[0].id;
          
          const updates: any = {
            ...input,
            customSettings: input.customSettings ? JSON.stringify(input.customSettings) : undefined,
            updatedAt: now,
          };

          // Remove undefined values
          Object.keys(updates).forEach(key => {
            if (updates[key] === undefined) {
              delete updates[key];
            }
          });

          if (Object.keys(updates).length === 1) { // Only updatedAt
            return {
              success: true,
              message: "No changes to apply",
              updated: false,
            };
          }

          await db
            .update(userPreferences)
            .set(updates)
            .where(eq(userPreferences.id, preferencesId));
        }

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "preference",
          entityId: preferencesId,
          operation: isNewRecord ? "create" : "update",
          data: JSON.stringify({
            id: preferencesId,
            ...input,
            updatedAt: now,
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          message: `Preferences ${isNewRecord ? 'created' : 'updated'} successfully`,
          updated: true,
          preferencesId,
        };
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "update",
          "userPreferences",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "update",
          "user preferences",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Reset preferences to defaults
  resetPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .input(resetPreferencesSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Get existing preferences
        const existingPreferences = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        if (existingPreferences.length === 0) {
          throw ErrorFactory.resourceNotFound("User preferences", userId, context).toORPCError();
        }

        const preferencesId = existingPreferences[0].id;

        // Determine which categories to reset
        const categoriesToReset = input.categories || ["all"];
        const resetAll = categoriesToReset.includes("all");

        // Build reset object based on categories
        const resetUpdates: any = { updatedAt: now };

        if (resetAll || categoriesToReset.includes("ui")) {
          resetUpdates.theme = defaultPreferences.theme;
          resetUpdates.language = defaultPreferences.language;
          resetUpdates.fontSize = defaultPreferences.fontSize;
          resetUpdates.compactMode = defaultPreferences.compactMode;
        }

        if (resetAll || categoriesToReset.includes("chat")) {
          resetUpdates.defaultChatType = defaultPreferences.defaultChatType;
          resetUpdates.autoSaveChats = defaultPreferences.autoSaveChats;
          resetUpdates.showTimestamps = defaultPreferences.showTimestamps;
          resetUpdates.enableNotifications = defaultPreferences.enableNotifications;
        }

        if (resetAll || categoriesToReset.includes("ai")) {
          resetUpdates.defaultModel = defaultPreferences.defaultModel;
          resetUpdates.temperature = defaultPreferences.temperature;
          resetUpdates.maxTokens = defaultPreferences.maxTokens;
          resetUpdates.contextWindow = defaultPreferences.contextWindow;
        }

        if (resetAll || categoriesToReset.includes("privacy")) {
          resetUpdates.allowAnalytics = defaultPreferences.allowAnalytics;
          resetUpdates.allowDataSharing = defaultPreferences.allowDataSharing;
          resetUpdates.retentionPeriod = defaultPreferences.retentionPeriod;
        }

        if (resetAll || categoriesToReset.includes("export")) {
          resetUpdates.exportFormat = defaultPreferences.exportFormat;
          resetUpdates.includeMetadata = defaultPreferences.includeMetadata;
        }

        if (resetAll || categoriesToReset.includes("custom")) {
          resetUpdates.customSettings = null;
        }

        // Apply the reset
        await db
          .update(userPreferences)
          .set(resetUpdates)
          .where(eq(userPreferences.id, preferencesId));

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "preference",
          entityId: preferencesId,
          operation: "update",
          data: JSON.stringify({
            id: preferencesId,
            resetCategories: categoriesToReset,
            ...resetUpdates,
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          message: `Preferences reset successfully for categories: ${categoriesToReset.join(", ")}`,
          resetCategories: categoriesToReset,
          preferencesId,
        };
      } catch (error) {
        if (error instanceof ErrorFactory.constructor) {
          throw error;
        }
        ErrorLogger.log(ErrorFactory.databaseError(
          "reset",
          "userPreferences",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "reset",
          "user preferences",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Export user preferences
  exportPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .input(exportPreferencesSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;

      try {
        // Get user preferences
        const preferences = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        const prefsData = preferences.length > 0 
          ? preferences[0] 
          : { ...defaultPreferences, userId };

        // Parse custom settings
        if (prefsData.customSettings) {
          try {
            prefsData.customSettings = JSON.parse(prefsData.customSettings);
          } catch {
            prefsData.customSettings = null;
          }
        }

        // Remove internal fields
        const exportData = {
          ...prefsData,
          id: undefined,
          userId: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        };

        // Remove undefined/null values unless includeDefaults is true
        if (!input.includeDefaults) {
          Object.keys(exportData).forEach(key => {
            if (exportData[key] === undefined || exportData[key] === null) {
              delete exportData[key];
            }
          });
        }

        const exportResult = {
          format: input.format,
          exportedAt: new Date().toISOString(),
          version: "1.0",
          preferences: exportData,
        };

        if (input.format === "yaml") {
          // Simple YAML conversion - in production, use a proper YAML library
          const yamlData = Object.entries(exportResult.preferences)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');
          
          return {
            ...exportResult,
            data: `# User Preferences Export\n# Exported at: ${exportResult.exportedAt}\n# Version: ${exportResult.version}\n\n${yamlData}`,
            filename: `preferences_${Date.now()}.yaml`,
          };
        }

        return {
          ...exportResult,
          data: JSON.stringify(exportResult, null, 2),
          filename: `preferences_${Date.now()}.json`,
        };
      } catch (error) {
        ErrorLogger.log(ErrorFactory.databaseError(
          "export",
          "userPreferences",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "export",
          "user preferences",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Import user preferences
  importPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .input(importPreferencesSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session!.user.id;
      const now = new Date();

      try {
        // Validate imported preferences if requested
        if (input.validate) {
          try {
            updateUserPreferencesSchema.parse(input.preferences);
          } catch (validationError) {
            throw ErrorFactory.invalidInput(
              "Invalid preferences format",
              { validationError: validationError.message },
              context
            ).toORPCError();
          }
        }

        // Get existing preferences
        const existingPreferences = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);

        let preferencesId: string;
        let isNewRecord = false;

        if (existingPreferences.length === 0) {
          // Create new preferences
          preferencesId = nanoid();
          isNewRecord = true;
          
          const newPreferences = {
            id: preferencesId,
            userId,
            ...defaultPreferences,
            ...input.preferences,
            customSettings: input.preferences.customSettings 
              ? JSON.stringify(input.preferences.customSettings) 
              : null,
            createdAt: now,
            updatedAt: now,
          };

          await db.insert(userPreferences).values(newPreferences);
        } else {
          // Update existing preferences
          preferencesId = existingPreferences[0].id;
          
          let updates: any;
          
          if (input.overwrite) {
            // Overwrite completely with imported preferences
            updates = {
              ...defaultPreferences,
              ...input.preferences,
              customSettings: input.preferences.customSettings 
                ? JSON.stringify(input.preferences.customSettings) 
                : null,
              updatedAt: now,
            };
          } else {
            // Merge with existing preferences
            updates = {
              ...input.preferences,
              customSettings: input.preferences.customSettings 
                ? JSON.stringify(input.preferences.customSettings) 
                : undefined,
              updatedAt: now,
            };

            // Remove undefined values
            Object.keys(updates).forEach(key => {
              if (updates[key] === undefined) {
                delete updates[key];
              }
            });
          }

          await db
            .update(userPreferences)
            .set(updates)
            .where(eq(userPreferences.id, preferencesId));
        }

        // Create sync event
        await db.insert(syncEvent).values({
          id: nanoid(),
          entityType: "preference",
          entityId: preferencesId,
          operation: isNewRecord ? "create" : "update",
          data: JSON.stringify({
            id: preferencesId,
            imported: true,
            overwrite: input.overwrite,
            ...input.preferences,
            updatedAt: now,
          }),
          timestamp: now,
          userId,
          deviceId: "server",
          synced: true,
        });

        return {
          success: true,
          message: `Preferences ${isNewRecord ? 'created' : 'updated'} from import`,
          imported: true,
          overwrite: input.overwrite,
          preferencesId,
          importedKeys: Object.keys(input.preferences),
        };
      } catch (error) {
        if (error instanceof ErrorFactory.constructor) {
          throw error;
        }
        ErrorLogger.log(ErrorFactory.databaseError(
          "import",
          "userPreferences",
          error as Error,
          context
        ));
        throw ErrorFactory.databaseError(
          "import",
          "user preferences",
          error as Error,
          context
        ).toORPCError();
      }
    }),

  // Get default preferences (useful for UI to show defaults)
  getDefaultPreferences: protectedProcedure
    .use(commonRateLimits.api)
    .handler(async ({ context }) => {
      return {
        preferences: defaultPreferences,
        version: "1.0",
        categories: {
          ui: ["theme", "language", "fontSize", "compactMode"],
          chat: ["defaultChatType", "autoSaveChats", "showTimestamps", "enableNotifications"],
          ai: ["defaultModel", "temperature", "maxTokens", "contextWindow"],
          privacy: ["allowAnalytics", "allowDataSharing", "retentionPeriod"],
          export: ["exportFormat", "includeMetadata"],
          custom: ["customSettings"],
        },
        generatedAt: new Date().toISOString(),
      };
    }),
};