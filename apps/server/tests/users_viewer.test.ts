import { describe, it, expect } from "bun:test";
import * as users from "../convex/users";

function makeCtx(identity: null | { subject: string; email?: string; name?: string }) {
  return {
    auth: {
      async getUserIdentity() {
        return identity as any;
      },
    },
  } as any;
}

describe("users.viewer", () => {
  it("returns null when unauthenticated", async () => {
    const ctx = makeCtx(null);
    const fn: any = (users as any).viewer?.handler || (users as any).viewer;
    const res = await fn(ctx, {});
    expect(res).toBeNull();
  });

  it("returns identity-derived user when authenticated", async () => {
    const ctx = makeCtx({ subject: "user123", email: "john@example.com" });
    const fn: any = (users as any).viewer?.handler || (users as any).viewer;
    const res = await fn(ctx, {});
    expect(res?._id).toBe("user123");
    expect(res?.email).toBe("john@example.com");
    expect(res?.tokenIdentifier).toBe("user123");
  });
});

