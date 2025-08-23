import { EventEmitter } from 'events';
import type { SyncEvent, Chat, Message } from './schema/shared';
import { getDatabaseErrorHandler, DatabaseErrorType } from './error-handler';

export type RealtimeSyncTransport = 'websocket' | 'sse' | 'polling';

export interface RealtimeSyncConfig {
  transport: RealtimeSyncTransport[];
  fallbackEnabled: boolean;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  batchSize: number;
  debounceMs: number;
}

export interface RealtimeSyncEvent {
  type: 'sync' | 'conflict' | 'connection' | 'error';
  data: any;
  timestamp: number;
  deviceId: string;
}

export class RealtimeSyncManager extends EventEmitter {
  private config: RealtimeSyncConfig;
  private currentTransport: RealtimeSyncTransport | null = null;
  private connection: WebSocket | EventSource | null = null;
  private userId: string | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  private batchedEvents: SyncEvent[] = [];
  private errorHandler = getDatabaseErrorHandler();
  private isConnected = false;
  private lastActivity = Date.now();

  constructor(config: Partial<RealtimeSyncConfig> = {}) {
    super();
    this.config = {
      transport: ['websocket', 'sse', 'polling'],
      fallbackEnabled: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      batchSize: 10,
      debounceMs: 500,
      ...config
    };
  }

  async connect(userId: string, authToken: string): Promise<void> {
    this.userId = userId;
    this.reconnectAttempts = 0;
    
    for (const transport of this.config.transport) {
      try {
        await this.connectWithTransport(transport, authToken);
        break;
      } catch (error) {
        console.warn(`Failed to connect with ${transport}:`, error);
        if (!this.config.fallbackEnabled) {
          throw error;
        }
      }
    }

    if (!this.isConnected) {
      throw new Error('Failed to establish connection with any transport');
    }
  }

  private async connectWithTransport(transport: RealtimeSyncTransport, authToken: string): Promise<void> {
    switch (transport) {
      case 'websocket':
        return this.connectWebSocket(authToken);
      case 'sse':
        return this.connectServerSentEvents(authToken);
      case 'polling':
        return this.connectPolling(authToken);
    }
  }

  private async connectWebSocket(authToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/sync/ws?token=${authToken}&userId=${this.userId}`;
        
        this.connection = new WebSocket(wsUrl);
        
        this.connection.onopen = () => {
          this.currentTransport = 'websocket';
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected', { transport: 'websocket' });
          resolve();
        };

        this.connection.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.connection.onclose = (event) => {
          this.handleDisconnection(event.code, event.reason);
        };

        this.connection.onerror = (error) => {
          this.handleError(error);
          reject(error);
        };

        // Timeout for connection attempt
        setTimeout(() => {
          if (!this.isConnected) {
            this.connection?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectServerSentEvents(authToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sseUrl = `/api/sync/sse?token=${authToken}&userId=${this.userId}`;
        this.connection = new EventSource(sseUrl);

        this.connection.onopen = () => {
          this.currentTransport = 'sse';
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected', { transport: 'sse' });
          resolve();
        };

        this.connection.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.connection.onerror = (error) => {
          this.handleError(error);
          reject(error);
        };

        // Timeout for connection attempt
        setTimeout(() => {
          if (!this.isConnected) {
            this.connection?.close();
            reject(new Error('SSE connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectPolling(authToken: string): Promise<void> {
    // Polling is always "connected" - we just start the polling loop
    this.currentTransport = 'polling';
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.startPolling(authToken);
    this.emit('connected', { transport: 'polling' });
  }

  private startPolling(authToken: string): void {
    const poll = async () => {
      if (!this.isConnected || this.currentTransport !== 'polling') {
        return;
      }

      try {
        const response = await fetch(`/api/sync/poll?userId=${this.userId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Last-Activity': this.lastActivity.toString()
          }
        });

        if (!response.ok) {
          throw new Error(`Polling failed: ${response.status}`);
        }

        const events = await response.json();
        events.forEach((event: any) => this.handleMessage(event));

        this.lastActivity = Date.now();
        
        // Schedule next poll
        setTimeout(poll, 2000); // Poll every 2 seconds
        
      } catch (error) {
        this.handleError(error);
        
        // Retry polling with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        setTimeout(poll, delay);
        this.reconnectAttempts++;
      }
    };

    poll();
  }

  private handleMessage(message: RealtimeSyncEvent): void {
    this.lastActivity = Date.now();

    switch (message.type) {
      case 'sync':
        this.handleSyncEvent(message.data);
        break;
      case 'conflict':
        this.handleConflictEvent(message.data);
        break;
      case 'connection':
        this.handleConnectionEvent(message.data);
        break;
      case 'error':
        this.handleErrorEvent(message.data);
        break;
    }

    this.emit('message', message);
  }

  private handleSyncEvent(syncEvent: SyncEvent): void {
    // Add to batch for processing
    this.batchedEvents.push(syncEvent);
    
    // Process batch if it's full or after debounce period
    if (this.batchedEvents.length >= this.config.batchSize) {
      this.processBatch();
    } else {
      this.scheduleBatchProcessing();
    }
  }

  private scheduleBatchProcessing(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.config.debounceMs);
  }

  private processBatch(): void {
    if (this.batchedEvents.length === 0) return;

    const batch = [...this.batchedEvents];
    this.batchedEvents = [];

    this.emit('batchSync', batch);

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private handleConflictEvent(conflictData: any): void {
    this.emit('conflict', conflictData);
  }

  private handleConnectionEvent(connectionData: any): void {
    if (connectionData.type === 'heartbeat') {
      this.sendHeartbeat();
    }
  }

  private handleErrorEvent(errorData: any): void {
    const error = this.errorHandler.handleError(new Error(errorData.message), {
      transport: this.currentTransport,
      userId: this.userId
    });
    this.emit('syncError', error);
  }

  private handleDisconnection(code?: number, reason?: string): void {
    this.isConnected = false;
    this.stopHeartbeat();
    
    this.emit('disconnected', { 
      code, 
      reason, 
      transport: this.currentTransport 
    });

    // Attempt reconnection if enabled
    if (this.reconnectAttempts < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.emit('reconnectFailed');
    }
  }

  private scheduleReconnect(): void {
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    
    setTimeout(async () => {
      this.reconnectAttempts++;
      
      try {
        // Try to reconnect with current transport first
        if (this.currentTransport) {
          await this.connectWithTransport(this.currentTransport, ''); // Would need to store token
        }
      } catch (error) {
        // If current transport fails, try fallback
        if (this.config.fallbackEnabled) {
          this.handleDisconnection();
        }
      }
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.currentTransport === 'polling') {
      return; // Polling doesn't need heartbeat
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.isConnected || !this.connection) return;

    const heartbeat = {
      type: 'heartbeat',
      timestamp: Date.now(),
      userId: this.userId
    };

    try {
      if (this.currentTransport === 'websocket' && this.connection instanceof WebSocket) {
        this.connection.send(JSON.stringify(heartbeat));
      }
      // SSE doesn't send data, polling handles heartbeat differently
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any): void {
    const dbError = this.errorHandler.handleError(error, {
      transport: this.currentTransport,
      userId: this.userId,
      operation: 'realtime-sync'
    });

    this.emit('error', dbError);
  }

  // Public API methods
  sendSyncEvent(syncEvent: SyncEvent): void {
    if (!this.isConnected || !this.connection) {
      this.emit('error', new Error('Not connected to realtime sync'));
      return;
    }

    const message = {
      type: 'sync',
      data: syncEvent,
      timestamp: Date.now(),
      userId: this.userId
    };

    try {
      if (this.currentTransport === 'websocket' && this.connection instanceof WebSocket) {
        this.connection.send(JSON.stringify(message));
      } else if (this.currentTransport === 'sse') {
        // For SSE, send via regular HTTP request
        fetch('/api/sync/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      } else if (this.currentTransport === 'polling') {
        // For polling, queue the event for next poll
        fetch('/api/sync/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  getStatus(): {
    connected: boolean;
    transport: RealtimeSyncTransport | null;
    lastActivity: number;
    reconnectAttempts: number;
    batchedEventsCount: number;
  } {
    return {
      connected: this.isConnected,
      transport: this.currentTransport,
      lastActivity: this.lastActivity,
      reconnectAttempts: this.reconnectAttempts,
      batchedEventsCount: this.batchedEvents.length
    };
  }

  disconnect(): void {
    this.isConnected = false;
    this.stopHeartbeat();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.connection) {
      if (this.connection instanceof WebSocket) {
        this.connection.close();
      } else if (this.connection instanceof EventSource) {
        this.connection.close();
      }
      this.connection = null;
    }

    this.currentTransport = null;
    this.emit('disconnected', { manual: true });
  }

  // Force process any pending batched events
  flush(): void {
    this.processBatch();
  }
}

// Singleton instance
let realtimeSyncManager: RealtimeSyncManager | null = null;

export function getRealtimeSyncManager(config?: Partial<RealtimeSyncConfig>): RealtimeSyncManager {
  if (!realtimeSyncManager) {
    realtimeSyncManager = new RealtimeSyncManager(config);
  }
  return realtimeSyncManager;
}