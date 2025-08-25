import { pgTable, text, timestamp, boolean, uuid, integer, index } from "drizzle-orm/pg-core";

/**
 * Enhanced user table with comprehensive profile and status management
 * Supports both authentication and social features like online status, bio, etc.
 */
export const user = pgTable("user", {
  // Core authentication fields
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  
  // Enhanced profile fields for chat application
  username: text("username").unique(), // Optional unique username for @mentions
  displayName: text("display_name"), // Optional display name different from full name
  bio: text("bio"), // User biography/status message
  location: text("location"), // User location (optional)
  website: text("website"), // User website URL
  avatar: text("avatar"), // Chat-specific avatar URL
  timezone: text("timezone"), // User's timezone for proper time display
  language: text("language").default("en"), // User's preferred language
  
  // Status and presence management
  isOnline: boolean("is_online").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  lastActiveAt: timestamp("last_active_at"), // More granular activity tracking
  status: text("status", { 
    enum: ["online", "away", "busy", "invisible", "offline"] 
  }).default("offline"),
  customStatus: text("custom_status"), // Custom status message
  
  // Account management and security
  isActive: boolean("is_active").default(true), // Account active/suspended
  isDeleted: boolean("is_deleted").default(false), // Soft delete flag
  deletedAt: timestamp("deleted_at"), // When account was deleted
  isVerified: boolean("is_verified").default(false), // Verified account badge
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  isSuspended: boolean("is_suspended").default(false),
  suspendedUntil: timestamp("suspended_until"),
  loginCount: integer("login_count").default(0),
  
  // Privacy and notification settings
  isPrivate: boolean("is_private").default(false), // Private profile
  allowFriendRequests: boolean("allow_friend_requests").default(true),
  allowDirectMessages: boolean("allow_direct_messages").default(true),
  showOnlineStatus: boolean("show_online_status").default(true),
  emailNotifications: boolean("email_notifications").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes for common lookups
  emailIdx: index("user_email_idx").on(table.email),
  usernameIdx: index("user_username_idx").on(table.username),
  statusIdx: index("user_status_idx").on(table.status),
  lastSeenIdx: index("user_last_seen_idx").on(table.lastSeenAt),
  lastActiveIdx: index("user_last_active_idx").on(table.lastActiveAt),
  activeIdx: index("user_active_idx").on(table.isActive, table.isDeleted),
}));

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports for authentication schemas
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

export type InsertUser = typeof user.$inferInsert;
export type InsertSession = typeof session.$inferInsert;
export type InsertAccount = typeof account.$inferInsert;
export type InsertVerification = typeof verification.$inferInsert;

/**
 * User relationships table for managing social connections
 * Supports friends, blocking, following, muting, and favoriting users
 */
/**
 * User presence tracking for real-time chat features
 * Tracks online status, typing indicators, and device information
 */
export const userPresence = pgTable("user_presence", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // Each user can only have one presence record
  // Current status
  status: text("status", { enum: ["online", "away", "busy", "offline"] })
    .notNull()
    .default("offline"),
  customStatus: text("custom_status"), // Custom status message
  // Device and session information
  deviceId: text("device_id"), // Device identifier for multi-device support
  sessionId: text("session_id"), // Current session ID
  connectionId: text("connection_id"), // WebSocket connection ID
  // Activity tracking
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  isTyping: boolean("is_typing").default(false),
  typingIn: uuid("typing_in"), // Chat ID where user is typing
  typingLastUpdate: timestamp("typing_last_update"),
  // Connection information
  connectionCount: integer("connection_count").default(0), // Number of active connections
  lastIpAddress: text("last_ip_address"),
  userAgent: text("user_agent"),
  // Geographic and platform information
  platform: text("platform", { enum: ["web", "mobile", "desktop", "tablet"] }),
  appVersion: text("app_version"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes
  userIdIdx: index("user_presence_user_id_idx").on(table.userId),
  statusIdx: index("user_presence_status_idx").on(table.status),
  lastActiveIdx: index("user_presence_last_active_idx").on(table.lastActiveAt),
  typingIdx: index("user_presence_typing_idx").on(table.typingIn),
  sessionIdx: index("user_presence_session_idx").on(table.sessionId),
}));

/**
 * Enhanced session management for security and multi-device support
 * Extends the basic session with device tracking and security features
 */
export const userSession = pgTable("user_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  // Device identification and information
  deviceFingerprint: text("device_fingerprint"), // Device identification hash
  deviceName: text("device_name"), // User-friendly device name
  deviceType: text("device_type", { enum: ["desktop", "mobile", "tablet", "web"] }),
  // Location and network information
  ipAddress: text("ip_address"),
  location: text("location"), // JSON string with location data (city, country, etc.)
  userAgent: text("user_agent"),
  // Session security and trust
  isSecure: boolean("is_secure").default(false), // HTTPS connection
  isTrusted: boolean("is_trusted").default(false), // Trusted device
  requires2FA: boolean("requires_2fa").default(false),
  // Activity tracking
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  loginAt: timestamp("login_at").notNull().defaultNow(),
  logoutAt: timestamp("logout_at"),
  // Session status and management
  isActive: boolean("is_active").default(true),
  isRevoked: boolean("is_revoked").default(false),
  revokedReason: text("revoked_reason"),
  revokedBy: uuid("revoked_by").references(() => user.id), // Who revoked the session
  expiresAt: timestamp("expires_at").notNull(),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes
  userIdIdx: index("user_session_user_id_idx").on(table.userId),
  sessionTokenIdx: index("user_session_token_idx").on(table.sessionToken),
  deviceFingerprintIdx: index("user_session_device_idx").on(table.deviceFingerprint),
  isActiveIdx: index("user_session_active_idx").on(table.isActive),
  expiresAtIdx: index("user_session_expires_idx").on(table.expiresAt),
  lastActivityIdx: index("user_session_activity_idx").on(table.lastActivityAt),
}));

// Type exports for TypeScript support
export type User = typeof user.$inferSelect;
export type UserPresence = typeof userPresence.$inferSelect;
export type UserSession = typeof userSession.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

export type InsertUser = typeof user.$inferInsert;
export type InsertUserPresence = typeof userPresence.$inferInsert;
export type InsertUserSession = typeof userSession.$inferInsert;
export type InsertSession = typeof session.$inferInsert;
export type InsertAccount = typeof account.$inferInsert;
export type InsertVerification = typeof verification.$inferInsert;