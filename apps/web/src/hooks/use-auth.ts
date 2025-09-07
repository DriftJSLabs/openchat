"use client";

import { useQuery, useMutation } from "convex/react";
import * as React from "react";
import { api } from "../../../server/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { env } from "@/lib/env";

export function useAuth() {
  const session = useConvexAuth();
  const { signOut } = useAuthActions();
  // Always ask the server who we are; it returns null when unauthenticated.
  const user = useQuery(api.users.viewer, {});
  const ensureUser = useMutation(api.users.ensureUser);

  // Derive a robust auth state. If the server says we have a user, trust it.
  // Additionally, consider presence of a stored JWT as provisional auth to
  // avoid UI stuck states while the websocket handshake completes.
  const [hasLocalToken, setHasLocalToken] = React.useState<boolean>(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Convex Auth stores tokens under `__convexAuthJWT_${escapedNamespace}`
      // where namespace defaults to the Convex URL. Mirror that here.
      const ns = env.NEXT_PUBLIC_CONVEX_URL;
      const sanitized = (ns || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `__convexAuthJWT_${sanitized}`;
      const token = localStorage.getItem(key);
      setHasLocalToken(!!token);
    } catch {}
  }, [session.isAuthenticated, env.NEXT_PUBLIC_CONVEX_URL]);

  const isAuthenticated = !!(session.isAuthenticated || (user as any)?._id || hasLocalToken);
  const isLoading = !!(session.isLoading || user === undefined);

  // Optional debug logs if NEXT_PUBLIC_DEBUG_AUTH=1
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH === '1') {
      // eslint-disable-next-line no-console
      console.log('[auth/debug]', {
        session: {
          isAuthenticated: session.isAuthenticated,
          isLoading: session.isLoading,
        },
        user,
        hasLocalToken,
        derived: { isAuthenticated, isLoading },
      });
    }
  }, [session.isAuthenticated, session.isLoading, !!(user && (user as any)._id), hasLocalToken]);

  return {
    isAuthenticated,
    isLoading,
    user,
    signIn: async () => {
      // Sign in is handled by the auth forms
      window.location.href = "/";
    },
    signOut: async () => {
      await signOut();
    },
  };
}
