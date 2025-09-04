"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../server/convex/_generated/api";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const user = useQuery(api.users.viewer);
  const ensureUser = useMutation(api.users.ensureUser);
  
  useEffect(() => {
    // Check authentication status
    authClient.getSession().then((session) => {
      setIsAuthenticated(!!session);
      setIsLoading(false);
      
      // Ensure user is created in database when authenticated
      if (session) {
        ensureUser();
      }
    });
  }, [ensureUser]);

  return {
    isAuthenticated: isAuthenticated && !!user,
    isLoading,
    user,
    signIn: async () => {
      // Redirect to sign-in page
      window.location.href = "/sign-in";
    },
    signOut: async () => {
      await authClient.signOut();
      setIsAuthenticated(false);
      window.location.href = "/";
    },
  };
}