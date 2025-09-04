"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const checkExistingToken = useCallback(async () => {
    setIsLoading(true);
    const storedToken = await getStoredToken();
    
    if (storedToken) {
      const isValid = await testToken(storedToken);
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
    
    setIsLoading(false);
  }, []);

  const connectOpenRouter = async () => {
    try {
      const pkceParams = await generatePKCEParams();
      const callbackUrl = `${window.location.origin}/auth/openrouter/callback`;
      
      // Store PKCE state for later verification
      await storePKCEState(pkceParams);
      
      // Build auth URL and redirect
      const authUrl = buildOpenRouterAuthUrl(pkceParams, callbackUrl);
      window.location.href = authUrl;
    } catch (error) {
      }
  };

  const handleCallback = async (code: string, state: string): Promise<boolean> => {
    try {
      // Retrieve and verify PKCE state
      const storedPKCE = await getPKCEState();
      if (!storedPKCE) {
        // Try to recover by checking if we already have a token
        const existingToken = await getStoredToken();
        if (existingToken && await testToken(existingToken)) {
          setToken(existingToken);
          setIsConnected(true);
          return true;
        }
        return false;
      }
      
      if (storedPKCE.state !== state) {
        // Clean up invalid state
        removePKCEState();
        return false;
      }

      // Exchange code for token
      const result = await exchangeCodeForToken(code, storedPKCE.codeVerifier);
      if (!result || !result.key) {
        removePKCEState();
        return false;
      }

      // Store token and update state
      await storeToken(result.key);
      setToken(result.key);
      setIsConnected(true);
      
      // Clean up PKCE state
      removePKCEState();
      
      // Force a small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      removePKCEState();
      return false;
    }
  };

  const disconnect = () => {
    removeToken();
    removePKCEState();
    setToken(null);
    setIsConnected(false);
    setAvailableModels([]);
  };

  const refreshModels = useCallback(async () => {
    if (!token) return;
    
    setModelsLoading(true);
    try {
      const models = await fetchOpenRouterModels(token);
      
      // Format ALL models with better info
      const formattedModels = models
        .filter(model => model.id && model.name) // Only require id and name
        .map(model => ({
          id: model.id,
          name: model.name || model.id.split('/').pop() || model.id,
          description: model.description,
          context_length: model.context_length,
          pricing: model.pricing,
          top_provider: model.top_provider,
          per_request_limits: model.per_request_limits,
        }))
        .sort((a, b) => {
          // Sort by: free first, then by name
          const aFree = a.pricing?.prompt === '0' && a.pricing?.completion === '0';
          const bFree = b.pricing?.prompt === '0' && b.pricing?.completion === '0';
          
          if (aFree && !bFree) return -1;
          if (!aFree && bFree) return 1;
          
          return a.name.localeCompare(b.name);
        });
      
      setAvailableModels(formattedModels);
    } catch (error) {
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [token]);

  // Check existing token on mount
  useEffect(() => {
    checkExistingToken();
  }, [checkExistingToken]);

  // Load models when token changes
  useEffect(() => {
    if (token && isConnected) {
      refreshModels();
    } else {
      setAvailableModels([]);
    }
  }, [token, isConnected, refreshModels]);

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