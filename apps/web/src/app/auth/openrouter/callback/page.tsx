"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOpenRouterAuth } from "@/contexts/openrouter-auth";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OpenRouterCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleCallback } = useOpenRouterAuth();
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (errorParam) {
        setStatus('error');
        setError(`OAuth error: ${errorParam}${errorDescription ? ` - ${errorDescription}` : ''}`);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setError('Missing required OAuth parameters from callback');
        return;
      }

      try {
        const success = await handleCallback(code, state);
        if (success) {
          setStatus('success');
          // Use replace instead of push to avoid back button issues
          // And use a shorter delay
          setTimeout(() => {
            router.replace('/');
          }, 1000);
        } else {
          setStatus('error');
          setError('Invalid authentication state. This can happen if you have multiple tabs open or the authentication expired. Please try again.');
        }
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Unknown error occurred during OAuth');
      }
    };

    processCallback();
  }, [searchParams, handleCallback, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md text-center">
        {status === 'processing' && (
          <div className="space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <h1 className="text-xl font-semibold">Connecting to OpenRouter...</h1>
            <p className="text-muted-foreground">
              Please wait while we complete the authentication process.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
            <h1 className="text-xl font-semibold text-green-600">Successfully Connected!</h1>
            <p className="text-muted-foreground">
              Your OpenRouter account has been connected. Redirecting you back to the chat...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <XCircle className="h-8 w-8 mx-auto text-red-500" />
            <h1 className="text-xl font-semibold text-red-600">Connection Failed</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button
              onClick={() => router.push('/')}
              className="mt-4"
            >
              Return to Chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}