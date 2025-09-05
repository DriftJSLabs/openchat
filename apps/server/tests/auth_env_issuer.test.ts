import { describe, it, expect, beforeEach } from "bun:test";

import { ensureIssuerEnv } from "../convex/auth";

describe("auth.ts issuer alignment", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.CONVEX_SITE_URL;
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://local.convex.example";
  });

  it("sets CONVEX_SITE_URL from NEXT_PUBLIC_CONVEX_URL in dev if missing", async () => {
    ensureIssuerEnv();
    expect(process.env.CONVEX_SITE_URL).toBe("https://local.convex.example");
  });

  it("does not override in production when both set (mismatch)", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://client.example";
    process.env.CONVEX_SITE_URL = "https://server.example";
    ensureIssuerEnv();
    expect(process.env.CONVEX_SITE_URL).toBe("https://server.example");
  });
});
