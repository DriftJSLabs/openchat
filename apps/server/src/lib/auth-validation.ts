import { z } from "zod";

/**
 * Comprehensive Zod validation schemas for authentication and user management
 * These schemas provide input validation, sanitization, and type safety for all auth operations
 */

// Base user validation schemas
export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email must be less than 255 characters")
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be less than 128 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character"
  );

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters long")
  .max(30, "Username must be less than 30 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens"
  )
  .toLowerCase()
  .trim();

export const displayNameSchema = z
  .string()
  .min(1, "Display name cannot be empty")
  .max(50, "Display name must be less than 50 characters")
  .trim()
  .optional();

export const bioSchema = z
  .string()
  .max(500, "Bio must be less than 500 characters")
  .trim()
  .optional();

export const statusSchema = z.enum(["online", "away", "busy", "invisible", "offline"]);

export const customStatusSchema = z
  .string()
  .max(100, "Custom status must be less than 100 characters")
  .trim()
  .optional();

// User registration schema
export const userRegistrationSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be less than 100 characters")
      .trim(),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    username: usernameSchema.optional(),
    displayName: displayNameSchema,
    bio: bioSchema,
    timezone: z
      .string()
      .max(50, "Timezone must be less than 50 characters")
      .optional(),
    language: z
      .string()
      .length(2, "Language must be a 2-character ISO code")
      .default("en"),
    // Privacy preferences
    isPrivate: z.boolean().default(false),
    allowFriendRequests: z.boolean().default(true),
    allowDirectMessages: z.boolean().default(true),
    showOnlineStatus: z.boolean().default(true),
    emailNotifications: z.boolean().default(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .transform((data) => {
    // Remove confirmPassword from the final object
    const { confirmPassword, ...rest } = data;
    return rest;
  });

// User login schema
export const userLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must be less than 128 characters"),
  rememberMe: z.boolean().default(false),
  deviceName: z
    .string()
    .max(100, "Device name must be less than 100 characters")
    .optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "web"]).optional(),
});

// Password reset schemas
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// User profile update schema
export const userProfileUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .trim()
    .optional(),
  username: usernameSchema.optional(),
  displayName: displayNameSchema,
  bio: bioSchema,
  location: z
    .string()
    .max(100, "Location must be less than 100 characters")
    .trim()
    .optional(),
  website: z
    .string()
    .url("Invalid website URL")
    .max(255, "Website URL must be less than 255 characters")
    .optional(),
  avatar: z
    .string()
    .url("Invalid avatar URL")
    .max(500, "Avatar URL must be less than 500 characters")
    .optional(),
  timezone: z
    .string()
    .max(50, "Timezone must be less than 50 characters")
    .optional(),
  language: z
    .string()
    .length(2, "Language must be a 2-character ISO code")
    .optional(),
});

// User status update schema
export const userStatusUpdateSchema = z.object({
  status: statusSchema,
  customStatus: customStatusSchema,
});

// Privacy settings update schema
export const privacySettingsUpdateSchema = z.object({
  isPrivate: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  showOnlineStatus: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
});

// User relationship schemas
export const relationshipTypeSchema = z.enum(["friend", "blocked", "following", "muted", "favorite"]);

export const relationshipStatusSchema = z.enum(["pending", "accepted", "declined", "active"]);

export const createRelationshipSchema = z.object({
  toUserId: z.string().uuid("Invalid user ID"),
  relationshipType: relationshipTypeSchema,
  metadata: z
    .string()
    .max(1000, "Metadata must be less than 1000 characters")
    .optional(),
});

export const updateRelationshipSchema = z.object({
  status: relationshipStatusSchema.optional(),
  metadata: z
    .string()
    .max(1000, "Metadata must be less than 1000 characters")
    .optional(),
});

// User presence schemas
export const updatePresenceSchema = z.object({
  status: statusSchema,
  customStatus: customStatusSchema,
  deviceId: z
    .string()
    .max(255, "Device ID must be less than 255 characters")
    .optional(),
  platform: z.enum(["web", "mobile", "desktop", "tablet"]).optional(),
  appVersion: z
    .string()
    .max(50, "App version must be less than 50 characters")
    .optional(),
});

export const typingIndicatorSchema = z.object({
  chatId: z.string().uuid("Invalid chat ID"),
  isTyping: z.boolean(),
});

// Session management schemas
export const createSessionSchema = z.object({
  deviceFingerprint: z
    .string()
    .max(255, "Device fingerprint must be less than 255 characters")
    .optional(),
  deviceName: z
    .string()
    .max(100, "Device name must be less than 100 characters")
    .optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "web"]).optional(),
  isTrusted: z.boolean().default(false),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID").optional(),
  revokeAll: z.boolean().default(false),
  reason: z
    .string()
    .max(255, "Revoke reason must be less than 255 characters")
    .optional(),
});

// Search and filter schemas
export const userSearchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(100, "Search query must be less than 100 characters")
    .trim(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
  includeBlocked: z.boolean().default(false),
  includeMuted: z.boolean().default(true),
});

export const relationshipFilterSchema = z.object({
  relationshipType: relationshipTypeSchema.optional(),
  status: relationshipStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Bulk operations schemas
export const bulkUserActionSchema = z.object({
  userIds: z
    .array(z.string().uuid("Invalid user ID"))
    .min(1, "At least one user ID is required")
    .max(100, "Cannot perform bulk action on more than 100 users"),
  action: z.enum(["block", "unblock", "mute", "unmute", "favorite", "unfavorite"]),
});

// Two-factor authentication schemas
export const enable2FASchema = z.object({
  password: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password must be less than 128 characters"),
});

export const verify2FASchema = z.object({
  code: z
    .string()
    .length(6, "2FA code must be 6 digits")
    .regex(/^\d{6}$/, "2FA code must contain only numbers"),
});

export const disable2FASchema = z.object({
  password: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password must be less than 128 characters"),
  code: z
    .string()
    .length(6, "2FA code must be 6 digits")
    .regex(/^\d{6}$/, "2FA code must contain only numbers"),
});

// Account security schemas
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .max(128, "Password must be less than 128 characters"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password must be less than 128 characters"),
  confirmationText: z
    .string()
    .refine((val) => val === "DELETE MY ACCOUNT", {
      message: "You must type 'DELETE MY ACCOUNT' to confirm account deletion",
    }),
  reason: z
    .string()
    .max(500, "Reason must be less than 500 characters")
    .optional(),
});

// ID validation helpers
export const userIdSchema = z.string().uuid("Invalid user ID");
export const sessionIdSchema = z.string().uuid("Invalid session ID");
export const relationshipIdSchema = z.string().uuid("Invalid relationship ID");

// Pagination helpers
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Export combined schemas for common operations
export const authSchemas = {
  // Authentication
  userRegistration: userRegistrationSchema,
  userLogin: userLoginSchema,
  passwordResetRequest: passwordResetRequestSchema,
  passwordReset: passwordResetSchema,
  
  // Profile management
  userProfileUpdate: userProfileUpdateSchema,
  userStatusUpdate: userStatusUpdateSchema,
  privacySettingsUpdate: privacySettingsUpdateSchema,
  
  // Relationships
  createRelationship: createRelationshipSchema,
  updateRelationship: updateRelationshipSchema,
  relationshipFilter: relationshipFilterSchema,
  bulkUserAction: bulkUserActionSchema,
  
  // Presence and sessions
  updatePresence: updatePresenceSchema,
  typingIndicator: typingIndicatorSchema,
  createSession: createSessionSchema,
  revokeSession: revokeSessionSchema,
  
  // Security
  changePassword: changePasswordSchema,
  enable2FA: enable2FASchema,
  verify2FA: verify2FASchema,
  disable2FA: disable2FASchema,
  deleteAccount: deleteAccountSchema,
  
  // Search and filters
  userSearch: userSearchSchema,
  pagination: paginationSchema,
  
  // ID validation
  userId: userIdSchema,
  sessionId: sessionIdSchema,
  relationshipId: relationshipIdSchema,
} as const;

// Type exports for use in other files
export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;
export type UserStatusUpdate = z.infer<typeof userStatusUpdateSchema>;
export type PrivacySettingsUpdate = z.infer<typeof privacySettingsUpdateSchema>;
export type CreateRelationship = z.infer<typeof createRelationshipSchema>;
export type UpdateRelationship = z.infer<typeof updateRelationshipSchema>;
export type UpdatePresence = z.infer<typeof updatePresenceSchema>;
export type TypingIndicator = z.infer<typeof typingIndicatorSchema>;
export type UserSearch = z.infer<typeof userSearchSchema>;
export type RelationshipFilter = z.infer<typeof relationshipFilterSchema>;
export type BulkUserAction = z.infer<typeof bulkUserActionSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;