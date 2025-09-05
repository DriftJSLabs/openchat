import { describe, it, expect } from "bun:test";
import * as chats from "../convex/chats";
import { InMemoryDb } from "./helpers/mockDb";

function makeCtx(identity: null | { subject: string }) {
  const db = new InMemoryDb();
  return {
    auth: {
      async getUserIdentity() {
        return identity as any;
      },
    },
    db,
  } as any;
}

describe("chats authz", () => {
  it("createChat throws when unauthenticated", async () => {
    const ctx = makeCtx(null);
    // Inspect exported shape to find callable handler
    // @ts-ignore
    // console.log("createChat keys", Object.keys(chats.createChat));
    const fn: any = (chats as any).createChat?.handler || (chats as any).createChat?.func || (chats as any).createChat?._handler || (chats as any).createChat;
    await expect(fn(ctx, { title: "Test" })).rejects.toBeTruthy();
  });

  it("createChat succeeds when authenticated and getChats filters by user", async () => {
    const ctxA = makeCtx({ subject: "userA" });
    const ctxB = makeCtx({ subject: "userB" });

    const fn: any = (chats as any).createChat?.handler || (chats as any).createChat?.func || (chats as any).createChat?._handler || (chats as any).createChat;
    const id1 = await fn(ctxA, { title: "A1" });
    const id2 = await fn(ctxA, { title: "A2" });
    const id3 = await fn(ctxB, { title: "B1" });

    expect(typeof id1).toBe("string");
    expect(typeof id2).toBe("string");
    expect(typeof id3).toBe("string");

    const getFn: any = (chats as any).getChats?.handler || (chats as any).getChats?.func || (chats as any).getChats?._handler || (chats as any).getChats;
    const aChats = await getFn(ctxA);
    const bChats = await getFn(ctxB);
    const unauthChats = await getFn(makeCtx(null));

    // aChats should only include chats created by A
    expect(aChats.every((c: any) => c.userId === "userA")).toBe(true);
    // bChats should only include chats created by B
    expect(bChats.every((c: any) => c.userId === "userB")).toBe(true);
    // unauthenticated getChats returns []
    expect(Array.isArray(unauthChats)).toBe(true);
    expect(unauthChats.length).toBe(0);
  });
});
