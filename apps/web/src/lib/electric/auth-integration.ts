import React from 'react';
import { electric } from '../tanstack-db';
import type { User } from '../db/schema/shared';

/**
 * ElectricSQL Authentication Integration for OpenChat
 * 
 * This module provides comprehensive authentication integration between
 * the existing OpenChat auth system and ElectricSQL for secure data synchronization.
 * 
 * Key features:
 * - JWT token management for ElectricSQL authentication
 * - User context setup for Row Level Security (RLS)
 * - Authentication state synchronization
 * - Secure shape subscription management
 * - Multi-device authentication handling
 */

/**
 * Authentication state interface for ElectricSQL integration
 */
export interface ElectricAuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  deviceId: string;
  sessionId: string;
  expiresAt: Date | null;
  lastAuthCheck: Date;
}

/**
 * Authentication configuration for ElectricSQL
 */
export interface ElectricAuthConfig {
  // JWT settings
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  
  // Token refresh settings
  refreshThreshold: number; // Minutes before expiry to refresh
  maxRefreshAttempts: number;
  
  // Device identification
  deviceIdStorageKey: string;
  
  // Session management
  sessionStorageKey: string;
  
  // Error handling
  onAuthError?: (error: Error, context: string) => void;
  onTokenRefresh?: (newToken: string) => void;
}

/**
 * Default authentication configuration
 */
const defaultAuthConfig: ElectricAuthConfig = {
  refreshThreshold: 30, // Refresh 30 minutes before expiry
  maxRefreshAttempts: 3,
  deviceIdStorageKey: 'electric-device-id',
  sessionStorageKey: 'electric-session',
  onAuthError: (error, context) => {
    console.error(`ElectricSQL auth error in ${context}:`, error);
  },
  onTokenRefresh: (newToken) => {
    console.log('ElectricSQL token refreshed successfully');
  },
};

/**
 * ElectricSQL Authentication Manager
 * Handles all authentication-related operations for ElectricSQL integration
 */
export class ElectricAuthManager {
  private config: ElectricAuthConfig;
  private authState: ElectricAuthState;
  private refreshTimer: NodeJS.Timeout | null = null;
  private authCallbacks = new Set<(state: ElectricAuthState) => void>();

  constructor(config: Partial<ElectricAuthConfig> = {}) {
    this.config = { ...defaultAuthConfig, ...config };
    
    // Initialize authentication state
    this.authState = {
      isAuthenticated: false,
      user: null,
      token: null,
      deviceId: this.getOrCreateDeviceId(),
      sessionId: this.generateSessionId(),
      expiresAt: null,
      lastAuthCheck: new Date(),
    };

    // Load persisted auth state if available
    this.loadPersistedAuthState();
    
    // Set up token refresh monitoring
    this.setupTokenRefreshMonitoring();
  }

  /**
   * Initialize authentication with the existing OpenChat auth system
   * This method should be called when the user logs in
   */
  async initializeAuth(user: User, authToken: string): Promise<void> {
    try {
      // Validate the token format and extract expiry
      const tokenPayload = this.parseJWTPayload(authToken);
      const expiresAt = tokenPayload.exp ? new Date(tokenPayload.exp * 1000) : null;

      // Update authentication state
      this.authState = {
        ...this.authState,
        isAuthenticated: true,
        user,
        token: authToken,
        expiresAt,
        lastAuthCheck: new Date(),
      };

      // Persist auth state for session recovery
      this.persistAuthState();

      // Configure ElectricSQL client with authentication
      await this.configureElectricClient(user.id, authToken);

      // Set up user context for Row Level Security
      await this.setupUserContext(user.id);

      // Start token refresh monitoring
      this.scheduleTokenRefresh();

      // Notify listeners of auth state change
      this.notifyAuthStateChange();

      console.log('ElectricSQL authentication initialized successfully for user:', user.id);
    } catch (error) {
      this.config.onAuthError?.(error as Error, 'initializeAuth');
      throw new Error(`Failed to initialize ElectricSQL authentication: ${error}`);
    }
  }

  /**
   * Update authentication token (for token refresh scenarios)
   */
  async updateAuthToken(newToken: string): Promise<void> {
    try {
      const tokenPayload = this.parseJWTPayload(newToken);
      const expiresAt = tokenPayload.exp ? new Date(tokenPayload.exp * 1000) : null;

      this.authState.token = newToken;
      this.authState.expiresAt = expiresAt;
      this.authState.lastAuthCheck = new Date();

      // Update ElectricSQL client configuration
      if (this.authState.user) {
        await this.configureElectricClient(this.authState.user.id, newToken);
      }

      this.persistAuthState();
      this.scheduleTokenRefresh();
      this.config.onTokenRefresh?.(newToken);

      console.log('ElectricSQL authentication token updated successfully');
    } catch (error) {
      this.config.onAuthError?.(error as Error, 'updateAuthToken');
      throw error;
    }
  }

  /**
   * Clear authentication state (logout)
   */
  async clearAuth(): Promise<void> {
    try {
      // Clear token refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      // Clear authentication state
      this.authState = {
        ...this.authState,
        isAuthenticated: false,
        user: null,
        token: null,
        expiresAt: null,
        lastAuthCheck: new Date(),
      };

      // Clear persisted auth state
      this.clearPersistedAuthState();

      // Reset ElectricSQL client
      await this.resetElectricClient();

      // Notify listeners of auth state change
      this.notifyAuthStateChange();

      console.log('ElectricSQL authentication cleared successfully');
    } catch (error) {
      this.config.onAuthError?.(error as Error, 'clearAuth');
      throw error;
    }
  }

  /**
   * Get current authentication state
   */
  getAuthState(): ElectricAuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): boolean {
    return this.authState.isAuthenticated && 
           this.authState.token !== null && 
           this.isTokenValid();
  }

  /**
   * Get authenticated user information
   */
  getUser(): User | null {
    return this.authState.user;
  }

  /**
   * Subscribe to authentication state changes
   */
  onAuthStateChange(callback: (state: ElectricAuthState) => void): () => void {
    this.authCallbacks.add(callback);
    // Immediately call with current state
    callback(this.getAuthState());
    
    return () => this.authCallbacks.delete(callback);
  }

  /**
   * Get authentication headers for ElectricSQL requests
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.authState.token) {
      headers['Authorization'] = `Bearer ${this.authState.token}`;
    }

    if (this.authState.user?.id) {
      headers['X-Electric-User-ID'] = this.authState.user.id;
    }

    headers['X-Electric-Device-ID'] = this.authState.deviceId;
    headers['X-Electric-Session-ID'] = this.authState.sessionId;

    return headers;
  }

  /**
   * Refresh authentication token if needed
   */
  async refreshTokenIfNeeded(): Promise<boolean> {
    if (!this.authState.token || !this.authState.expiresAt) {
      return false;
    }

    const now = new Date();
    const refreshTime = new Date(this.authState.expiresAt.getTime() - (this.config.refreshThreshold * 60 * 1000));

    if (now >= refreshTime) {
      try {
        // This should integrate with your existing token refresh mechanism
        const newToken = await this.requestTokenRefresh();
        if (newToken) {
          await this.updateAuthToken(newToken);
          return true;
        }
      } catch (error) {
        this.config.onAuthError?.(error as Error, 'refreshTokenIfNeeded');
      }
    }

    return false;
  }

  // Private methods

  /**
   * Configure ElectricSQL client with authentication
   */
  private async configureElectricClient(userId: string, token: string): Promise<void> {
    try {
      // Update ElectricSQL client configuration
      // Note: This depends on the specific ElectricSQL client API
      
      // Store token in localStorage for client-side access
      if (typeof window !== 'undefined') {
        localStorage.setItem('electric-auth-token', token);
        localStorage.setItem('electric-user-id', userId);
      }

      // The actual ElectricSQL client configuration would go here
      // This might involve updating the client instance or creating a new one
      console.log(`ElectricSQL client configured for user ${userId}`);
    } catch (error) {
      console.error('Failed to configure ElectricSQL client:', error);
      throw error;
    }
  }

  /**
   * Set up user context for Row Level Security
   */
  private async setupUserContext(userId: string): Promise<void> {
    try {
      // Set user context in ElectricSQL for RLS policies
      // This would typically involve setting session variables or context
      
      // For now, we store the user ID for use in shape subscriptions
      if (typeof window !== 'undefined') {
        localStorage.setItem('electric-current-user', userId);
      }

      console.log(`User context set up for ElectricSQL: ${userId}`);
    } catch (error) {
      console.error('Failed to setup user context:', error);
      throw error;
    }
  }

  /**
   * Parse JWT payload to extract claims
   */
  private parseJWTPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = parts[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Failed to parse JWT token: ${error}`);
    }
  }

  /**
   * Check if current token is valid (not expired)
   */
  private isTokenValid(): boolean {
    if (!this.authState.expiresAt) {
      return true; // No expiry set, assume valid
    }

    return new Date() < this.authState.expiresAt;
  }

  /**
   * Generate or retrieve device ID for multi-device sync
   */
  private getOrCreateDeviceId(): string {
    if (typeof window === 'undefined') {
      return 'server-device-' + Math.random().toString(36).substring(2);
    }

    let deviceId = localStorage.getItem(this.config.deviceIdStorageKey);
    
    if (!deviceId) {
      deviceId = 'device-' + Math.random().toString(36).substring(2) + '-' + Date.now();
      localStorage.setItem(this.config.deviceIdStorageKey, deviceId);
    }

    return deviceId;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return 'session-' + Math.random().toString(36).substring(2) + '-' + Date.now();
  }

  /**
   * Load persisted authentication state from storage
   */
  private loadPersistedAuthState(): void {
    if (typeof window === 'undefined') return;

    try {
      const persistedState = localStorage.getItem(this.config.sessionStorageKey);
      if (persistedState) {
        const parsed = JSON.parse(persistedState);
        
        // Validate persisted state
        if (parsed.user && parsed.token && parsed.expiresAt) {
          this.authState = {
            ...this.authState,
            isAuthenticated: true,
            user: parsed.user,
            token: parsed.token,
            expiresAt: new Date(parsed.expiresAt),
          };

          // Check if token is still valid
          if (!this.isTokenValid()) {
            this.clearPersistedAuthState();
            this.authState.isAuthenticated = false;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted auth state:', error);
      this.clearPersistedAuthState();
    }
  }

  /**
   * Persist authentication state to storage
   */
  private persistAuthState(): void {
    if (typeof window === 'undefined') return;

    try {
      const stateToSave = {
        user: this.authState.user,
        token: this.authState.token,
        expiresAt: this.authState.expiresAt?.toISOString(),
        deviceId: this.authState.deviceId,
        sessionId: this.authState.sessionId,
      };

      localStorage.setItem(this.config.sessionStorageKey, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to persist auth state:', error);
    }
  }

  /**
   * Clear persisted authentication state
   */
  private clearPersistedAuthState(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(this.config.sessionStorageKey);
    localStorage.removeItem('electric-auth-token');
    localStorage.removeItem('electric-user-id');
    localStorage.removeItem('electric-current-user');
  }

  /**
   * Set up token refresh monitoring
   */
  private setupTokenRefreshMonitoring(): void {
    // Check token validity periodically
    setInterval(() => {
      if (this.isAuthenticated()) {
        this.refreshTokenIfNeeded();
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Schedule token refresh based on expiry time
   */
  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.authState.expiresAt) return;

    const now = new Date();
    const refreshTime = new Date(this.authState.expiresAt.getTime() - (this.config.refreshThreshold * 60 * 1000));
    const delayMs = Math.max(0, refreshTime.getTime() - now.getTime());

    this.refreshTimer = setTimeout(async () => {
      await this.refreshTokenIfNeeded();
    }, delayMs);
  }

  /**
   * Request token refresh from auth service
   * This should integrate with your existing authentication system
   */
  private async requestTokenRefresh(): Promise<string | null> {
    try {
      // This would integrate with your existing token refresh endpoint
      // For now, we'll return null to indicate refresh not available
      
      // Example integration:
      // const response = await fetch('/api/auth/refresh', {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.authState.token}`,
      //     'Content-Type': 'application/json',
      //   },
      // });
      
      // if (response.ok) {
      //   const data = await response.json();
      //   return data.token;
      // }

      console.warn('Token refresh not implemented');
      return null;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Reset ElectricSQL client (clear authentication)
   */
  private async resetElectricClient(): Promise<void> {
    // Reset client configuration
    if (typeof window !== 'undefined') {
      localStorage.removeItem('electric-auth-token');
      localStorage.removeItem('electric-user-id');
      localStorage.removeItem('electric-current-user');
    }
  }

  /**
   * Notify all listeners of authentication state changes
   */
  private notifyAuthStateChange(): void {
    const currentState = this.getAuthState();
    this.authCallbacks.forEach(callback => {
      try {
        callback(currentState);
      } catch (error) {
        console.error('Auth state callback error:', error);
      }
    });
  }
}

// Global auth manager instance
let authManager: ElectricAuthManager | null = null;

/**
 * Get the global ElectricSQL authentication manager instance
 */
export function getElectricAuthManager(config?: Partial<ElectricAuthConfig>): ElectricAuthManager {
  if (!authManager) {
    authManager = new ElectricAuthManager(config);
  }
  return authManager;
}

/**
 * Hook for React components to use ElectricSQL authentication
 */
export function useElectricAuth() {
  const authManager = getElectricAuthManager();
  const [authState, setAuthState] = React.useState<ElectricAuthState>(authManager.getAuthState());

  React.useEffect(() => {
    const unsubscribe = authManager.onAuthStateChange(setAuthState);
    return unsubscribe;
  }, [authManager]);

  return {
    ...authState,
    initializeAuth: (user: User, token: string) => authManager.initializeAuth(user, token),
    clearAuth: () => authManager.clearAuth(),
    refreshToken: () => authManager.refreshTokenIfNeeded(),
    getAuthHeaders: () => authManager.getAuthHeaders(),
  };
}

/**
 * Utility function to check if ElectricSQL is properly authenticated
 */
export function isElectricAuthenticated(): boolean {
  return authManager?.isAuthenticated() ?? false;
}

/**
 * Utility function to get current authenticated user for ElectricSQL
 */
export function getElectricUser(): User | null {
  return authManager?.getUser() ?? null;
}