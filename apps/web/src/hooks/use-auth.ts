"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../server/convex/_generated/api";
import { useEffect } from "react";

export function useAuth() {
  const user = useQuery(api.users.viewer);
  const ensureUser = useMutation(api.users.ensureUser);
  
  useEffect(() => {
    // Ensure user is created in database when we have a user
    if (user && !user._id.includes("dev_user")) {
      ensureUser();
    }
  }, [user, ensureUser]);

  return {
    isAuthenticated: !!user,
    isLoading: user === undefined,
    user,
    signIn: async () => {
      // For now, just reload to trigger Convex auth
      // In production, you'd integrate with Convex Auth providers
      window.location.reload();
    },
    signOut: async () => {
      // For now, just reload
      // In production, you'd clear Convex auth session
      window.location.reload();
    },
  };
}