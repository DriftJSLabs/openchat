"use client";

import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../../server/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";

export default function DebugPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.viewer);
  const authHook = useAuth();

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Auth Debug Page</h1>
      
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">ConvexAuth Status:</h2>
        <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
          {JSON.stringify({
            isAuthenticated,
            isLoading,
          }, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">User Query Result:</h2>
        <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">useAuth Hook Result:</h2>
        <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
          {JSON.stringify({
            isAuthenticated: authHook.isAuthenticated,
            isLoading: authHook.isLoading,
            user: authHook.user,
          }, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Local Storage:</h2>
        <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
          {typeof window !== 'undefined' ? JSON.stringify(
            Object.keys(localStorage).filter(k => k.includes('convex')).reduce((acc, k) => {
              acc[k] = localStorage.getItem(k);
              return acc;
            }, {} as any),
            null, 2
          ) : 'Not available'}
        </pre>
      </div>

      <div className="flex gap-4">
        <button 
          onClick={async () => {
            await signIn("password", { email: "test@test.com", password: "testtest", flow: "signIn" });
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Test Sign In
        </button>
        <button 
          onClick={() => signOut()}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}