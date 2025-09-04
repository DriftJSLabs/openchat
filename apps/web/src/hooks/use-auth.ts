"use client";

import { useQuery } from "convex/react";
import { api } from "../../../server/convex/_generated/api";

export function useAuth() {
  const user = useQuery(api.users.viewer);

  return {
    isAuthenticated: !!user,
    isLoading: false,
    user,
    signIn: async () => {
      // Mock sign in - just reload the page
      window.location.reload();
    },
    signOut: async () => {
      // Mock sign out - just reload the page
      window.location.reload();
    },
  };
}