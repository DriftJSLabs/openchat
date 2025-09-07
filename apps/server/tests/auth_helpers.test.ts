import { describe, it, expect, beforeEach } from "bun:test";
import { ConvexError } from "convex/values";

// Import the helpers under test
import { getCurrentUserId, requireAuth } from "../convex/auth";

// Minimal mock for Convex ctx.auth
function makeCtx(identity: null | { subject: string }) {
  return {
    auth: {
      async getUserIdentity() {
        return identity as any;
      },
    },
  } as any;
}

describe("auth helpers", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.ENABLE_DEV_AUTH;
    delete process.env.CONVEX_ENV;
    process.env.NODE_ENV = "test";
  });

  it("getCurrentUserId returns subject when identity present", async () => {
    const ctx = makeCtx({ subject: "user_123|session_456" });
    const result = await getCurrentUserId(ctx);
    expect(result).toBe("user_123|session_456");
  });

  it("getCurrentUserId returns null when no identity and dev auth disabled", async () => {
    const ctx = makeCtx(null);
    const result = await getCurrentUserId(ctx);
    expect(result).toBe(null);
  });

  it("getCurrentUserId returns dev_user only when explicitly enabled for development", async () => {
    // Dev fallback removed; unauthenticated returns null
    process.env.NODE_ENV = "development";
    const ctx = makeCtx(null);
    const result = await getCurrentUserId(ctx);
    expect(result).toBe(null);
  });

  it("requireAuth throws ConvexError if unauthenticated", async () => {
    const ctx = makeCtx(null);
    await expect(requireAuth(ctx)).rejects.toBeInstanceOf(ConvexError);
  });
});
