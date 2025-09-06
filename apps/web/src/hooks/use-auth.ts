"use client";

import { useQuery, useMutation } from "convex/react";
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
  const isAuthenticated = session.isAuthenticated || (!!user && (user as any)._id);
  const isLoading = session.isLoading || user === undefined;

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
