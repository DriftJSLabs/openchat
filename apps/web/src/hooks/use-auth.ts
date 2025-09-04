"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../server/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

export function useAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const ensureUser = useMutation(api.users.ensureUser);

  return {
    isAuthenticated,
    isLoading,
    user,
    signIn: async () => {
      // Sign in is handled by the auth forms
      // This is just for compatibility
      window.location.href = "/";
    },
    signOut: async () => {
      await signOut();
    },
  };
}