"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL, {
  verbose: process.env.NEXT_PUBLIC_DEBUG_CONVEX === '1',
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider
      client={convex}
      // Ensure token storage namespace matches our Convex URL in all envs.
      storageNamespace={env.NEXT_PUBLIC_CONVEX_URL}
    >
      {children}
    </ConvexAuthProvider>
  );
}
