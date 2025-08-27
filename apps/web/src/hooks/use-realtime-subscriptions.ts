/**
 * Real-time subscription system that replaces useEffect WebSocket patterns
 * Integrates with TanStack Query for automatic cache invalidation
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MESSAGES_QUERY_KEYS } from './queries/use-messages-infinite';
import { SYNC_QUERY_KEYS } from './queries/use-sync-status';

// Define subscription event types
type SubscriptionEvent = 
  | { type: 'message:new'; chatId: string; messageId: string }
  | { type: 'message:update'; chatId: string; messageId: string }
  | { type: 'message:delete'; chatId: string; messageId: string }
  | { type: 'chat:update'; chatId: string }
  | { type: 'user:presence'; userId: string; status: 'online' | 'offline' | 'away' }
  | { type: 'sync:status'; status: any }
  | { type: 'typing:start'; chatId: string; userId: string }
  | { type: 'typing:stop'; chatId: string; userId: string };

class RealtimeManager {
  private static instance: RealtimeManager;
  private subscriptions = new Map<string, Set<(event: SubscriptionEvent) => void>>();
  private wsConnection: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | undefined;

  static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager();
    }
    return RealtimeManager.instance;
  }

  private constructor() {
    this.connect();
  }

  private connect() {
    if (typeof window === 'undefined') return;

    try {
      // TODO: Replace with actual WebSocket URL
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data: SubscriptionEvent = JSON.parse(event.data);
          this.handleEvent(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        this.scheduleReconnect();
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.connect();
    }, delay);
  }

  private handleEvent(event: SubscriptionEvent) {
    // Notify all subscribers for this event type
    const eventKey = `${event.type}`;
    const subscribers = this.subscriptions.get(eventKey);
    
    if (subscribers) {
      subscribers.forEach(callback => callback(event));
    }

    // Also notify wildcard subscribers
    const wildcardSubscribers = this.subscriptions.get('*');
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(callback => callback(event));
    }
  }

  subscribe(eventType: string, callback: (event: SubscriptionEvent) => void): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    
    this.subscriptions.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subscribers = this.subscriptions.get(eventType);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.subscriptions.clear();
  }
}

/**
 * Hook for message subscriptions that invalidate queries
 */
export function useMessageSubscriptions(chatId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId) return;

    const realtimeManager = RealtimeManager.getInstance();

    const handleMessageEvent = (event: SubscriptionEvent) => {
      if (event.type.startsWith('message:') && 'chatId' in event && event.chatId === chatId) {
        // Invalidate infinite messages query for this chat
        queryClient.invalidateQueries({ 
          queryKey: MESSAGES_QUERY_KEYS.infiniteMessages(chatId)
        });
      }
    };

    const unsubscribe = realtimeManager.subscribe('message:*', handleMessageEvent);
    return unsubscribe;
  }, [chatId, queryClient]);
}

/**
 * Hook for sync status subscriptions
 */
export function useSyncSubscriptions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const realtimeManager = RealtimeManager.getInstance();

    const handleSyncEvent = (event: SubscriptionEvent) => {
      if (event.type === 'sync:status') {
        queryClient.invalidateQueries({ 
          queryKey: SYNC_QUERY_KEYS.syncStatus
        });
      }
    };

    const unsubscribe = realtimeManager.subscribe('sync:status', handleSyncEvent);
    return unsubscribe;
  }, [queryClient]);
}

/**
 * Hook for presence subscriptions
 */
export function usePresenceSubscriptions() {
  const queryClient = useQueryClient();

  const handlePresenceUpdate = useCallback((userId: string, status: 'online' | 'offline' | 'away') => {
    // TODO: Create presence query keys when we add presence queries
    console.log(`User ${userId} is now ${status}`);
    // queryClient.invalidateQueries({ queryKey: ['presence', userId] });
  }, [queryClient]);

  useEffect(() => {
    const realtimeManager = RealtimeManager.getInstance();

    const handlePresenceEvent = (event: SubscriptionEvent) => {
      if (event.type === 'user:presence') {
        handlePresenceUpdate(event.userId, event.status);
      }
    };

    const unsubscribe = realtimeManager.subscribe('user:presence', handlePresenceEvent);
    return unsubscribe;
  }, [handlePresenceUpdate]);

  return { handlePresenceUpdate };
}

/**
 * Hook for typing indicators
 */
export function useTypingSubscriptions(chatId: string | null) {
  const queryClient = useQueryClient();

  const handleTyping = useCallback((userId: string, isTyping: boolean) => {
    // Update typing state in query cache
    queryClient.setQueryData(['typing', chatId], (prev: any) => ({
      ...prev,
      [userId]: isTyping
    }));
  }, [queryClient, chatId]);

  useEffect(() => {
    if (!chatId) return;

    const realtimeManager = RealtimeManager.getInstance();

    const handleTypingEvent = (event: SubscriptionEvent) => {
      if ((event.type === 'typing:start' || event.type === 'typing:stop') && 
          'chatId' in event && event.chatId === chatId) {
        handleTyping(event.userId, event.type === 'typing:start');
      }
    };

    const unsubscribeStart = realtimeManager.subscribe('typing:start', handleTypingEvent);
    const unsubscribeStop = realtimeManager.subscribe('typing:stop', handleTypingEvent);
    
    return () => {
      unsubscribeStart();
      unsubscribeStop();
    };
  }, [chatId, handleTyping]);

  return { handleTyping };
}

/**
 * Master subscription hook - sets up all real-time subscriptions
 */
export function useRealtimeSubscriptions(chatId: string | null) {
  useMessageSubscriptions(chatId);
  useSyncSubscriptions();
  usePresenceSubscriptions();
  useTypingSubscriptions(chatId);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect entirely as other components might be using it
      // RealtimeManager.getInstance().disconnect();
    };
  }, []);
}

// Export the manager for direct use if needed
export { RealtimeManager };