import { useRef, useEffect } from 'react';
import type { UserPresence, PresenceStatus, DeviceType } from '@/components/user-presence';

/**
 * Presence update event types
 */
export interface PresenceUpdateEvent {
  userId: string;
  status: PresenceStatus;
  lastSeen: Date;
  isTyping?: boolean;
  currentDevice?: DeviceType;
  customMessage?: string;
}

/**
 * Typing event data
 */
export interface TypingEvent {
  userId: string;
  chatId: string;
  isTyping: boolean;
  timestamp: Date;
}

/**
 * Presence manager event listeners
 */
export interface PresenceManagerEvents {
  presenceUpdate: (event: PresenceUpdateEvent) => void;
  typing: (event: TypingEvent) => void;
  userOnline: (userId: string) => void;
  userOffline: (userId: string) => void;
}

/**
 * Real-time presence manager for tracking user activity and status.
 * Integrates with WebSocket connections and local state management.
 */
export class PresenceManager {
  private presenceMap = new Map<string, UserPresence>();
  private typingTimeouts = new Map<string, NodeJS.Timeout>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private visibilityHandler: (() => void) | null = null;
  private eventListeners = new Map<keyof PresenceManagerEvents, Set<Function>>();
  
  // Configuration
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly TYPING_TIMEOUT = 3000; // 3 seconds
  private readonly OFFLINE_THRESHOLD = 60000; // 1 minute

  constructor(
    private currentUserId: string,
    private websocket?: WebSocket
  ) {
    this.initialize();
  }

  /**
   * Initialize the presence manager
   */
  private initialize(): void {
    this.startHeartbeat();
    this.setupVisibilityHandling();
    this.setupWebSocketListeners();
  }

  /**
   * Start heartbeat to maintain presence
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updateOwnPresence('online');
      this.cleanupStalePresences();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Setup page visibility handling for presence updates
   */
  private setupVisibilityHandling(): void {
    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.updateOwnPresence('away');
        } else {
          this.updateOwnPresence('online');
        }
      };

      document.addEventListener('visibilitychange', this.visibilityHandler);
      window.addEventListener('beforeunload', () => {
        this.updateOwnPresence('offline');
      });
    }
  }

  /**
   * Setup WebSocket listeners for real-time updates
   */
  private setupWebSocketListeners(): void {
    if (!this.websocket) return;

    this.websocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'presence_update':
            this.handlePresenceUpdate(data.payload);
            break;
          case 'typing_start':
            this.handleTypingStart(data.payload);
            break;
          case 'typing_stop':
            this.handleTypingStop(data.payload);
            break;
        }
      } catch (error) {
        console.error('Error handling presence WebSocket message:', error);
      }
    });
  }

  /**
   * Handle incoming presence updates
   */
  private handlePresenceUpdate(payload: PresenceUpdateEvent): void {
    const existingPresence = this.presenceMap.get(payload.userId);
    
    const updatedPresence: UserPresence = {
      userId: payload.userId,
      status: payload.status,
      lastSeen: payload.lastSeen,
      isTyping: payload.isTyping || false,
      currentDevice: payload.currentDevice || 'unknown',
      customMessage: payload.customMessage,
      onlineDevices: existingPresence?.onlineDevices || ['unknown'],
    };

    // Check for status changes
    if (existingPresence?.status !== payload.status) {
      if (payload.status === 'online' && existingPresence?.status === 'offline') {
        this.emitEvent('userOnline', payload.userId);
      } else if (payload.status === 'offline' && existingPresence?.status !== 'offline') {
        this.emitEvent('userOffline', payload.userId);
      }
    }

    this.presenceMap.set(payload.userId, updatedPresence);
    this.emitEvent('presenceUpdate', payload);
  }

  /**
   * Handle typing start events
   */
  private handleTypingStart(payload: TypingEvent): void {
    this.setUserTyping(payload.userId, true);
    this.emitEvent('typing', payload);

    // Clear existing timeout
    const existingTimeout = this.typingTimeouts.get(payload.userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout to stop typing
    const timeout = setTimeout(() => {
      this.setUserTyping(payload.userId, false);
      this.typingTimeouts.delete(payload.userId);
    }, this.TYPING_TIMEOUT);

    this.typingTimeouts.set(payload.userId, timeout);
  }

  /**
   * Handle typing stop events
   */
  private handleTypingStop(payload: TypingEvent): void {
    this.setUserTyping(payload.userId, false);
    
    // Clear timeout
    const timeout = this.typingTimeouts.get(payload.userId);
    if (timeout) {
      clearTimeout(timeout);
      this.typingTimeouts.delete(payload.userId);
    }

    this.emitEvent('typing', { ...payload, isTyping: false });
  }

  /**
   * Update current user's presence
   */
  public updateOwnPresence(status: PresenceStatus, customMessage?: string): void {
    const presence: UserPresence = {
      userId: this.currentUserId,
      status,
      lastSeen: new Date(),
      isTyping: false,
      currentDevice: this.detectDevice(),
      customMessage,
      onlineDevices: [this.detectDevice()],
    };

    this.presenceMap.set(this.currentUserId, presence);
    
    // Send to server
    this.sendPresenceUpdate({
      userId: this.currentUserId,
      status,
      lastSeen: presence.lastSeen,
      currentDevice: presence.currentDevice,
      customMessage,
    });
  }

  /**
   * Set typing status for current user
   */
  public setTyping(chatId: string, isTyping: boolean): void {
    const presence = this.presenceMap.get(this.currentUserId);
    if (presence) {
      presence.isTyping = isTyping;
      this.presenceMap.set(this.currentUserId, presence);
    }

    // Send typing event
    this.sendTypingEvent({
      userId: this.currentUserId,
      chatId,
      isTyping,
      timestamp: new Date(),
    });
  }

  /**
   * Set typing status for another user (used when receiving events)
   */
  private setUserTyping(userId: string, isTyping: boolean): void {
    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.isTyping = isTyping;
      this.presenceMap.set(userId, presence);
    }
  }

  /**
   * Get presence for a specific user
   */
  public getUserPresence(userId: string): UserPresence | null {
    return this.presenceMap.get(userId) || null;
  }

  /**
   * Get all user presences
   */
  public getAllPresences(): UserPresence[] {
    return Array.from(this.presenceMap.values());
  }

  /**
   * Get users who are currently typing in a chat
   */
  public getTypingUsers(chatId: string): string[] {
    return Array.from(this.presenceMap.values())
      .filter(presence => presence.isTyping && presence.userId !== this.currentUserId)
      .map(presence => presence.userId);
  }

  /**
   * Get online users count
   */
  public getOnlineCount(): number {
    return Array.from(this.presenceMap.values())
      .filter(presence => presence.status === 'online').length;
  }

  /**
   * Check if a user is online
   */
  public isUserOnline(userId: string): boolean {
    const presence = this.presenceMap.get(userId);
    return presence?.status === 'online' || false;
  }

  /**
   * Add event listener
   */
  public on<T extends keyof PresenceManagerEvents>(
    event: T,
    listener: PresenceManagerEvents[T]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  public off<T extends keyof PresenceManagerEvents>(
    event: T,
    listener: PresenceManagerEvents[T]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent<T extends keyof PresenceManagerEvents>(
    event: T,
    ...args: Parameters<PresenceManagerEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in presence event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Send presence update to server
   */
  private sendPresenceUpdate(update: PresenceUpdateEvent): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'presence_update',
        payload: update
      }));
    }
  }

  /**
   * Send typing event to server
   */
  private sendTypingEvent(event: TypingEvent): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: event.isTyping ? 'typing_start' : 'typing_stop',
        payload: event
      }));
    }
  }

  /**
   * Detect current device type
   */
  private detectDevice(): DeviceType {
    if (typeof navigator === 'undefined') return 'unknown';

    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/tablet|ipad|playbook|silk/.test(userAgent)) {
      return 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/.test(userAgent)) {
      return 'mobile';
    } else {
      return 'desktop';
    }
  }

  /**
   * Clean up stale presences (users who haven't been seen recently)
   */
  private cleanupStalePresences(): void {
    const now = new Date();
    const staleUserIds: string[] = [];

    this.presenceMap.forEach((presence, userId) => {
      if (userId === this.currentUserId) return; // Don't clean up own presence

      const timeSinceLastSeen = now.getTime() - presence.lastSeen.getTime();
      if (timeSinceLastSeen > this.OFFLINE_THRESHOLD && presence.status !== 'offline') {
        // Mark as offline
        presence.status = 'offline';
        presence.isTyping = false;
        this.presenceMap.set(userId, presence);
        this.emitEvent('userOffline', userId);
        this.emitEvent('presenceUpdate', {
          userId,
          status: 'offline',
          lastSeen: presence.lastSeen,
          isTyping: false
        });
      }

      // Remove very old offline presences
      if (timeSinceLastSeen > this.OFFLINE_THRESHOLD * 10) {
        staleUserIds.push(userId);
      }
    });

    // Remove stale presences
    staleUserIds.forEach(userId => {
      this.presenceMap.delete(userId);
    });
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    // Clear all typing timeouts
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.typingTimeouts.clear();

    // Clear event listeners
    this.eventListeners.clear();

    // Set own presence to offline
    this.updateOwnPresence('offline');
  }
}

/**
 * Factory function to create a presence manager
 */
export function createPresenceManager(
  userId: string,
  websocket?: WebSocket
): PresenceManager {
  return new PresenceManager(userId, websocket);
}

/**
 * React hook for using presence manager
 */
export function usePresenceManager(userId: string, websocket?: WebSocket) {
  const managerRef = useRef<PresenceManager | null>(null);
  
  useEffect(() => {
    managerRef.current = createPresenceManager(userId, websocket);
    
    return () => {
      managerRef.current?.dispose();
    };
  }, [userId, websocket]);

  return managerRef.current;
}