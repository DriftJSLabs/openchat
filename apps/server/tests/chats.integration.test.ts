import { describe, it, expect, beforeEach } from "bun:test";
import { 
  getChatsHandler,
  createChatHandler,
  updateChatHandler,
  getChatHandler,
  deleteChatHandler,
} from "../convex/chats";

// Minimal in-memory DB mock implementing the subset used by chats.ts
type Doc = Record<string, any> & { _id?: string };

class MockDb {
  private seq = 0;
  private collections: Record<string, Map<string, Doc>> = {
    chats: new Map(),
    messages: new Map(),
  };

  insert(collection: string, doc: Doc) {
    const id = `${collection}:${++this.seq}`;
    const withId = { ...doc, _id: id };
    this.collections[collection].set(id, withId);
    return id as any;
  }

  get(id: any) {
    const [collection] = String(id).split(":");
    return this.collections[collection].get(String(id)) ?? null;
  }

  patch(id: any, fields: Record<string, any>) {
    const [collection] = String(id).split(":");
    const current = this.collections[collection].get(String(id));
    if (!current) return;
    this.collections[collection].set(String(id), { ...current, ...fields });
  }

  delete(id: any) {
    const [collection] = String(id).split(":");
    this.collections[collection].delete(String(id));
  }

  query(collection: string) {
    const items = Array.from(this.collections[collection].values());
    let predicate: ((d: Doc) => boolean) | null = null;
    return {
      withIndex: (_name: string, cb: (q: any) => any) => {
        const q = {
          eq: (field: string, value: any) => {
            predicate = (d: Doc) => d[field] === value;
            return null;
          },
        };
        cb(q);
        return {
          order: (_dir: "asc" | "desc") => ({
            collect: async () =>
              (predicate ? items.filter((d) => predicate!(d)) : items).sort(
                (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
              ),
          }),
          collect: async () => (predicate ? items.filter((d) => predicate!(d)) : items),
        };
      },
      collect: async () => items,
    };
  }
}

function makeCtx(identity: null | { subject: string }) {
  return {
    auth: {
      async getUserIdentity() {
        return identity as any;
      },
    },
    db: new MockDb() as any,
  } as any;
}

describe("chats convex functions", () => {
  it("rejects createChat when unauthenticated", async () => {
    const ctx = makeCtx(null);
    await expect(createChatHandler(ctx, { title: "Hello" })).rejects.toThrow("Not authenticated");
  });

  it("creates, lists, updates and deletes chats for an authenticated user", async () => {
    const ctx = makeCtx({ subject: "user_1" });

    // Initially empty
    let list = await getChatsHandler(ctx);
    expect(list).toEqual([]);

    // Create chat
    const chatId = await createChatHandler(ctx, { title: undefined });
    expect(typeof chatId).toBe("string");

    // Should list one chat, titled "New Chat"
    list = await getChatsHandler(ctx);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("New Chat");

    // Update title
    await updateChatHandler(ctx, { chatId, title: "Renamed" });
    const fetched = await getChatHandler(ctx, { chatId });
    expect(fetched?.title).toBe("Renamed");

    // Delete chat
    await deleteChatHandler(ctx, { chatId });
    list = await getChatsHandler(ctx);
    expect(list.length).toBe(0);
  });
});

