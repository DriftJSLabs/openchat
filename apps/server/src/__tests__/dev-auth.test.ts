import { test, expect, describe, beforeAll, afterEach } from "bun:test";
import { db } from "../db";
import { user, session } from "../db/schema/auth";
import { eq } from "drizzle-orm";
import { handleDevAutoLogin, getOrCreateDevUser, createDevSession, isDevelopment } from "../lib/dev-auth";
import { Hono } from "hono";

describe("Dev Authentication", () => {
  beforeAll(async () => {
    // Ensure database is connected
    try {
      const result = await db.execute("SELECT 1");
      console.log("✅ Database connected for tests");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw error;
    }
    
    // Ensure we're in development mode for tests
    process.env.NODE_ENV = 'development';
    process.env.ELECTRIC_INSECURE = 'true';
  });
  
  afterEach(async () => {
    // Clean up test sessions after each test
    try {
      await db.delete(session).where(eq(session.userAgent, 'dev-auto-login'));
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test("should connect to database", async () => {
    const result = await db.execute("SELECT NOW()");
    expect(result).toBeDefined();
  });

  test("should create dev user if not exists", async () => {
    const email = "dev@openchat.local";
    
    // First, check if user exists
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser.length === 0) {
      // Create user if doesn't exist
      const newUser = await db
        .insert(user)
        .values({
          id: "dev-user-id",
          email,
          name: "Dev User",
          username: "devuser",
          emailVerified: new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      expect(newUser).toHaveLength(1);
      expect(newUser[0].email).toBe(email);
    } else {
      expect(existingUser[0].email).toBe(email);
    }
  });

  test("should retrieve dev user", async () => {
    const email = "dev@openchat.local";
    
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(email);
  });
  
  test("isDevelopment should return true in test environment", () => {
    expect(isDevelopment()).toBe(true);
  });
  
  test("getOrCreateDevUser should return dev user", async () => {
    const devUser = await getOrCreateDevUser();
    expect(devUser).toBeDefined();
    expect(devUser.email).toBe("dev@openchat.local");
    expect(devUser.name).toBe("Developer User");
    expect(devUser.id).toBeDefined();
  });
  
  test("createDevSession should create valid session", async () => {
    const devUser = await getOrCreateDevUser();
    const sessionToken = await createDevSession(devUser.id);
    
    expect(sessionToken).toBeDefined();
    expect(typeof sessionToken).toBe("string");
    expect(sessionToken.length).toBeGreaterThan(50);
    
    // Verify session exists in database
    const sessions = await db
      .select()
      .from(session)
      .where(eq(session.token, sessionToken))
      .limit(1);
    
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(devUser.id);
    expect(sessions[0].userAgent).toBe("dev-auto-login");
  });
  
  test("handleDevAutoLogin should complete full flow", async () => {
    const result = await handleDevAutoLogin();
    
    expect(result).toBeDefined();
    expect(result!.user).toBeDefined();
    expect(result!.sessionToken).toBeDefined();
    expect(result!.diagnostics).toBeDefined();
    
    // Verify user data
    expect(result!.user.email).toBe("dev@openchat.local");
    expect(result!.user.name).toBe("Developer User");
    expect(result!.user.id).toBeDefined();
    
    // Verify session token
    expect(typeof result!.sessionToken).toBe("string");
    expect(result!.sessionToken.length).toBeGreaterThan(50);
    
    // Verify diagnostics
    expect(result!.diagnostics.duration).toBeDefined();
    expect(result!.diagnostics.databaseStatus).toBeDefined();
    expect(result!.diagnostics.timestamp).toBeDefined();
  });
  
  test("dev-login HTTP endpoint should work", async () => {
    const app = new Hono();
    
    // Import and set up the dev-login endpoint
    app.post("/api/auth/dev-login", async (c) => {
      const startTime = Date.now();
      const requestId = Math.random().toString(36).substring(2, 8);
      
      try {
        const devAuthModule = await import("../lib/dev-auth");
        const { handleDevAutoLogin, isDevelopment } = devAuthModule;
        
        if (!isDevelopment()) {
          return c.json({ 
            success: false, 
            message: "Dev login is only available in development mode",
            error: "NOT_DEVELOPMENT_ENVIRONMENT",
            requestId
          }, 403);
        }

        const result = await handleDevAutoLogin();
        const duration = Date.now() - startTime;
        
        if (result && result.user && result.sessionToken) {
          const response = c.json({
            success: true,
            user: {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              emailVerified: result.user.emailVerified,
              image: result.user.image,
              createdAt: result.user.createdAt,
            },
            message: "Development auto-login successful",
            requestId,
            duration: `${duration}ms`,
            diagnostics: result.diagnostics,
          });
          
          const cookieOptions = [
            `better-auth.session_token=${result.sessionToken}`,
            'HttpOnly',
            'Path=/',
            `Max-Age=${30 * 24 * 60 * 60}`,
            'SameSite=Lax'
          ].join('; ');
          
          response.headers.set('Set-Cookie', cookieOptions);
          return response;
        } else {
          return c.json({
            success: false,
            message: "Development auto-login failed",
            error: "AUTO_LOGIN_FAILED",
            requestId,
            duration: `${duration}ms`
          }, 500);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        return c.json({
          success: false,
          message: "Development auto-login error",
          error: error instanceof Error ? error.message : "Unknown error",
          requestId,
          duration: `${duration}ms`
        }, 500);
      }
    });
    
    // Test the endpoint
    const req = new Request('http://localhost/api/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent'
      }
    });
    
    const res = await app.request(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("dev@openchat.local");
    expect(data.user.name).toBe("Developer User");
    expect(data.message).toBe("Development auto-login successful");
    expect(data.diagnostics).toBeDefined();
    
    // Verify session cookie is set
    const setCookieHeader = res.headers.get('Set-Cookie');
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain('better-auth.session_token=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('Path=/');
  });
  
  test("dev-login endpoint should fail in production mode", async () => {
    // Temporarily set production mode
    const originalNodeEnv = process.env.NODE_ENV;
    const originalElectricInsecure = process.env.ELECTRIC_INSECURE;
    
    process.env.NODE_ENV = 'production';
    delete process.env.ELECTRIC_INSECURE;
    
    try {
      const app = new Hono();
      
      app.post("/api/auth/dev-login", async (c) => {
        const devAuthModule = await import("../lib/dev-auth");
        const { isDevelopment } = devAuthModule;
        
        if (!isDevelopment()) {
          return c.json({ 
            success: false, 
            message: "Dev login is only available in development mode",
            error: "NOT_DEVELOPMENT_ENVIRONMENT"
          }, 403);
        }
        
        return c.json({ success: true });
      });
      
      const req = new Request('http://localhost/api/auth/dev-login', {
        method: 'POST'
      });
      
      const res = await app.request(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("NOT_DEVELOPMENT_ENVIRONMENT");
    } finally {
      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv;
      if (originalElectricInsecure) {
        process.env.ELECTRIC_INSECURE = originalElectricInsecure;
      }
    }
  });
});