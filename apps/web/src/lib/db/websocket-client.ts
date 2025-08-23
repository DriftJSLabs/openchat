/**
 * Robust WebSocket client with automatic reconnection, authentication, and error handling
 * 
 * This client provides:
 * - Automatic reconnection with exponential backoff
 * - Authentication token management and refresh
 * - Message queuing during disconnections
 * - Heartbeat/ping-pong for connection health
 * - Graceful degradation when WebSocket is unavailable
 * - TypeScript safety for all message types
 */

import { getRetryManager } from './retry-manager';
import { getSyncAuthManager } from './sync-auth';
import { getDatabaseErrorHandler } from './error-handler';

export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'closed';

export interface WebSocketMessage {
  id: string;
  type: 'ping' | 'pong' | 'auth' | 'sync' | 'typing' | 'presence' | 'error';
  timestamp: number;
  data?: any;
  userId?: string;
  deviceId?: string;
}

export interface WebSocketConnectionOptions {
  url: string;
  protocols?: string[];
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  heartbeatIntervalMs?: number;
  connectionTimeoutMs?: number;
  authTimeoutMs?: number;
  messageQueueLimit?: number;
  enableCompression?: boolean;
}

export interface WebSocketEventMap {
  'state-change': { state: WebSocketState; previousState: WebSocketState };
  'message': WebSocketMessage;
  'authenticated': { userId: string; deviceId: string };
  'auth-failed': { error: string; reason: string };
  'connection-error': { error: Event | Error; reconnectIn?: number };
  'reconnect-attempt': { attempt: number; maxAttempts: number };
  'reconnect-success': { attempt: number; totalReconnectTime: number };
  'reconnect-failed': { totalAttempts: number; totalTime: number };
  'queue-overflow': { droppedMessages: number };
  'latency-update': { latency: number; timestamp: number };
}

/**
 * Type-safe event emitter for WebSocket events
 */
class WebSocketEventEmitter {
  private listeners = new Map<keyof WebSocketEventMap, Set<Function>>();

  on<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (data: WebSocketEventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  emit<K extends keyof WebSocketEventMap>(event: K, data: WebSocketEventMap[K]): void {
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`WebSocket event listener error for ${event}:`, error);
      }
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export class WebSocketClient extends WebSocketEventEmitter {
  private ws: WebSocket | null = null;
  private state: WebSocketState = 'disconnected';
  private options: Required<WebSocketConnectionOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private authTimer: NodeJS.Timeout | null = null;
  
  // Message handling
  private messageQueue: WebSocketMessage[] = [];
  private pendingMessages = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();
  private lastPingTime: number = 0;
  private latencyHistory: number[] = [];
  
  // Dependencies
  private retryManager = getRetryManager();
  private authManager = getSyncAuthManager();
  private errorHandler = getDatabaseErrorHandler();
  
  // Authentication state
  private isAuthenticated = false;
  private authenticationPromise: Promise<void> | null = null;
  private reconnectStartTime: number = 0;

  constructor(options: WebSocketConnectionOptions) {
    super();
    
    // Set default options with comprehensive configuration
    this.options = {
      protocols: [],
      maxReconnectAttempts: 10,
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      heartbeatIntervalMs: 30000,
      connectionTimeoutMs: 10000,
      authTimeoutMs: 5000,
      messageQueueLimit: 1000,
      enableCompression: true,
      ...options
    };
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    state: WebSocketState;
    isAuthenticated: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
    averageLatency: number;
    isConnected: boolean;
  } {
    return {
      state: this.state,
      isAuthenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      averageLatency: this.getAverageLatency(),
      isConnected: this.isConnected()
    };
  }

  /**
   * Check if WebSocket is connected and authenticated
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.isAuthenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to WebSocket server with authentication
   */
  async connect(userId: string, authToken: string): Promise<void> {
    if (this.state === 'connecting' || this.isConnected()) {
      return;
    }

    this.setState('connecting');
    this.reconnectStartTime = Date.now();

    try {
      await this.establishConnection();
      await this.authenticateConnection(userId, authToken);
      this.startHeartbeat();
      this.processQueuedMessages();
      
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      
      this.emit('reconnect-success', {
        attempt: this.reconnectAttempts,
        totalReconnectTime: Date.now() - this.reconnectStartTime
      });

    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Disconnect WebSocket connection
   */
  disconnect(): void {
    this.clearTimers();
    this.isAuthenticated = false;
    this.authenticationPromise = null;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.setState('disconnected');
  }

  /**
   * Send message through WebSocket with optional acknowledgment
   */
  async sendMessage(message: Omit<WebSocketMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: WebSocketMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now()
    };

    // Queue message if not connected
    if (!this.isConnected()) {
      this.queueMessage(fullMessage);
      return fullMessage.id;
    }

    try {
      await this.sendMessageImmediate(fullMessage);
      return fullMessage.id;
    } catch (error) {
      this.errorHandler.handleError(error, { 
        operation: 'sendMessage', 
        messageType: message.type 
      });
      
      // Queue message for retry if send fails
      this.queueMessage(fullMessage);
      throw error;
    }
  }

  /**
   * Send message with acknowledgment (returns promise that resolves when server confirms)
   */
  async sendMessageWithAck(
    message: Omit<WebSocketMessage, 'id' | 'timestamp'>,
    timeoutMs: number = 10000
  ): Promise<WebSocketMessage> {
    const messageId = await this.sendMessage(message);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        reject(new Error(`Message acknowledgment timeout: ${messageId}`));
      }, timeoutMs);

      this.pendingMessages.set(messageId, {
        resolve: (response: WebSocketMessage) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      });
    });
  }

  /**
   * Get current connection latency
   */
  getLatency(): number {
    return this.latencyHistory.length > 0 
      ? this.latencyHistory[this.latencyHistory.length - 1] 
      : -1;
  }

  /**
   * Force reconnection (useful for testing or manual recovery)
   */
  forceReconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Force reconnect');
    }
    this.scheduleReconnect();
  }

  // Private methods

  private setState(newState: WebSocketState): void {
    const previousState = this.state;
    this.state = newState;
    this.emit('state-change', { state: newState, previousState });
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket with optional compression
        const wsUrl = new URL(this.options.url);
        if (this.options.enableCompression) {
          wsUrl.searchParams.set('compression', 'true');
        }

        this.ws = new WebSocket(wsUrl.toString(), this.options.protocols);
        
        // Set up connection timeout
        this.connectionTimer = setTimeout(() => {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }, this.options.connectionTimeoutMs);

        this.ws.onopen = () => {
          this.clearTimer('connection');
          this.setupWebSocketHandlers();
          resolve();
        };

        this.ws.onerror = (error) => {
          this.clearTimer('connection');
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleIncomingMessage(message);
      } catch (error) {
        this.errorHandler.handleError(error, { 
          operation: 'parseWebSocketMessage',
          rawData: event.data 
        });
      }
    };

    this.ws.onclose = (event) => {
      this.handleConnectionClose(event);
    };

    this.ws.onerror = (error) => {
      this.handleConnectionError(error);
    };
  }

  private async authenticateConnection(userId: string, authToken: string): Promise<void> {
    if (this.authenticationPromise) {
      return this.authenticationPromise;
    }

    this.authenticationPromise = new Promise(async (resolve, reject) => {
      try {
        // Set authentication timeout
        this.authTimer = setTimeout(() => {
          reject(new Error('Authentication timeout'));
        }, this.options.authTimeoutMs);

        // Create authentication message
        const authMessage: WebSocketMessage = {
          id: this.generateMessageId(),
          type: 'auth',
          timestamp: Date.now(),
          userId,
          deviceId: this.authManager.getDeviceId(),
          data: {
            token: authToken,
            version: '1.0',
            capabilities: ['sync', 'typing', 'presence']
          }
        };

        // Listen for auth response
        const unsubscribe = this.on('message', (message) => {
          if (message.type === 'auth' && message.data?.success) {
            this.clearTimer('auth');
            this.isAuthenticated = true;
            this.setState('connected');
            unsubscribe();
            
            this.emit('authenticated', {
              userId: message.userId!,
              deviceId: message.deviceId!
            });
            
            resolve();
          } else if (message.type === 'auth' && message.data?.error) {
            this.clearTimer('auth');
            unsubscribe();
            
            this.emit('auth-failed', {
              error: message.data.error,
              reason: message.data.reason || 'Unknown authentication error'
            });
            
            reject(new Error(`Authentication failed: ${message.data.error}`));
          }
        });

        // Send authentication message
        await this.sendMessageImmediate(authMessage);

      } catch (error) {
        this.clearTimer('auth');
        this.authenticationPromise = null;
        reject(error);
      }
    });

    return this.authenticationPromise;
  }

  private handleIncomingMessage(message: WebSocketMessage): void {
    // Handle pong responses for latency measurement
    if (message.type === 'pong') {
      this.handlePongMessage(message);
      return;
    }

    // Handle message acknowledgments
    if (message.data?.ackFor) {
      const pending = this.pendingMessages.get(message.data.ackFor);
      if (pending) {
        this.pendingMessages.delete(message.data.ackFor);
        pending.resolve(message);
      }
      return;
    }

    // Emit message event for application handling
    this.emit('message', message);
  }

  private handlePongMessage(message: WebSocketMessage): void {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime;
      this.updateLatencyHistory(latency);
      this.emit('latency-update', { latency, timestamp: Date.now() });
    }
  }

  private updateLatencyHistory(latency: number): void {
    this.latencyHistory.push(latency);
    
    // Keep only last 10 latency measurements
    if (this.latencyHistory.length > 10) {
      this.latencyHistory.shift();
    }
  }

  private getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return -1;
    
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.latencyHistory.length);
  }

  private startHeartbeat(): void {
    this.clearTimer('heartbeat');
    
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isConnected()) {
        this.clearTimer('heartbeat');
        return;
      }

      try {
        this.lastPingTime = Date.now();
        await this.sendMessageImmediate({
          id: this.generateMessageId(),
          type: 'ping',
          timestamp: Date.now()
        });
      } catch (error) {
        this.errorHandler.handleError(error, { operation: 'heartbeat' });
        this.handleConnectionError(error);
      }
    }, this.options.heartbeatIntervalMs);
  }

  private handleConnectionClose(event: CloseEvent): void {
    this.isAuthenticated = false;
    this.authenticationPromise = null;
    this.clearTimer('heartbeat');

    if (event.code === 1000) {
      // Normal closure
      this.setState('disconnected');
    } else {
      // Abnormal closure - attempt reconnection
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  private handleConnectionError(error: Event | Error): void {
    this.errorHandler.handleError(error, { operation: 'webSocketConnection' });
    
    this.setState('error');
    this.isAuthenticated = false;
    this.authenticationPromise = null;
    
    // Calculate reconnect delay
    const delayMs = this.calculateReconnectDelay();
    
    this.emit('connection-error', { 
      error, 
      reconnectIn: delayMs 
    });
    
    this.scheduleReconnect(delayMs);
  }

  private scheduleReconnect(delayMs?: number): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState('closed');
      this.emit('reconnect-failed', {
        totalAttempts: this.reconnectAttempts,
        totalTime: Date.now() - this.reconnectStartTime
      });
      return;
    }

    const delay = delayMs || this.calculateReconnectDelay();
    
    this.clearTimer('reconnect');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      
      this.emit('reconnect-attempt', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.options.maxReconnectAttempts
      });
      
      // Try to reconnect with stored credentials
      this.reconnectWithStoredCredentials();
    }, delay);
  }

  private async reconnectWithStoredCredentials(): Promise<void> {
    try {
      const session = this.authManager.getCurrentSession();
      if (!session) {
        throw new Error('No stored authentication session');
      }

      await this.connect(session.userId, session.accessToken);
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  private calculateReconnectDelay(): number {
    const baseDelay = this.options.reconnectDelayMs;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts);
    const jitteredDelay = exponentialDelay + (Math.random() * 1000);
    
    return Math.min(jitteredDelay, this.options.maxReconnectDelayMs);
  }

  private queueMessage(message: WebSocketMessage): void {
    // Check queue limit
    if (this.messageQueue.length >= this.options.messageQueueLimit) {
      const droppedCount = Math.floor(this.options.messageQueueLimit * 0.1); // Drop 10%
      this.messageQueue.splice(0, droppedCount);
      
      this.emit('queue-overflow', { droppedMessages: droppedCount });
    }

    this.messageQueue.push(message);
  }

  private async processQueuedMessages(): Promise<void> {
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      try {
        await this.sendMessageImmediate(message);
      } catch (error) {
        // Re-queue failed messages
        this.queueMessage(message);
        break; // Stop processing if one fails
      }
    }
  }

  private async sendMessageImmediate(message: WebSocketMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws!.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private clearTimers(): void {
    this.clearTimer('reconnect');
    this.clearTimer('heartbeat');
    this.clearTimer('connection');
    this.clearTimer('auth');
  }

  private clearTimer(type: 'reconnect' | 'heartbeat' | 'connection' | 'auth'): void {
    switch (type) {
      case 'reconnect':
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        break;
      case 'heartbeat':
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        break;
      case 'connection':
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = null;
        }
        break;
      case 'auth':
        if (this.authTimer) {
          clearTimeout(this.authTimer);
          this.authTimer = null;
        }
        break;
    }
  }

  private generateMessageId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Cleanup and destroy WebSocket client
   */
  destroy(): void {
    this.disconnect();
    this.clearTimers();
    this.removeAllListeners();
    this.messageQueue = [];
    this.pendingMessages.clear();
    this.latencyHistory = [];
  }
}

// Singleton management for global WebSocket client
let globalWebSocketClient: WebSocketClient | null = null;

/**
 * Get or create global WebSocket client instance
 */
export function getWebSocketClient(options?: WebSocketConnectionOptions): WebSocketClient {
  if (!globalWebSocketClient && options) {
    globalWebSocketClient = new WebSocketClient(options);
  }
  
  if (!globalWebSocketClient) {
    throw new Error('WebSocket client not initialized. Call with options first.');
  }
  
  return globalWebSocketClient;
}

/**
 * Initialize WebSocket client with server configuration
 */
export function initializeWebSocketClient(serverUrl: string, options?: Partial<WebSocketConnectionOptions>): WebSocketClient {
  const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';
  
  const fullOptions: WebSocketConnectionOptions = {
    url: wsUrl,
    ...options
  };
  
  globalWebSocketClient = new WebSocketClient(fullOptions);
  return globalWebSocketClient;
}

/**
 * Cleanup global WebSocket client
 */
export function destroyWebSocketClient(): void {
  if (globalWebSocketClient) {
    globalWebSocketClient.destroy();
    globalWebSocketClient = null;
  }
}