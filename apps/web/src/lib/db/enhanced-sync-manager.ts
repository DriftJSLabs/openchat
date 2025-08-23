import { getRealtimeSyncManager, type RealtimeSyncConfig } from './realtime-sync';
import { getConflictResolver } from './conflict-resolver';
import { getPerformanceOptimizer, type PerformanceConfig } from './performance-optimizer';
import { getRetryManager, type RetryConfig } from './retry-manager';
import { getSyncAuthManager } from './sync-auth';
import { getSyncStrategyManager, type SyncConfig } from './sync-strategies';
import { getNetworkErrorHandler, type AdaptiveErrorConfig } from './network-error-handler';
import { CollaborativeEditResolver, type TransformableOperation } from './operational-transform';
import { getDatabaseErrorHandler } from './error-handler';
import type { SyncEvent, Chat, Message } from './schema/shared';

export interface EnhancedSyncConfig {
  realtime: Partial<RealtimeSyncConfig>;
  performance: Partial<PerformanceConfig>;
  retry: Partial<RetryConfig>;
  strategy: Partial<SyncConfig>;
  networkError: Partial<AdaptiveErrorConfig>;
  encryption: {
    enabled: boolean;
    algorithm: 'AES-GCM' | 'ChaCha20-Poly1305';
  };
  monitoring: {
    enableMetrics: boolean;
    enableDebugLogs: boolean;
    reportingEndpoint?: string;
  };
}

export interface SyncMetrics {
  totalSyncOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncTime: number;
  conflictsResolved: number;
  dataTransferred: number;
  networkCondition: string;
  lastSyncTimestamp: number;
  operationalTransformOperations: number;
}

export interface SyncHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical' | 'offline';
  components: {
    realtime: 'connected' | 'disconnected' | 'connecting';
    authentication: 'valid' | 'expired' | 'invalid';
    network: 'excellent' | 'good' | 'poor' | 'offline';
    storage: 'available' | 'low' | 'full';
    conflicts: 'none' | 'manageable' | 'critical';
  };
  recommendations: string[];
}

/**
 * Enhanced sync manager that coordinates all synchronization components
 * Implements proper resource management and memory leak prevention
 */
export class EnhancedSyncManager {
  private config: EnhancedSyncConfig;
  private realtimeSync = getRealtimeSyncManager();
  private conflictResolver = getConflictResolver();
  private performanceOptimizer = getPerformanceOptimizer();
  private retryManager = getRetryManager();
  private authManager = getSyncAuthManager();
  private strategyManager = getSyncStrategyManager();
  private networkErrorHandler = getNetworkErrorHandler();
  private errorHandler = getDatabaseErrorHandler();
  
  private metrics: SyncMetrics = {
    totalSyncOperations: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    averageSyncTime: 0,
    conflictsResolved: 0,
    dataTransferred: 0,
    networkCondition: 'good',
    lastSyncTimestamp: 0,
    operationalTransformOperations: 0
  };

  private isInitialized = false;
  private syncInProgress = false;
  private statusCallbacks = new Set<(status: SyncHealthStatus) => void>();
  private metricsCallbacks = new Set<(metrics: SyncMetrics) => void>();
  
  // Memory management: Track timers and event listeners for proper cleanup
  private activeTimers = new Set<NodeJS.Timeout>();
  private eventListeners = new Map<string, { element: EventTarget; event: string; handler: EventListener }>();
  private isShutdown = false;
  private maxCallbackSize = 100; // Prevent unbounded callback growth

  constructor(config: Partial<EnhancedSyncConfig> = {}) {
    this.config = {
      realtime: {
        transport: ['websocket', 'sse', 'polling'],
        fallbackEnabled: true,
        reconnectAttempts: 5,
        reconnectDelay: 1000,
        heartbeatInterval: 30000,
        batchSize: 10,
        debounceMs: 500
      },
      performance: {
        batchSize: 50,
        maxCacheSize: 1000,
        preloadThreshold: 10,
        compressionEnabled: true,
        indexedDBQuotaThreshold: 0.8,
        virtualScrollBuffer: 5,
        debounceMs: 100
      },
      retry: {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        strategy: 'exponential',
        backoffMultiplier: 2,
        jitterEnabled: true,
        timeoutMs: 300000
      },
      strategy: {
        preferredStrategy: 'adaptive',
        maxDataSizeForIncremental: 10 * 1024 * 1024,
        maxTimeGapForIncremental: 24 * 60 * 60 * 1000,
        conflictThreshold: 0.1,
        backgroundSyncEnabled: true,
        adaptiveThresholds: {
          networkSpeedThreshold: 1,
          batteryLevelThreshold: 20,
          dataUsageThreshold: 100
        }
      },
      networkError: {
        networkThresholds: {
          excellentLatency: 100,
          goodLatency: 300,
          poorLatency: 1000,
          offlineTimeout: 5000
        },
        operationTimeouts: {
          sync: 30000,
          auth: 10000,
          data: 15000,
          realtime: 5000
        },
        degradationStrategies: {
          reduceQuality: true,
          disableNonEssential: true,
          batchOperations: true,
          compressData: true
        }
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-GCM'
      },
      monitoring: {
        enableMetrics: true,
        enableDebugLogs: false
      },
      ...config
    };

    this.setupEventListeners();
  }

  /**
   * Initialize the enhanced sync manager
   */
  async initialize(userId: string, authToken: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize authentication
      await this.authManager.authenticate({
        userId,
        refreshToken: authToken
      });

      // Initialize realtime sync
      await this.realtimeSync.connect(userId, authToken);

      // Setup realtime event handlers
      this.setupRealtimeHandlers();

      // Start monitoring
      this.startMonitoring();

      this.isInitialized = true;
      this.notifyStatusChange();

    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'initialize' });
      throw error;
    }
  }

  /**
   * Perform intelligent sync operation
   */
  async performSync(
    userId: string,
    cloudApi: any,
    localDb: any,
    options: {
      forceStrategy?: 'incremental' | 'full' | 'selective';
      priority?: 'low' | 'medium' | 'high';
      background?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    strategy: string;
    metrics: any;
    conflicts: number;
  }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    try {
      // Ensure authentication is valid
      if (!this.authManager.isAuthenticated()) {
        await this.authManager.refreshAuthentication();
      }

      // Determine optimal sync strategy
      const lastSyncTimestamp = await localDb.getLastSyncTimestamp(userId);
      const dataSnapshot = await this.getDataSnapshot(localDb, userId);
      
      const decision = options.forceStrategy 
        ? { strategy: options.forceStrategy, reason: 'User forced' }
        : await this.strategyManager.decideSyncStrategy(userId, lastSyncTimestamp, dataSnapshot);

      // Execute sync with chosen strategy
      const result = await this.networkErrorHandler.executeWithNetworkHandling(
        async () => {
          return this.strategyManager.executeSync(
            decision.strategy,
            userId,
            cloudApi,
            localDb,
            (progress) => this.notifyProgress(progress)
          );
        },
        {
          condition: this.networkErrorHandler.getCurrentCondition(),
          retryAttempt: 0,
          operationType: 'sync',
          priority: options.priority || 'medium',
          userInitiated: !options.background,
          backgroundOperation: options.background || false
        }
      );

      // Update metrics
      this.updateMetrics(result, Date.now() - startTime);
      
      // Handle any conflicts with operational transforms
      if (result.conflictsResolved > 0) {
        await this.handleConflictsWithOT(userId, localDb);
      }

      // Notify completion
      this.notifyMetricsChange();
      this.notifyStatusChange();

      return {
        success: result.success,
        strategy: result.strategy,
        metrics: result,
        conflicts: result.conflictsResolved
      };

    } catch (error) {
      this.metrics.failedSyncs++;
      this.errorHandler.handleError(error, { operation: 'performSync', userId });
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Handle real-time collaborative editing
   */
  async handleCollaborativeEdit(
    entityType: 'chat' | 'message',
    entityId: string,
    oldContent: string,
    newContent: string,
    userId: string,
    baseVersion: number
  ): Promise<{
    success: boolean;
    resolvedContent: string;
    operations: any[];
    conflicts: boolean;
  }> {
    try {
      // Create operation for the edit
      const operation = CollaborativeEditResolver.createOperation(
        oldContent,
        newContent,
        entityId,
        entityType,
        userId,
        baseVersion
      );

      // Broadcast operation via realtime sync
      this.realtimeSync.sendSyncEvent({
        id: operation.id,
        entityType,
        entityId,
        operation: 'update',
        data: JSON.stringify({ operation }),
        timestamp: Date.now(),
        userId,
        deviceId: 'current-device',
        synced: false
      });

      this.metrics.operationalTransformOperations++;
      this.notifyMetricsChange();

      return {
        success: true,
        resolvedContent: newContent,
        operations: operation.operations,
        conflicts: false
      };

    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'handleCollaborativeEdit' });
      throw error;
    }
  }

  /**
   * Get comprehensive sync health status
   */
  getHealthStatus(): SyncHealthStatus {
    const realtimeStatus = this.realtimeSync.getStatus();
    const networkCondition = this.networkErrorHandler.getCurrentCondition();
    const authSession = this.authManager.getCurrentSession();
    const performanceStats = this.performanceOptimizer.getCacheStats();

    const components = {
      realtime: realtimeStatus.connected ? 'connected' : 'disconnected',
      authentication: authSession ? 'valid' : 'invalid',
      network: networkCondition,
      storage: performanceStats.size > performanceStats.maxSize * 0.9 ? 'full' : 'available',
      conflicts: this.metrics.conflictsResolved > 10 ? 'critical' : 'none'
    } as const;

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'critical' | 'offline' = 'healthy';
    
    if (components.network === 'offline') {
      overall = 'offline';
    } else if (components.authentication === 'invalid' || components.storage === 'full') {
      overall = 'critical';
    } else if (components.realtime === 'disconnected' || components.network === 'poor') {
      overall = 'degraded';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (components.realtime === 'disconnected') {
      recommendations.push('Check internet connection for real-time features');
    }
    if (components.authentication === 'invalid') {
      recommendations.push('Re-authenticate to restore sync capabilities');
    }
    if (components.storage === 'full') {
      recommendations.push('Clear local cache to improve performance');
    }
    if (components.network === 'poor') {
      recommendations.push('Sync may be slower due to network conditions');
    }

    return {
      overall,
      components,
      recommendations
    };
  }

  /**
   * Get detailed sync metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Force network condition for testing
   */
  setNetworkCondition(condition: 'excellent' | 'good' | 'poor' | 'offline'): void {
    this.networkErrorHandler.forceNetworkCondition(condition);
  }

  /**
   * Export sync data for backup/analysis
   */
  async exportSyncData(userId: string): Promise<{
    metrics: SyncMetrics;
    health: SyncHealthStatus;
    history: any[];
    configuration: any;
  }> {
    return {
      metrics: this.getMetrics(),
      health: this.getHealthStatus(),
      history: this.strategyManager.getSyncHistory(userId),
      configuration: this.config
    };
  }

  // Event subscription methods with memory leak prevention
  onStatusChange(callback: (status: SyncHealthStatus) => void): () => void {
    // Prevent unbounded callback growth
    if (this.statusCallbacks.size >= this.maxCallbackSize) {
      console.warn('Maximum status callbacks reached. Removing oldest callback.');
      const firstCallback = this.statusCallbacks.values().next().value;
      this.statusCallbacks.delete(firstCallback);
    }
    
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  onMetricsChange(callback: (metrics: SyncMetrics) => void): () => void {
    // Prevent unbounded callback growth
    if (this.metricsCallbacks.size >= this.maxCallbackSize) {
      console.warn('Maximum metrics callbacks reached. Removing oldest callback.');
      const firstCallback = this.metricsCallbacks.values().next().value;
      this.metricsCallbacks.delete(firstCallback);
    }
    
    this.metricsCallbacks.add(callback);
    return () => this.metricsCallbacks.delete(callback);
  }

  // Private methods
  private setupEventListeners(): void {
    // Memory leak fix: Store references to event handlers for proper cleanup
    const networkChangeHandler = (event: any) => {
      if (this.isShutdown) return; // Prevent execution after shutdown
      this.metrics.networkCondition = event.detail.condition;
      this.notifyStatusChange();
    };
    
    window.addEventListener('networkConditionChange', networkChangeHandler);
    this.eventListeners.set('networkCondition', {
      element: window,
      event: 'networkConditionChange',
      handler: networkChangeHandler
    });

    // Memory leak fix: Store realtime sync event handlers for cleanup
    const batchSyncHandler = (events: SyncEvent[]) => {
      if (this.isShutdown) return;
      this.handleRealtimeSyncEvents(events);
    };
    
    const conflictHandler = (conflictData: any) => {
      if (this.isShutdown) return;
      this.handleRealtimeConflict(conflictData);
    };
    
    this.realtimeSync.on('batchSync', batchSyncHandler);
    this.realtimeSync.on('conflict', conflictHandler);
    
    // Store references for cleanup (EventEmitter doesn't provide removeAllListeners by handler)
    this.eventListeners.set('batchSync', {
      element: this.realtimeSync as any,
      event: 'batchSync',
      handler: batchSyncHandler
    });
    
    this.eventListeners.set('conflict', {
      element: this.realtimeSync as any,
      event: 'conflict', 
      handler: conflictHandler
    });
  }

  private setupRealtimeHandlers(): void {
    this.realtimeSync.on('message', (message: any) => {
      if (message.type === 'sync') {
        this.handleIncomingOperationalTransform(message.data);
      }
    });
  }

  private async handleIncomingOperationalTransform(operationData: any): Promise<void> {
    try {
      const operation = operationData.operation as TransformableOperation;
      
      // This would integrate with the local database to apply the operation
      // and resolve any conflicts using operational transforms
      
      this.metrics.operationalTransformOperations++;
      this.notifyMetricsChange();
      
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'handleIncomingOperationalTransform' });
    }
  }

  private async handleRealtimeSyncEvents(events: SyncEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Process each event and update local database
        // This would integrate with the local database manager
        
        this.metrics.totalSyncOperations++;
        
      } catch (error) {
        this.errorHandler.handleError(error, { operation: 'handleRealtimeSyncEvents' });
      }
    }
    
    this.notifyMetricsChange();
  }

  private async handleRealtimeConflict(conflictData: any): Promise<void> {
    try {
      // Use conflict resolver to handle real-time conflicts
      const resolution = this.conflictResolver.resolveChat(conflictData);
      
      if (resolution.requiresManualReview) {
        // Emit event for UI to handle manual conflict resolution
        window.dispatchEvent(new CustomEvent('manualConflictResolution', {
          detail: { conflictData, resolution }
        }));
      }
      
      this.metrics.conflictsResolved++;
      this.notifyMetricsChange();
      
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'handleRealtimeConflict' });
    }
  }

  private async getDataSnapshot(localDb: any, userId: string): Promise<any> {
    // Get snapshot of current local data for sync decision making
    return {
      chatCount: 0, // Would get actual count from localDb
      messageCount: 0,
      unsyncedEvents: 0
    };
  }

  private async handleConflictsWithOT(userId: string, localDb: any): Promise<void> {
    // Handle any remaining conflicts using operational transforms
    // This would integrate with the conflict resolver and OT system
  }

  private updateMetrics(result: any, duration: number): void {
    this.metrics.totalSyncOperations++;
    
    if (result.success) {
      this.metrics.successfulSyncs++;
    } else {
      this.metrics.failedSyncs++;
    }
    
    this.metrics.averageSyncTime = (
      (this.metrics.averageSyncTime * (this.metrics.totalSyncOperations - 1) + duration) /
      this.metrics.totalSyncOperations
    );
    
    this.metrics.conflictsResolved += result.conflictsResolved || 0;
    this.metrics.dataTransferred += result.dataTransferred || 0;
    this.metrics.lastSyncTimestamp = Date.now();
  }

  private startMonitoring(): void {
    if (!this.config.monitoring.enableMetrics) {
      return;
    }

    // Memory leak fix: Store timer references for proper cleanup
    // Periodic health checks
    const healthCheckTimer = setInterval(() => {
      if (this.isShutdown) return;
      this.notifyStatusChange();
    }, 30000); // Every 30 seconds
    this.activeTimers.add(healthCheckTimer);

    // Periodic metrics reporting
    const metricsTimer = setInterval(() => {
      if (this.isShutdown) return;
      this.notifyMetricsChange();
      
      if (this.config.monitoring.reportingEndpoint) {
        this.reportMetrics();
      }
    }, 60000); // Every minute
    this.activeTimers.add(metricsTimer);
  }

  private async reportMetrics(): Promise<void> {
    if (!this.config.monitoring.reportingEndpoint) {
      return;
    }

    try {
      await fetch(this.config.monitoring.reportingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authManager.createAuthHeaders())
        },
        body: JSON.stringify({
          metrics: this.metrics,
          health: this.getHealthStatus(),
          timestamp: Date.now()
        })
      });
    } catch (error) {
      // Silently fail metrics reporting
      console.debug('Metrics reporting failed:', error);
    }
  }

  private notifyStatusChange(): void {
    const status = this.getHealthStatus();
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Status callback error:', error);
      }
    });
  }

  private notifyMetricsChange(): void {
    this.metricsCallbacks.forEach(callback => {
      try {
        callback({ ...this.metrics });
      } catch (error) {
        console.error('Metrics callback error:', error);
      }
    });
  }

  private notifyProgress(progress: any): void {
    window.dispatchEvent(new CustomEvent('syncProgress', {
      detail: progress
    }));
  }

  /**
   * Comprehensive cleanup and shutdown with memory leak prevention
   */
  async shutdown(): Promise<void> {
    // Prevent further execution
    this.isShutdown = true;
    
    try {
      // Clean up timers first to prevent any new operations
      for (const timer of this.activeTimers) {
        clearInterval(timer);
        clearTimeout(timer);
      }
      this.activeTimers.clear();
      
      // Remove all event listeners
      for (const [key, listener] of this.eventListeners) {
        try {
          if (listener.element === this.realtimeSync) {
            // EventEmitter cleanup
            (listener.element as any).removeListener(listener.event, listener.handler);
          } else {
            // DOM event cleanup
            listener.element.removeEventListener(listener.event, listener.handler);
          }
        } catch (error) {
          console.warn(`Failed to remove event listener ${key}:`, error);
        }
      }
      this.eventListeners.clear();
      
      // Shutdown components in correct order
      await Promise.allSettled([
        this.realtimeSync.disconnect(),
        this.performanceOptimizer.cleanup(),
        this.authManager.logout()
      ]);
      
      this.retryManager.reset();
      
      // Clear callbacks
      this.statusCallbacks.clear();
      this.metricsCallbacks.clear();
      
      // Reset state
      this.isInitialized = false;
      this.syncInProgress = false;
      
    } catch (error) {
      console.error('Error during shutdown:', error);
      throw error;
    }
  }
}

// Singleton instance with proper memory management
let enhancedSyncManager: EnhancedSyncManager | null = null;

/**
 * Get singleton instance of EnhancedSyncManager with memory leak prevention
 */
export function getEnhancedSyncManager(config?: Partial<EnhancedSyncConfig>): EnhancedSyncManager {
  if (!enhancedSyncManager) {
    enhancedSyncManager = new EnhancedSyncManager(config);
  }
  return enhancedSyncManager;
}

/**
 * Properly dispose of the singleton instance to prevent memory leaks
 */
export async function disposeEnhancedSyncManager(): Promise<void> {
  if (enhancedSyncManager) {
    await enhancedSyncManager.shutdown();
    enhancedSyncManager = null;
  }
}

/**
 * Reset singleton for testing purposes
 */
export function resetEnhancedSyncManager(): void {
  enhancedSyncManager = null;
}

// Utility functions for easy integration
export async function initializeSync(
  userId: string,
  authToken: string,
  config?: Partial<EnhancedSyncConfig>
): Promise<EnhancedSyncManager> {
  const syncManager = getEnhancedSyncManager(config);
  await syncManager.initialize(userId, authToken);
  return syncManager;
}