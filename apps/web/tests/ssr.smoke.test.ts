import { describe, it, expect } from "bun:test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3001";

describe("SSR smoke", () => {
  it("renders sign-up page with expected text", async () => {
    const res = await fetch(`${BASE_URL}/sign-up`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain("create an account");
  });

  it("renders home page unauthenticated CTA", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Expect the CTA text rendered in layout
    expect(html.toLowerCase()).toContain("sign in to start");
  });
});

