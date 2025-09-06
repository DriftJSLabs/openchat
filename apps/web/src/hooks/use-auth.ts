"use client";

import { useQuery, useMutation } from "convex/react";
import * as React from "react";
import { api } from "../../../server/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

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
      const addr = (window as any)?.location?.origin ? undefined : undefined; // noop to keep bundlers happy
      const ns = (session as any)?.client?.address ?? undefined;
      const sanitized = (ns || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `__convexAuthJWT_${sanitized}`;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      setHasLocalToken(!!token);
    } catch {}
  }, [session.isAuthenticated]);

  const isAuthenticated = !!(session.isAuthenticated || (user as any)?._id || hasLocalToken);
  const isLoading = !!(session.isLoading || user === undefined);

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
