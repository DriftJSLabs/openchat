"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  getStoredToken,
  storeToken,
  removeToken,
  testToken,
  fetchOpenRouterModels,
  generatePKCEParams,
  buildOpenRouterAuthUrl,
  storePKCEState,
  getPKCEState,
  removePKCEState,
  exchangeCodeForToken,
} from '@/lib/auth/openrouter';
import { secureLogger } from '@/lib/secure-logger';

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

interface OpenRouterAuthContextType {
  // Auth state
  isConnected: boolean;
  isLoading: boolean;
  token: string | null;
  
  // Models
  availableModels: OpenRouterModel[];
  modelsLoading: boolean;
  
  // Auth actions
  connectOpenRouter: () => Promise<void>;
  disconnect: () => void;
  handleCallback: (code: string, state: string) => Promise<boolean>;
  
  // Model actions
  refreshModels: () => Promise<void>;
}

const OpenRouterAuthContext = createContext<OpenRouterAuthContextType | undefined>(undefined);

export function useOpenRouterAuth() {
  const context = useContext(OpenRouterAuthContext);
  if (context === undefined) {
    throw new Error('useOpenRouterAuth must be used within an OpenRouterAuthProvider');
  }
  return context;
}

interface OpenRouterAuthProviderProps {
  children: React.ReactNode;
}

export function OpenRouterAuthProvider({ children }: OpenRouterAuthProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  
  // Use ref to track mounted state and prevent race conditions
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Check existing token on mount (memoized to prevent stale closures)
  const checkExistingToken = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    setIsLoading(true);
    const storedToken = getStoredToken();
    
    if (storedToken && isMountedRef.current) {
      try {
        const isValid = await testToken(storedToken);
        if (isMountedRef.current) {
          if (isValid) {
            setToken(storedToken);
            setIsConnected(true);
          } else {
            // Token is invalid, remove it
            removeToken();
            setToken(null);
            setIsConnected(false);
          }
        }
      } catch (error) {
        if (isMountedRef.current) {
          secureLogger.error('Token validation error:', error instanceof Error ? error.message : 'Unknown error');
          removeToken();
          setToken(null);
          setIsConnected(false);
        }
      }
    }
    
    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    checkExistingToken();
  }, [checkExistingToken]);

  // Memoized models refresh function
  const refreshModels = useCallback(async () => {
    if (!token || !isMountedRef.current) return;
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setModelsLoading(true);
    
    try {
      const models = await fetchOpenRouterModels(token);
      if (isMountedRef.current) {
        setAvailableModels(models);
      }
    } catch (error) {
      if (isMountedRef.current && !abortControllerRef.current?.signal.aborted) {
        secureLogger.error('Models fetch error:', error instanceof Error ? error.message : 'Unknown error');
        setAvailableModels([]);
      }
    } finally {
      if (isMountedRef.current) {
        setModelsLoading(false);
      }
    }
  }, [token]);

  // Load models when token changes
  useEffect(() => {
    if (token && isConnected) {
      refreshModels();
    } else {
      setAvailableModels([]);
    }
  }, [token, isConnected, refreshModels]);

  const connectOpenRouter = useCallback(async () => {
    try {
      const pkceParams = await generatePKCEParams();
      const callbackUrl = `${window.location.origin}/auth/openrouter/callback`;
      
      // Store PKCE state for later verification
      storePKCEState(pkceParams);
      
      // Build auth URL and redirect
      const authUrl = buildOpenRouterAuthUrl(pkceParams, callbackUrl);
      window.location.href = authUrl;
    } catch (error) {
      secureLogger.error('Error initiating OpenRouter auth:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  const handleCallback = useCallback(async (code: string, state: string): Promise<boolean> => {
    if (!isMountedRef.current) return false;
    
    try {
      // Retrieve and verify PKCE state
      const storedPKCE = getPKCEState();
      if (!storedPKCE) {
        secureLogger.error('No stored PKCE state found');
        // Try to recover by checking if we already have a token
        const existingToken = getStoredToken();
        if (existingToken && await testToken(existingToken)) {
          if (isMountedRef.current) {
            setToken(existingToken);
            setIsConnected(true);
            return true;
          }
        }
        return false;
      }
      
      if (storedPKCE.state !== state) {
        secureLogger.error('OAuth state mismatch');
        // Clean up invalid state
        removePKCEState();
        return false;
      }

      // Exchange code for token
      const result = await exchangeCodeForToken(code, storedPKCE.codeVerifier);
      if (!result || !result.key) {
        secureLogger.error('Token exchange failed');
        removePKCEState();
        return false;
      }

      if (isMountedRef.current) {
        // Store token and update state
        storeToken(result.key);
        setToken(result.key);
        setIsConnected(true);
        
        // Clean up PKCE state
        removePKCEState();
        
        return true;
      }
      
      return false;
    } catch (error) {
      secureLogger.error('Error handling OAuth callback:', error instanceof Error ? error.message : 'Unknown error');
      removePKCEState();
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    removeToken();
    removePKCEState();
    if (isMountedRef.current) {
      setToken(null);
      setIsConnected(false);
      setAvailableModels([]);
    }
  }, []);

  const value: OpenRouterAuthContextType = {
    isConnected,
    isLoading,
    token,
    availableModels,
    modelsLoading,
    connectOpenRouter,
    disconnect,
    handleCallback,
    refreshModels,
  };

  return (
    <OpenRouterAuthContext.Provider value={value}>
      {children}
    </OpenRouterAuthContext.Provider>
  );
}