/**
 * Comprehensive offline support and message queuing system
 * Handles network disconnections, operation queuing, conflict resolution,
 * and automatic synchronization when connectivity is restored.
 */

'use client';

import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { 
  SyncOperation,
  EntityType,
  MessageQueuePriority,
  SyncStatus,
  DatabaseConnectionStatus
} from '@/lib/tanstack-db';

import type {
  OfflineQueueItem,
  DatabaseError,
  GlobalSyncState,
  EntitySyncState,
  DataConflict,
  ConflictResolution,
  ConflictResolutionStrategy
} from '@/lib/types/tanstack-db.types';

/**
 * Network connectivity manager
 */
class NetworkManager extends EventEmitter {
  private isOnline = navigator.onLine;
  private connectionQuality = 'unknown';
  private lastConnectivityCheck = Date.now();

  constructor() {
    super();
    this.setupNetworkListeners();
    this.startConnectivityMonitoring();
  }

  /**
   * Get current online status
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Get connection quality estimate
   */
  getConnectionQuality(): string {
    return this.connectionQuality;
  }

  /**
   * Manually test connectivity
   */
  async testConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const isConnected = response.ok;
      if (isConnected !== this.isOnline) {
        this.updateOnlineStatus(isConnected);
      }
      
      return isConnected;
    } catch (error) {
      if (this.isOnline) {
        this.updateOnlineStatus(false);
      }
      return false;
    }
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.updateOnlineStatus(true);
    });

    window.addEventListener('offline', () => {
      this.updateOnlineStatus(false);
    });

    // Monitor connection quality using the Network Information API
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        const updateConnection = () => {
          this.connectionQuality = connection.effectiveType || 'unknown';
          this.emit('connection-quality-changed', this.connectionQuality);
        };
        
        connection.addEventListener('change', updateConnection);
        updateConnection();
      }
    }
  }

  private updateOnlineStatus(online: boolean): void {
    const wasOnline = this.isOnline;
    this.isOnline = online;
    
    if (wasOnline !== online) {
      this.emit('network-status-changed', online);
      if (online) {
        this.emit('network-reconnected');
      } else {
        this.emit('network-disconnected');
      }
    }
  }

  private startConnectivityMonitoring(): void {
    setInterval(async () => {
      const now = Date.now();
      if (now - this.lastConnectivityCheck > 30000) { // Check every 30 seconds
        await this.testConnectivity();
        this.lastConnectivityCheck = now;
      }
    }, 30000);
  }
}

/**
 * Advanced offline queue with priority handling and persistence
 */
export class OfflineQueue extends EventEmitter {
  private queue = new Map<string, OfflineQueueItem>();
  private processing = false;
  private retryTimeouts = new Map<string, NodeJS.Timeout>();
  private persistenceKey = 'openchat-offline-queue';

  constructor() {
    super();
    this.loadPersistedQueue();
  }

  /**
   * Add operation to queue
   */
  enqueue(item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'lastAttempt'>): string {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: nanoid(),
      createdAt: new Date(),
      lastAttempt: null,
    };
    
    this.queue.set(queueItem.id, queueItem);
    this.persistQueue();
    this.emit('item-added', queueItem);
    
    return queueItem.id;
  }

  /**
   * Remove item from queue
   */
  dequeue(id: string): boolean {
    const item = this.queue.get(id);
    if (!item) return false;
    
    // Clear retry timeout
    const timeout = this.retryTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(id);
    }
    
    const removed = this.queue.delete(id);
    if (removed) {
      this.persistQueue();
      this.emit('item-removed', item);
    }
    
    return removed;
  }

  /**
   * Get queue items sorted by priority
   */
  getItems(): OfflineQueueItem[] {
    return Array.from(this.queue.values()).sort((a, b) => {
      // Sort by priority (higher first), then by creation time (older first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    totalItems: number;
    priorityCounts: Record<MessageQueuePriority, number>;
    oldestItem: Date | null;
    averageRetries: number;
  } {
    const items = this.getItems();
    const priorityCounts = {
      [MessageQueuePriority.CRITICAL]: 0,
      [MessageQueuePriority.HIGH]: 0,
      [MessageQueuePriority.NORMAL]: 0,
      [MessageQueuePriority.LOW]: 0,
    };
    
    let totalRetries = 0;
    let oldestItem: Date | null = null;
    
    for (const item of items) {
      priorityCounts[item.priority]++;
      totalRetries += item.retries;
      
      if (!oldestItem || item.createdAt < oldestItem) {
        oldestItem = item.createdAt;
      }
    }
    
    return {
      totalItems: items.length,
      priorityCounts,
      oldestItem,
      averageRetries: items.length > 0 ? totalRetries / items.length : 0,
    };
  }

  /**
   * Process the queue
   */
  async processQueue(processor: (item: OfflineQueueItem) => Promise<void>): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    this.emit('processing-started');
    
    const items = this.getItems();
    let processed = 0;
    let failed = 0;
    
    for (const item of items) {
      try {
        item.lastAttempt = new Date();
        await processor(item);
        
        this.dequeue(item.id);
        processed++;
        this.emit('item-processed', item);
      } catch (error) {
        failed++;
        await this.handleProcessingError(item, error as Error);
      }
    }
    
    this.processing = false;
    this.emit('processing-completed', { processed, failed });
  }

  /**
   * Clear all items from queue
   */
  clear(): void {
    const items = Array.from(this.queue.values());
    this.queue.clear();
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
    this.persistQueue();
    this.emit('queue-cleared', items);
  }

  /**
   * Get specific item by ID
   */
  getItem(id: string): OfflineQueueItem | undefined {
    return this.queue.get(id);
  }

  private async handleProcessingError(item: OfflineQueueItem, error: Error): Promise<void> {
    item.retries++;
    item.error = error.message;
    
    const maxRetries = this.getMaxRetries(item);
    if (item.retries >= maxRetries) {
      this.dequeue(item.id);
      this.emit('item-failed', item, error);
      return;
    }
    
    // Calculate exponential backoff with jitter
    const baseDelay = this.getBaseDelay(item);
    const exponentialDelay = baseDelay * Math.pow(2, item.retries - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delay = exponentialDelay + jitter;
    
    this.emit('item-retry-scheduled', item, delay);
    
    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(item.id);
      this.emit('item-retry', item);
    }, delay);
    
    this.retryTimeouts.set(item.id, timeout);
    this.persistQueue();
  }

  private getMaxRetries(item: OfflineQueueItem): number {
    switch (item.priority) {
      case MessageQueuePriority.CRITICAL:
        return 10;
      case MessageQueuePriority.HIGH:
        return 7;
      case MessageQueuePriority.NORMAL:
        return 5;
      case MessageQueuePriority.LOW:
        return 3;
      default:
        return 5;
    }
  }

  private getBaseDelay(item: OfflineQueueItem): number {
    switch (item.priority) {
      case MessageQueuePriority.CRITICAL:
        return 1000; // 1 second
      case MessageQueuePriority.HIGH:
        return 2000; // 2 seconds
      case MessageQueuePriority.NORMAL:
        return 5000; // 5 seconds
      case MessageQueuePriority.LOW:
        return 10000; // 10 seconds
      default:
        return 5000;
    }
  }

  private persistQueue(): void {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const items = Array.from(this.queue.values()).map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        lastAttempt: item.lastAttempt?.toISOString() || null,
      }));
      
      localStorage.setItem(this.persistenceKey, JSON.stringify(items));
    } catch (error) {
      console.warn('Failed to persist offline queue:', error);
    }
  }

  private loadPersistedQueue(): void {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.persistenceKey);
      if (!stored) return;
      
      const items = JSON.parse(stored);
      for (const item of items) {
        const queueItem: OfflineQueueItem = {
          ...item,
          createdAt: new Date(item.createdAt),
          lastAttempt: item.lastAttempt ? new Date(item.lastAttempt) : null,
        };
        
        this.queue.set(queueItem.id, queueItem);
      }
    } catch (error) {
      console.warn('Failed to load persisted offline queue:', error);
    }
  }
}

/**
 * Sync state manager for tracking entity synchronization status
 */
export class SyncStateManager extends EventEmitter {
  private entityStates = new Map<string, EntitySyncState>();
  private globalState: GlobalSyncState = {
    status: SyncStatus.IDLE,
    connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
    pendingOperations: 0,
    lastSyncAt: null,
    error: null,
    nextSyncIn: null,
    isOffline: !navigator.onLine,
  };

  /**
   * Update entity sync state
   */
  updateEntityState(entityId: string, updates: Partial<EntitySyncState>): void {
    const currentState = this.entityStates.get(entityId);
    const newState: EntitySyncState = {
      entityId,
      entityType: EntityType.MESSAGE, // Default, should be provided
      status: SyncStatus.IDLE,
      lastSyncAt: null,
      attempts: 0,
      error: null,
      hasPendingChanges: false,
      ...currentState,
      ...updates,
    };
    
    this.entityStates.set(entityId, newState);
    this.emit('entity-state-updated', newState);
    this.updateGlobalState();
  }

  /**
   * Get entity sync state
   */
  getEntityState(entityId: string): EntitySyncState | null {
    return this.entityStates.get(entityId) || null;
  }

  /**
   * Get all entity states
   */
  getAllEntityStates(): EntitySyncState[] {
    return Array.from(this.entityStates.values());
  }

  /**
   * Update global sync state
   */
  updateGlobalState(updates?: Partial<GlobalSyncState>): void {
    const previousState = { ...this.globalState };
    
    if (updates) {
      this.globalState = { ...this.globalState, ...updates };
    } else {
      // Calculate global state from entity states
      const entities = this.getAllEntityStates();
      const pendingCount = entities.filter(e => e.hasPendingChanges).length;
      const hasErrors = entities.some(e => e.error !== null);
      const issyncing = entities.some(e => e.status === SyncStatus.SYNCING);
      
      this.globalState.pendingOperations = pendingCount;
      
      if (hasErrors) {
        this.globalState.status = SyncStatus.ERROR;
      } else if (issyncing) {
        this.globalState.status = SyncStatus.SYNCING;
      } else if (pendingCount > 0) {
        this.globalState.status = SyncStatus.IDLE;
      } else {
        this.globalState.status = SyncStatus.SUCCESS;
      }
    }
    
    // Emit event if state changed
    if (JSON.stringify(previousState) !== JSON.stringify(this.globalState)) {
      this.emit('global-state-updated', this.globalState);
    }
  }

  /**
   * Get global sync state
   */
  getGlobalState(): GlobalSyncState {
    return { ...this.globalState };
  }

  /**
   * Mark entity as syncing
   */
  markEntitySyncing(entityId: string, entityType: EntityType): void {
    this.updateEntityState(entityId, {
      entityType,
      status: SyncStatus.SYNCING,
      attempts: (this.entityStates.get(entityId)?.attempts || 0) + 1,
    });
  }

  /**
   * Mark entity sync as successful
   */
  markEntitySynced(entityId: string): void {
    this.updateEntityState(entityId, {
      status: SyncStatus.SUCCESS,
      lastSyncAt: new Date(),
      error: null,
      hasPendingChanges: false,
    });
  }

  /**
   * Mark entity sync as failed
   */
  markEntitySyncFailed(entityId: string, error: string): void {
    this.updateEntityState(entityId, {
      status: SyncStatus.ERROR,
      error,
    });
  }

  /**
   * Mark entity as having pending changes
   */
  markEntityPending(entityId: string, entityType: EntityType): void {
    this.updateEntityState(entityId, {
      entityType,
      hasPendingChanges: true,
    });
  }

  /**
   * Clear all entity states
   */
  clear(): void {
    this.entityStates.clear();
    this.updateGlobalState({
      status: SyncStatus.IDLE,
      pendingOperations: 0,
      error: null,
    });
    this.emit('states-cleared');
  }
}

/**
 * Main offline manager that coordinates all offline functionality
 */
export class OfflineManager extends EventEmitter {
  private networkManager: NetworkManager;
  private offlineQueue: OfflineQueue;
  private syncStateManager: SyncStateManager;
  private syncInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.networkManager = new NetworkManager();
    this.offlineQueue = new OfflineQueue();
    this.syncStateManager = new SyncStateManager();
    this.setupEventListeners();
  }

  /**
   * Initialize the offline manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    
    // Test initial connectivity
    await this.networkManager.testConnectivity();
    
    // Start periodic sync if online
    if (this.networkManager.getOnlineStatus()) {
      this.startPeriodicSync();
    }
    
    this.emit('initialized');
  }

  /**
   * Get network manager
   */
  getNetworkManager(): NetworkManager {
    return this.networkManager;
  }

  /**
   * Get offline queue
   */
  getOfflineQueue(): OfflineQueue {
    return this.offlineQueue;
  }

  /**
   * Get sync state manager
   */
  getSyncStateManager(): SyncStateManager {
    return this.syncStateManager;
  }

  /**
   * Queue an operation for offline processing
   */
  queueOperation(operation: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'lastAttempt'>): string {
    const itemId = this.offlineQueue.enqueue(operation);
    
    // Mark entity as having pending changes
    if (operation.entityId) {
      this.syncStateManager.markEntityPending(operation.entityId, operation.entityType);
    }
    
    // Process immediately if online
    if (this.networkManager.getOnlineStatus()) {
      this.processQueue();
    }
    
    return itemId;
  }

  /**
   * Process the offline queue
   */
  async processQueue(): Promise<void> {
    if (!this.networkManager.getOnlineStatus()) {
      return;
    }

    await this.offlineQueue.processQueue(async (item) => {
      // Mark entity as syncing
      if (item.entityId) {
        this.syncStateManager.markEntitySyncing(item.entityId, item.entityType);
      }

      try {
        // This would be implemented by the consumer
        await this.processQueueItem(item);
        
        // Mark entity as synced
        if (item.entityId) {
          this.syncStateManager.markEntitySynced(item.entityId);
        }
      } catch (error) {
        // Mark entity sync as failed
        if (item.entityId) {
          this.syncStateManager.markEntitySyncFailed(item.entityId, (error as Error).message);
        }
        throw error;
      }
    });
  }

  /**
   * Get current offline status
   */
  getStatus(): {
    isOnline: boolean;
    connectionQuality: string;
    queueStats: ReturnType<OfflineQueue['getStats']>;
    globalSyncState: GlobalSyncState;
  } {
    return {
      isOnline: this.networkManager.getOnlineStatus(),
      connectionQuality: this.networkManager.getConnectionQuality(),
      queueStats: this.offlineQueue.getStats(),
      globalSyncState: this.syncStateManager.getGlobalState(),
    };
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(interval = 30000): void {
    this.stopPeriodicSync();
    
    this.syncInterval = setInterval(() => {
      if (this.networkManager.getOnlineStatus()) {
        this.processQueue();
      }
    }, interval);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Process a single queue item (to be implemented by consumer)
   */
  protected async processQueueItem(item: OfflineQueueItem): Promise<void> {
    // This method should be overridden or provided via dependency injection
    throw new Error('processQueueItem must be implemented');
  }

  private setupEventListeners(): void {
    // Network events
    this.networkManager.on('network-reconnected', () => {
      this.syncStateManager.updateGlobalState({
        isOffline: false,
        connectionStatus: DatabaseConnectionStatus.CONNECTED,
      });
      
      this.processQueue();
      this.startPeriodicSync();
      this.emit('reconnected');
    });

    this.networkManager.on('network-disconnected', () => {
      this.syncStateManager.updateGlobalState({
        isOffline: true,
        connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
      });
      
      this.stopPeriodicSync();
      this.emit('disconnected');
    });

    // Queue events
    this.offlineQueue.on('item-added', (item) => {
      this.emit('operation-queued', item);
    });

    this.offlineQueue.on('item-processed', (item) => {
      this.emit('operation-processed', item);
    });

    this.offlineQueue.on('item-failed', (item, error) => {
      this.emit('operation-failed', item, error);
    });

    // Sync state events
    this.syncStateManager.on('global-state-updated', (state) => {
      this.emit('sync-state-updated', state);
    });
  }
}

/**
 * Global offline manager instance
 */
export const offlineManager = new OfflineManager();