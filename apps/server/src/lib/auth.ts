import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema/auth";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { Context } from "./context";
import { authSchemas } from "./auth-validation";

// Import jsonwebtoken types and create a simple JWT implementation for Bun compatibility
interface JWTPayload {
  [key: string]: any;
  sub?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// Secure JWT implementation using Web Crypto API
const jwt = {
  sign: async (payload: JWTPayload, secret: string, options?: { algorithm?: string }) => {
    const header = { alg: options?.algorithm || "HS256", typ: "JWT" };
    const headerB64 = btoa(JSON.stringify(header)).replace(/[=]/g, "");
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/[=]/g, "");
    const message = `${headerB64}.${payloadB64}`;
    
    // Use Web Crypto API for proper HMAC-SHA256
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureArrayBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message)
    );
    
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureArrayBuffer)))
      .replace(/[=]/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    
    return `${message}.${signatureB64}`;
  },
  
  verify: async (token: string, secret: string) => {
    try {
      const [headerB64, payloadB64, signatureB64] = token.split(".");
      if (!headerB64 || !payloadB64 || !signatureB64) {
        throw new Error("Invalid token format");
      }
      
      const message = `${headerB64}.${payloadB64}`;
      
      // Verify signature using Web Crypto API
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      
      const signature = Uint8Array.from(
        atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
        c => c.charCodeAt(0)
      );
      
      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signature,
        new TextEncoder().encode(message)
      );
      
      if (!isValid) {
        throw new Error("Invalid signature");
      }
      
      const payload = JSON.parse(atob(headerB64.padEnd(headerB64.length + (4 - headerB64.length % 4) % 4, '=')));
      const payloadData = JSON.parse(atob(payloadB64.padEnd(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=')));
      
      // Check expiration
      if (payloadData.exp && payloadData.exp < Math.floor(Date.now() / 1000)) {
        throw new Error("Token expired");
      }
      
      return payloadData;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  },
};

/**
 * Enhanced authentication configuration with JWT support and extended features
 * Supports chat application requirements including presence, relationships, and secure tokens
 * SECURITY: Enforces strict secret validation without fallbacks
 */
export const createAuth = () => {
  // SECURITY: Strict secret validation - no fallbacks allowed
  const secret = process.env.BETTER_AUTH_SECRET;
  
  // Comprehensive secret validation
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required but not set. This is a critical security requirement.");
  }
  
  if (secret.length < 32) {
    throw new Error(`BETTER_AUTH_SECRET must be at least 32 characters long for security. Current length: ${secret.length}`);
  }
  
  // Additional security checks
  if (secret === 'your-secret-key-here' || secret === 'dev-secret-key' || secret.includes('example')) {
    throw new Error("BETTER_AUTH_SECRET appears to be a placeholder or example value. Use a cryptographically secure secret.");
  }
  
  // Check for sufficient entropy (basic check)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 16) {
    throw new Error("BETTER_AUTH_SECRET appears to have low entropy. Use a cryptographically secure random string.");
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    // Security configuration
    secret,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [
    process.env.CORS_ORIGIN || "http://localhost:3001",
    process.env.CLIENT_URL || "http://localhost:3001",
    // Add additional trusted origins for production
    ...(process.env.ADDITIONAL_TRUSTED_ORIGINS?.split(",") || []),
  ],
  
  // Session configuration with enhanced security
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  
  // Authentication methods
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: process.env.NODE_ENV === "production",
    sendResetPassword: async ({ user, url }) => {
      // Implement email sending logic here
      console.log(`Password reset email would be sent to ${user.email}: ${url}`);
    },
    sendEmailVerificationOnSignUp: async ({ user, url }) => {
      // Implement email verification logic here
      console.log(`Verification email would be sent to ${user.email}: ${url}`);
    },
  },
  
  // User data management
  user: {
    // Additional fields to include in the user object
    additionalFields: {
      username: {
        type: "string",
        required: false,
        unique: true,
      },
      displayName: {
        type: "string",
        required: false,
      },
      bio: {
        type: "string",
        required: false,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "offline",
      },
      isPrivate: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
    
    // User data transformation and validation
    modelName: "user",
    fields: {
      id: "id",
      name: "name",
      email: "email",
      emailVerified: "emailVerified",
      image: "image",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  
  // Advanced configuration
  advanced: {
    generateId: () => nanoid(21), // More secure ID generation
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === "production",
      domain: process.env.COOKIE_DOMAIN,
    },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  
  // Rate limiting configuration
  rateLimit: {
    window: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    enabled: true,
  },
  
  // Plugin configuration for enhanced features
  plugins: [
    // Additional plugins can be added here for social auth, etc.
  ],
  
  // Telemetry and monitoring
  telemetry: {
    enabled: process.env.ENABLE_TELEMETRY === "true",
  },
  
  // Hooks for custom logic
  hooks: {
    // Before user creation - validate and transform user data
    async before(context) {
      if (context.body && (context.body as any).username) {
        try {
          const validatedData = authSchemas.userRegistration.parse(context.body);
          context.body = validatedData;
        } catch (error) {
          throw new Error("Invalid user data provided");
        }
      }
    },
    
    // After successful authentication - update presence
    async after(context) {
      if (context.user && context.path === "/sign-in") {
        // Update user presence and session tracking
        await updateUserPresence(context.user.id, {
          status: "online",
          lastActiveAt: new Date(),
          sessionId: context.sessionId,
        });
      }
    },
    
    // Before session deletion - cleanup presence
    async beforeSignOut(context) {
      if (context.user) {
        await updateUserPresence(context.user.id, {
          status: "offline",
          lastActiveAt: new Date(),
          connectionCount: 0,
        });
      }
    },
  },
  });
};

/**
 * JWT token utilities for ElectricSQL integration
 * Provides secure token generation and validation for real-time sync
 */
export const jwtUtils = {
  /**
   * Generate a JWT token for ElectricSQL authentication
   * SECURITY: Enforces strict JWT secret validation without fallbacks
   * @param userId - User ID to include in token
   * @param additionalClaims - Additional claims to include
   * @returns Signed JWT token
   */
  generateToken: async (userId: string, additionalClaims: Record<string, any> = {}) => {
    // SECURITY: Primary JWT secret without fallbacks
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error("JWT_SECRET is required but not set. This is critical for token security.");
    }
    
    if (secret.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
    }
    
    // Validate it's not a placeholder
    if (secret.includes('your-jwt-secret') || secret.includes('change-this') || secret === 'fallback-secret') {
      throw new Error("JWT_SECRET appears to be a placeholder value. Use a cryptographically secure secret.");
    }
    
    const payload = {
      sub: userId, // Subject (user ID)
      iat: Math.floor(Date.now() / 1000), // Issued at
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // Expires in 24 hours
      iss: "openchat-server", // Issuer
      aud: "electric-sql", // Audience
      ...additionalClaims,
    };
    
    return jwt.sign(payload, secret, { algorithm: "HS256" });
  },
  
  /**
   * Verify and decode a JWT token
   * SECURITY: Enforces strict JWT secret validation without fallbacks
   * @param token - JWT token to verify
   * @returns Decoded token payload or null if invalid
   */
  verifyToken: async (token: string) => {
    try {
      // SECURITY: Use only JWT_SECRET, no fallbacks
      const secret = process.env.JWT_SECRET;
      
      if (!secret) {
        throw new Error("JWT_SECRET is required for token verification");
      }
      
      if (secret.length < 32) {
        throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
      }
      
      if (secret.includes('your-jwt-secret') || secret.includes('change-this') || secret === 'fallback-secret') {
        throw new Error("JWT_SECRET appears to be a placeholder value");
      }
      
      const decoded = await jwt.verify(token, secret) as any;
      return decoded;
    } catch (error) {
      console.warn("JWT verification failed:", error);
      return null;
    }
  },
  
  /**
   * Generate a short-lived token for WebSocket connections
   * SECURITY: Enforces strict JWT secret validation without fallbacks
   * @param userId - User ID
   * @param connectionId - Connection identifier
   * @returns Short-lived JWT token
   */
  generateWebSocketToken: async (userId: string, connectionId?: string) => {
    // SECURITY: No fallback secrets - fail securely
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error("JWT_SECRET is required for WebSocket token generation");
    }
    
    if (secret.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
    }
    
    if (secret.includes('your-jwt-secret') || secret.includes('change-this') || secret === 'fallback-secret') {
      throw new Error("JWT_SECRET appears to be a placeholder value");
    }
    
    const payload = {
      sub: userId,
      connectionId: connectionId || nanoid(12),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 30), // 30 minutes
      iss: "openchat-server",
      aud: "websocket",
      type: "ws-auth",
    };
    
    return jwt.sign(payload, secret, { algorithm: "HS256" });
  },
  
  /**
   * Generate a token specifically for ElectricSQL sync operations
   * SECURITY: Enforces strict JWT secret validation without fallbacks
   * @param userId - User ID
   * @param permissions - User permissions for data access
   * @returns ElectricSQL-compatible JWT token
   */
  generateElectricToken: async (userId: string, permissions: string[] = []) => {
    // SECURITY: No fallback secrets - fail securely
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error("JWT_SECRET is required for ElectricSQL token generation");
    }
    
    if (secret.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
    }
    
    if (secret.includes('your-jwt-secret') || secret.includes('change-this') || secret === 'fallback-secret') {
      throw new Error("JWT_SECRET appears to be a placeholder value");
    }
    
    const payload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 12), // 12 hours
      iss: "openchat-server",
      aud: "electric-sql",
      permissions,
      // ElectricSQL-specific claims
      "electric:user_id": userId,
      "electric:role": "user",
    };
    
    return jwt.sign(payload, secret, { algorithm: "HS256" });
  },
};

/**
 * User presence management utilities
 * Handles real-time presence updates and status tracking
 */
export const presenceUtils = {
  /**
   * Update user presence status
   * @param userId - User ID
   * @param presence - Presence data to update
   */
  async updatePresence(userId: string, presence: Partial<{
    status: "online" | "away" | "busy" | "offline";
    customStatus?: string;
    lastActiveAt?: Date;
    sessionId?: string;
    connectionCount?: number;
    deviceId?: string;
    platform?: "web" | "mobile" | "desktop" | "tablet";
    appVersion?: string;
  }>) {
    try {
      // Update user presence in database
      await db.insert(schema.userPresence)
        .values({
          userId,
          status: presence.status || "online",
          customStatus: presence.customStatus,
          lastActiveAt: presence.lastActiveAt || new Date(),
          sessionId: presence.sessionId,
          connectionCount: presence.connectionCount || 1,
          deviceId: presence.deviceId,
          platform: presence.platform,
          appVersion: presence.appVersion,
        })
        .onConflictDoUpdate({
          target: schema.userPresence.userId,
          set: {
            status: presence.status || "online",
            customStatus: presence.customStatus,
            lastActiveAt: presence.lastActiveAt || new Date(),
            sessionId: presence.sessionId,
            connectionCount: presence.connectionCount,
            deviceId: presence.deviceId,
            platform: presence.platform,
            appVersion: presence.appVersion,
            updatedAt: new Date(),
          },
        });
      
      // Also update the main user table status for quick lookups
      await db.update(schema.user)
        .set({
          status: presence.status,
          lastActiveAt: presence.lastActiveAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.user.id, userId));
        
    } catch (error) {
      console.error("Failed to update user presence:", error);
      throw error;
    }
  },
  
  /**
   * Get user presence information
   * @param userId - User ID
   * @returns User presence data
   */
  async getPresence(userId: string) {
    try {
      const [presence] = await db.select()
        .from(schema.userPresence)
        .where(eq(schema.userPresence.userId, userId))
        .limit(1);
      
      return presence;
    } catch (error) {
      console.error("Failed to get user presence:", error);
      return null;
    }
  },
  
  /**
   * Set user as offline and cleanup connections
   * @param userId - User ID
   */
  async setOffline(userId: string) {
    await this.updatePresence(userId, {
      status: "offline",
      connectionCount: 0,
      lastActiveAt: new Date(),
    });
  },
  
  /**
   * Update typing indicator
   * @param userId - User ID
   * @param chatId - Chat ID where user is typing
   * @param isTyping - Whether user is typing
   */
  async updateTypingIndicator(userId: string, chatId?: string, isTyping: boolean = false) {
    try {
      await db.update(schema.userPresence)
        .set({
          isTyping,
          typingIn: chatId,
          typingLastUpdate: isTyping ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.userPresence.userId, userId));
    } catch (error) {
      console.error("Failed to update typing indicator:", error);
    }
  },
};

// Helper function used in auth hooks
const updateUserPresence = presenceUtils.updatePresence;

/**
 * Authentication middleware factory for different security levels
 * Provides reusable middleware for protecting routes with various auth requirements
 */
export const createAuthMiddleware = (options: {
  required?: boolean;
  permissions?: string[];
  allowGuests?: boolean;
} = {}) => {
  const { required = true, permissions = [], allowGuests = false } = options;
  
  return async (context: Context, next: () => Promise<any>) => {
    const { session } = context;
    
    // Check if authentication is required
    if (required && !session?.user) {
      if (!allowGuests) {
        throw new Error("Authentication required");
      }
    }
    
    // Check permissions if specified
    if (permissions.length > 0 && session?.user) {
      // TODO: Implement role-based permissions when user roles are added
      // For now, all authenticated users have basic permissions
    }
    
    // Update user activity if authenticated
    if (session?.user) {
      // Non-blocking presence update
      presenceUtils.updatePresence(session.user.id, {
        lastActiveAt: new Date(),
      }).catch(error => {
        console.warn("Failed to update user activity:", error);
      });
    }
    
    return next();
  };
};

/**
 * Get enhanced session information including presence and profile data
 * @param sessionToken - Session token
 * @returns Enhanced session with user profile and presence
 */
export const getEnhancedSession = async (sessionToken: string) => {
  try {
    const auth = createAuth();
    const session = await auth.api.getSession({ headers: { cookie: `better-auth.session_token=${sessionToken}` } });
    
    if (!session?.user) {
      return null;
    }
    
    // Get additional user data
    const [userData] = await db.select()
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1);
    
    // Get presence data
    const presence = await presenceUtils.getPresence(session.user.id);
    
    return {
      ...session,
      user: {
        ...session.user,
        ...userData,
      },
      presence,
    };
  } catch (error) {
    console.error("Failed to get enhanced session:", error);
    return null;
  }
};

