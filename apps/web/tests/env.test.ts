import { describe, it, expect, beforeEach } from "bun:test";
import { EnvironmentConfig } from "../src/lib/env";

describe("web env loader", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  });

  it("throws if NEXT_PUBLIC_CONVEX_URL is missing", async () => {
    expect(() => new EnvironmentConfig()).toThrow();
  });

  it("loads when NEXT_PUBLIC_CONVEX_URL is set", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://convex.example";
    const cfg = new EnvironmentConfig();
    expect(cfg.NEXT_PUBLIC_CONVEX_URL).toBe("https://convex.example");
  });
});
