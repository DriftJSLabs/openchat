type Doc<T> = T & { _id: string; _creationTime: number };

export type Tables = {
  chats: Doc<{ userId: string; title: string; createdAt: number; updatedAt: number; viewMode: string; viewport?: any }>;
  messages: Doc<{ chatId: string; userId: string; role: string; content: any; updatedAt?: number; position?: any }>;
};

export class InMemoryDb {
  private data: { [K in keyof Tables]: Tables[K][] } = {
    chats: [],
    messages: [],
  } as any;

  private idSeq = 1;

  private makeId(prefix: string) {
    return `${prefix}_${this.idSeq++}`;
  }

  async get<T extends keyof Tables>(id: string): Promise<Tables[T] | null> {
    const [table] = id.split("_") as [T, string];
    const arr = this.data[table] as Tables[T][];
    return arr.find((d) => d._id === id) ?? null;
  }

  async insert<T extends keyof Tables>(table: T, value: Omit<Tables[T], "_id" | "_creationTime">): Promise<string> {
    const id = this.makeId(String(table));
    const doc: Tables[T] = {
      ...(value as any),
      _id: id,
      _creationTime: Date.now(),
    } as Tables[T];
    (this.data[table] as Tables[T][]).push(doc);
    return id;
  }

  async patch<T extends keyof Tables>(id: string, patch: Partial<Tables[T]>): Promise<void> {
    const [table] = id.split("_") as [T, string];
    const arr = this.data[table] as Tables[T][];
    const idx = arr.findIndex((d) => d._id === id);
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...(patch as any) };
    }
  }

  async delete<T extends keyof Tables>(id: string): Promise<void> {
    const [table] = id.split("_") as [T, string];
    const arr = this.data[table] as Tables[T][];
    const idx = arr.findIndex((d) => d._id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  query<T extends keyof Tables>(table: T) {
    const arr = this.data[table] as Tables[T][];
    const state: { field?: keyof Tables[T]; value?: any; orderDir?: "asc" | "desc" } = {};

    const chain = {
      withIndex(_indexName: string, cb: (q: { eq: (field: keyof Tables[T], val: any) => void }) => void) {
        cb({
          eq(field, val) {
            state.field = field;
            state.value = val;
          },
        });
        return chain;
      },
      order(dir: "asc" | "desc") {
        state.orderDir = dir;
        return chain;
      },
      async collect() {
        let results = arr;
        if (state.field !== undefined) {
          results = results.filter((d) => (d as any)[state.field!] === state.value);
        }
        // For determinism, sort by _creationTime descending if desc requested
        if (state.orderDir === "desc") {
          results = [...results].sort((a, b) => b._creationTime - a._creationTime);
        }
        return results;
      },
    };
    return chain;
  }
}

export function makeCtx(identity: null | { subject: string }) {
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

