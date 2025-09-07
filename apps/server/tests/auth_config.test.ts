import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function importFreshAuthConfig(opts?: { prod?: boolean }) {
  const srcPath = join(
    __dirname,
    opts?.prod ? "../convex/auth.config.prod.ts" : "../convex/auth.config.ts",
  );
  const dstDir = join(__dirname, "../convex/__tmp__");
  mkdirSync(dstDir, { recursive: true });
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const dstPath = join(dstDir, `auth.config.${id}.ts`);
  const content = readFileSync(srcPath, "utf8");
  writeFileSync(dstPath, content, "utf8");
  return await import(dstPath);
}

// We import dynamically inside tests to allow env var setup before module evaluation

describe("convex auth.config", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.CONVEX_SITE_URL;
    delete process.env.JWKS;
  });

  it("errors when neither AUTH_ISSUER nor CONVEX_SITE_URL is set", async () => {
    delete process.env.AUTH_ISSUER;
    delete process.env.CONVEX_SITE_URL;
    process.env.JWKS = JSON.stringify({ keys: [] });
    await expect(importFreshAuthConfig()).rejects.toBeTruthy();
  });

  it("errors when JWKS missing", async () => {
    process.env.AUTH_ISSUER = "https://example.test";
    delete process.env.JWKS;
    await expect(importFreshAuthConfig()).rejects.toBeTruthy();
  });

  it("loads when envs are set in development", async () => {
    delete process.env.CONVEX_ENV;
    process.env.AUTH_ISSUER = "https://example.dev";
    process.env.JWKS = JSON.stringify({ keys: [{ kty: "RSA", n: "x", e: "AQAB" }] });
    const mod: any = await importFreshAuthConfig();
    expect(mod.default?.providers?.length).toBe(1);
    expect(mod.default.providers[0].type).toBe("customJwt");
  });

  it("exports provider when envs set using AUTH_ISSUER", async () => {
    process.env.AUTH_ISSUER = "https://issuer.example";
    process.env.JWKS = JSON.stringify({ keys: [{ kty: "RSA", n: "x", e: "AQAB" }] });
    const mod: any = await importFreshAuthConfig();
    expect(mod.default?.providers?.length).toBe(1);
    expect(mod.default.providers[0].type).toBe("customJwt");
    expect(mod.default.providers[0].issuer).toBe("https://issuer.example");
    expect(typeof mod.default.providers[0].jwks).toBe("string");
  });
});
