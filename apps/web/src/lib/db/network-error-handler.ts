import { getDatabaseErrorHandler, DatabaseErrorType, type DatabaseError } from './error-handler';
import { getRetryManager } from './retry-manager';

export type NetworkCondition = 'excellent' | 'good' | 'poor' | 'intermittent' | 'offline';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface NetworkErrorContext {
  condition: NetworkCondition;
  retryAttempt: number;
  operationType: 'sync' | 'auth' | 'data' | 'realtime';
  priority: 'low' | 'medium' | 'high';
  userInitiated: boolean;
  backgroundOperation: boolean;
}

export interface ErrorRecoveryStrategy {
  immediate: {
    action: 'retry' | 'queue' | 'fallback' | 'abort';
    delay: number;
    maxAttempts: number;
  };
  degraded: {
    enabled: boolean;
    features: string[];
    userNotification: string;
  };
  offline: {
    queueOperation: boolean;
    localFallback: boolean;
    userNotification: string;
  };
}

export interface NetworkErrorPattern {
  pattern: RegExp | string;
  condition: NetworkCondition;
  severity: ErrorSeverity;
  strategy: ErrorRecoveryStrategy;
}

export interface AdaptiveErrorConfig {
  networkThresholds: {
    excellentLatency: number;
    goodLatency: number;
    poorLatency: number;
    offlineTimeout: number;
  };
  operationTimeouts: {
    sync: number;
    auth: number;
    data: number;
    realtime: number;
  };
  degradationStrategies: {
    reduceQuality: boolean;
    disableNonEssential: boolean;
    batchOperations: boolean;
    compressData: boolean;
  };
}

/**
 * Advanced network error handler that adapts strategies based on network conditions
 */
export class NetworkErrorHandler {
  private config: AdaptiveErrorConfig;
  private baseErrorHandler = getDatabaseErrorHandler();
  private retryManager = getRetryManager();
  private errorPatterns: NetworkErrorPattern[] = [];
  private networkHistory: Array<{ timestamp: number; condition: NetworkCondition; latency: number }> = [];
  private currentCondition: NetworkCondition = 'good';
  private operationQueue: Array<{ operation: Function; context: NetworkErrorContext; timestamp: number }> = [];
  private degradedMode = false;
  private offlineQueue: Array<{ operation: Function; context: NetworkErrorContext; data: any }> = [];
  private activeRequests = new Map<string, AbortController>();
  private requestTimeouts = new Map<string, NodeJS.Timeout>();
  private eventListeners = new Map<string, { element: EventTarget; event: string; handler: EventListener }>();
  private operationMetrics = new Map<string, { count: number; totalTime: number; errors: number }>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isShutdown = false;
  private readonly queueCleanupInterval = 5 * 60 * 1000; // 5 minutes
  private readonly maxHistorySize = 1000;
  private readonly maxQueueSize = 500;

  constructor(config: Partial<AdaptiveErrorConfig> = {}) {
    this.config = {
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
      },
      ...config
    };

    this.initializeErrorPatterns();
    this.setupNetworkMonitoring();
    this.setupOfflineHandling();
    this.setupResourceCleanup();
  }

  /**
   * Handle network errors with adaptive strategies
   */
  async handleNetworkError(
    error: any,
    context: NetworkErrorContext,
    operation: Function
  ): Promise<{
    recovered: boolean;
    strategy: string;
    result?: any;
    queuedForLater?: boolean;
  }> {
    // Classify the error and determine severity
    const classification = this.classifyNetworkError(error, context);
    
    // Update network condition based on error
    this.updateNetworkCondition(classification);
    
    // Find matching error pattern
    const pattern = this.findMatchingPattern(error, classification);
    
    if (!pattern) {
      return this.handleUnknownError(error, context, operation);
    }

    // Apply recovery strategy based on current network condition
    return this.applyRecoveryStrategy(error, context, operation, pattern.strategy);
  }

  /**
   * Execute operation with network-aware error handling
   */
  async executeWithNetworkHandling<T>(
    operation: () => Promise<T>,
    context: NetworkErrorContext
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Adjust timeout based on network condition and operation type
      const timeout = this.calculateAdaptiveTimeout(context);
      
      // Apply network-specific optimizations
      const optimizedOperation = this.optimizeForNetwork(operation, context);
      
      // Execute with timeout
      const result = await this.executeWithTimeout(optimizedOperation, timeout);
      
      // Record successful operation for network condition assessment
      this.recordNetworkSuccess(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      const recovery = await this.handleNetworkError(error, context, operation);
      
      if (recovery.recovered && recovery.result !== undefined) {
        return recovery.result;
      }
      
      if (recovery.queuedForLater) {
        throw new Error('Operation queued for later execution');
      }
      
      throw error;
    }
  }

  /**
   * Enable degraded mode for poor network conditions
   */
  enableDegradedMode(features: string[] = []): void {
    this.degradedMode = true;
    
    if (this.config.degradationStrategies.disableNonEssential) {
      this.disableNonEssentialFeatures(features);
    }
    
    // Notify application about degraded mode
    this.notifyDegradedMode(features);
  }

  /**
   * Disable degraded mode when network improves
   */
  disableDegradedMode(): void {
    this.degradedMode = false;
    this.enableAllFeatures();
    this.notifyNormalMode();
  }

  /**
   * Queue operations for offline execution
   */
  queueForOffline(operation: Function, context: NetworkErrorContext, data: any): void {
    this.offlineQueue.push({
      operation,
      context,
      data
    });
    
    // Persist queue to storage
    this.persistOfflineQueue();
  }

  /**
   * Process offline queue when connection is restored
   */
  async processOfflineQueue(): Promise<{
    processed: number;
    failed: number;
    errors: any[];
  }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as any[]
    };

    while (this.offlineQueue.length > 0) {
      const item = this.offlineQueue.shift()!;
      
      try {
        await item.operation();
        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ error, context: item.context });
        
        // Re-queue critical operations
        if (item.context.priority === 'high') {
          this.offlineQueue.unshift(item);
        }
      }
      
      // Yield to prevent blocking
      await this.yield();
    }

    // Clear persisted queue
    this.clearPersistedQueue();
    
    return results;
  }

  // Private methods for error classification and handling
  private classifyNetworkError(error: any, context: NetworkErrorContext): {
    severity: ErrorSeverity;
    isNetworkError: boolean;
    isTimeout: boolean;
    isRateLimited: boolean;
    httpStatus?: number;
  } {
    const message = error?.message?.toLowerCase() || '';
    const status = error?.response?.status || error?.status;
    
    let severity: ErrorSeverity = 'medium';
    let isNetworkError = true;
    let isTimeout = false;
    let isRateLimited = false;

    // Check for timeout errors
    if (message.includes('timeout') || message.includes('aborted')) {
      isTimeout = true;
      severity = this.currentCondition === 'poor' ? 'medium' : 'high';
    }

    // Check for rate limiting
    if (status === 429 || message.includes('rate limit')) {
      isRateLimited = true;
      severity = 'low';
    }

    // Check for connection errors
    if (message.includes('network') || message.includes('connection') || 
        message.includes('fetch') || status === 0) {
      severity = this.determineSeverityFromCondition();
    }

    // Check for server errors
    if (status >= 500) {
      severity = 'high';
    }

    // Check for client errors
    if (status >= 400 && status < 500 && status !== 429) {
      isNetworkError = false;
      severity = status === 401 ? 'high' : 'medium';
    }

    return {
      severity,
      isNetworkError,
      isTimeout,
      isRateLimited,
      httpStatus: status
    };
  }

  private findMatchingPattern(error: any, classification: any): NetworkErrorPattern | null {
    for (const pattern of this.errorPatterns) {
      if (this.patternMatches(pattern.pattern, error)) {
        return pattern;
      }
    }
    return null;
  }

  private patternMatches(pattern: RegExp | string, error: any): boolean {
    const errorString = JSON.stringify(error) + ' ' + (error?.message || '');
    
    if (pattern instanceof RegExp) {
      return pattern.test(errorString);
    }
    
    return errorString.toLowerCase().includes(pattern.toLowerCase());
  }

  private async applyRecoveryStrategy(
    error: any,
    context: NetworkErrorContext,
    operation: Function,
    strategy: ErrorRecoveryStrategy
  ): Promise<{ recovered: boolean; strategy: string; result?: any; queuedForLater?: boolean }> {
    
    // Handle offline strategy
    if (this.currentCondition === 'offline') {
      if (strategy.offline.queueOperation) {
        this.queueForOffline(operation, context, null);
        return { recovered: false, strategy: 'queued_offline', queuedForLater: true };
      }
      
      if (strategy.offline.localFallback) {
        const fallbackResult = await this.tryLocalFallback(context);
        if (fallbackResult.success) {
          return { recovered: true, strategy: 'local_fallback', result: fallbackResult.data };
        }
      }
      
      return { recovered: false, strategy: 'offline_abort' };
    }

    // Handle degraded mode strategy
    if (this.degradedMode && strategy.degraded.enabled) {
      this.enableDegradedMode(strategy.degraded.features);
    }

    // Handle immediate recovery
    switch (strategy.immediate.action) {
      case 'retry':
        return this.retryWithBackoff(operation, context, strategy.immediate);
      
      case 'queue':
        this.queueOperation(operation, context);
        return { recovered: false, strategy: 'queued', queuedForLater: true };
      
      case 'fallback':
        return this.tryFallbackStrategy(context, operation);
      
      case 'abort':
        return { recovered: false, strategy: 'aborted' };
      
      default:
        return { recovered: false, strategy: 'unknown' };
    }
  }

  private async retryWithBackoff(
    operation: Function,
    context: NetworkErrorContext,
    retryConfig: { delay: number; maxAttempts: number }
  ): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    try {
      const result = await this.retryManager.execute(
        operation as () => Promise<any>,
        `network-retry-${context.operationType}`,
        {
          maxAttempts: retryConfig.maxAttempts,
          initialDelay: retryConfig.delay,
          strategy: 'exponential'
        }
      );
      
      return { recovered: true, strategy: 'retry_success', result };
    } catch (error) {
      return { recovered: false, strategy: 'retry_failed' };
    }
  }

  private async tryFallbackStrategy(
    context: NetworkErrorContext,
    operation: Function
  ): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    switch (context.operationType) {
      case 'sync':
        return this.syncFallback(context);
      case 'auth':
        return this.authFallback(context);
      case 'data':
        return this.dataFallback(context);
      case 'realtime':
        return this.realtimeFallback(context);
      default:
        return { recovered: false, strategy: 'no_fallback' };
    }
  }

  private async syncFallback(context: NetworkErrorContext): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    // Try local-only sync operations
    return { recovered: true, strategy: 'local_only_sync', result: null };
  }

  private async authFallback(context: NetworkErrorContext): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    // Try cached auth tokens
    const cachedAuth = this.getCachedAuth();
    if (cachedAuth && this.isAuthValid(cachedAuth)) {
      return { recovered: true, strategy: 'cached_auth', result: cachedAuth };
    }
    return { recovered: false, strategy: 'auth_fallback_failed' };
  }

  private async dataFallback(context: NetworkErrorContext): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    // Try cached data
    const cachedData = await this.getCachedData(context);
    if (cachedData) {
      return { recovered: true, strategy: 'cached_data', result: cachedData };
    }
    return { recovered: false, strategy: 'data_fallback_failed' };
  }

  private async realtimeFallback(context: NetworkErrorContext): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    // Fall back to polling
    return { recovered: true, strategy: 'polling_fallback', result: null };
  }

  private async tryLocalFallback(context: NetworkErrorContext): Promise<{ success: boolean; data?: any }> {
    // Implement local fallback based on operation type
    switch (context.operationType) {
      case 'sync':
        return { success: true, data: null }; // Continue with local-only operations
      case 'data':
        const localData = await this.getLocalData(context);
        return { success: !!localData, data: localData };
      default:
        return { success: false };
    }
  }

  private updateNetworkCondition(classification: any): void {
    let newCondition: NetworkCondition = this.currentCondition;
    
    if (!navigator.onLine) {
      newCondition = 'offline';
    } else if (classification.isTimeout || classification.severity === 'high') {
      newCondition = this.getWorseCondition(this.currentCondition);
    } else if (classification.severity === 'low') {
      newCondition = this.getBetterCondition(this.currentCondition);
    }
    
    if (newCondition !== this.currentCondition) {
      this.currentCondition = newCondition;
      this.onNetworkConditionChange(newCondition);
    }
    
    // Record in history
    this.networkHistory.push({
      timestamp: Date.now(),
      condition: newCondition,
      latency: classification.isTimeout ? this.config.networkThresholds.offlineTimeout : 0
    });
    
    // Keep only recent history
    if (this.networkHistory.length > 100) {
      this.networkHistory.splice(0, this.networkHistory.length - 100);
    }
  }

  private getWorseCondition(current: NetworkCondition): NetworkCondition {
    const conditions: NetworkCondition[] = ['excellent', 'good', 'poor', 'intermittent', 'offline'];
    const currentIndex = conditions.indexOf(current);
    return conditions[Math.min(currentIndex + 1, conditions.length - 1)];
  }

  private getBetterCondition(current: NetworkCondition): NetworkCondition {
    const conditions: NetworkCondition[] = ['offline', 'intermittent', 'poor', 'good', 'excellent'];
    const currentIndex = conditions.indexOf(current);
    return conditions[Math.min(currentIndex + 1, conditions.length - 1)];
  }

  private determineSeverityFromCondition(): ErrorSeverity {
    switch (this.currentCondition) {
      case 'excellent':
      case 'good':
        return 'high'; // Unexpected error on good network
      case 'poor':
        return 'medium';
      case 'intermittent':
        return 'low';
      case 'offline':
        return 'low'; // Expected when offline
      default:
        return 'medium';
    }
  }

  private calculateAdaptiveTimeout(context: NetworkErrorContext): number {
    const baseTimeout = this.config.operationTimeouts[context.operationType];
    
    // Adjust based on network condition
    switch (this.currentCondition) {
      case 'excellent':
        return baseTimeout * 0.5;
      case 'good':
        return baseTimeout;
      case 'poor':
        return baseTimeout * 2;
      case 'intermittent':
        return baseTimeout * 3;
      case 'offline':
        return baseTimeout * 0.1; // Quick timeout when offline
      default:
        return baseTimeout;
    }
  }

  private optimizeForNetwork<T>(
    operation: () => Promise<T>, 
    context: NetworkErrorContext,
    abortSignal?: AbortSignal
  ): () => Promise<T> {
    if (!this.config.degradationStrategies.compressData && !this.config.degradationStrategies.batchOperations) {
      return operation;
    }

    // Return optimized operation with abort capability
    return async () => {
      // Check if operation was aborted
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      
      if (this.config.degradationStrategies.compressData && this.currentCondition === 'poor') {
        // Would compress request/response data
      }
      
      if (this.config.degradationStrategies.batchOperations && this.currentCondition !== 'excellent') {
        // Would batch multiple operations
      }
      
      return operation();
    };
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private recordNetworkSuccess(latency: number): void {
    // Update network condition based on successful operation
    let condition: NetworkCondition = 'good';
    
    if (latency < this.config.networkThresholds.excellentLatency) {
      condition = 'excellent';
    } else if (latency < this.config.networkThresholds.goodLatency) {
      condition = 'good';
    } else if (latency < this.config.networkThresholds.poorLatency) {
      condition = 'poor';
    } else {
      condition = 'intermittent';
    }
    
    this.currentCondition = condition;
    this.networkHistory.push({
      timestamp: Date.now(),
      condition,
      latency
    });
  }

  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      {
        pattern: /timeout|aborted/i,
        condition: 'poor',
        severity: 'medium',
        strategy: {
          immediate: { action: 'retry', delay: 2000, maxAttempts: 3 },
          degraded: { enabled: true, features: ['realtime'], userNotification: 'Connection is slow' },
          offline: { queueOperation: true, localFallback: true, userNotification: 'Working offline' }
        }
      },
      {
        pattern: /network error|connection failed/i,
        condition: 'intermittent',
        severity: 'high',
        strategy: {
          immediate: { action: 'retry', delay: 5000, maxAttempts: 5 },
          degraded: { enabled: true, features: ['sync', 'realtime'], userNotification: 'Limited connectivity' },
          offline: { queueOperation: true, localFallback: true, userNotification: 'Connection lost' }
        }
      },
      {
        pattern: /rate limit|429/i,
        condition: 'good',
        severity: 'low',
        strategy: {
          immediate: { action: 'retry', delay: 60000, maxAttempts: 2 },
          degraded: { enabled: false, features: [], userNotification: '' },
          offline: { queueOperation: false, localFallback: false, userNotification: 'Service busy' }
        }
      }
    ];
  }

  private setupNetworkMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.currentCondition = 'good';
      this.disableDegradedMode();
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.currentCondition = 'offline';
      this.enableDegradedMode(['realtime', 'sync']);
    });

    // Monitor connection quality if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', () => {
        this.assessNetworkCondition();
      });
    }
  }

  private setupOfflineHandling(): void {
    // Load persisted offline queue
    this.loadPersistedQueue();
    
    // Setup periodic queue processing
    setInterval(() => {
      if (navigator.onLine && this.offlineQueue.length > 0) {
        this.processOfflineQueue();
      }
    }, 30000); // Check every 30 seconds
  }

  private assessNetworkCondition(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      if (connection.effectiveType === '4g' && connection.rtt < 100) {
        this.currentCondition = 'excellent';
      } else if (connection.effectiveType === '4g' || connection.rtt < 300) {
        this.currentCondition = 'good';
      } else if (connection.rtt < 1000) {
        this.currentCondition = 'poor';
      } else {
        this.currentCondition = 'intermittent';
      }
    }
  }

  private onNetworkConditionChange(condition: NetworkCondition): void {
    // Emit event for application to respond
    window.dispatchEvent(new CustomEvent('networkConditionChange', {
      detail: { condition, timestamp: Date.now() }
    }));
    
    // Adjust strategies based on new condition
    if (condition === 'poor' || condition === 'intermittent') {
      this.enableDegradedMode();
    } else if (condition === 'good' || condition === 'excellent') {
      this.disableDegradedMode();
    }
  }

  // Helper methods for fallback strategies
  private queueOperation(operation: Function, context: NetworkErrorContext): void {
    this.operationQueue.push({
      operation,
      context,
      timestamp: Date.now()
    });
  }

  private disableNonEssentialFeatures(features: string[]): void {
    // Emit event to disable features
    window.dispatchEvent(new CustomEvent('disableFeatures', {
      detail: { features }
    }));
  }

  private enableAllFeatures(): void {
    window.dispatchEvent(new CustomEvent('enableAllFeatures'));
  }

  private notifyDegradedMode(features: string[]): void {
    window.dispatchEvent(new CustomEvent('degradedModeEnabled', {
      detail: { features, condition: this.currentCondition }
    }));
  }

  private notifyNormalMode(): void {
    window.dispatchEvent(new CustomEvent('normalModeEnabled'));
  }

  private persistOfflineQueue(): void {
    try {
      localStorage.setItem('offline-queue', JSON.stringify(this.offlineQueue.map(item => ({
        context: item.context,
        data: item.data,
        timestamp: Date.now()
      }))));
    } catch (error) {
      console.warn('Failed to persist offline queue:', error);
    }
  }

  private loadPersistedQueue(): void {
    try {
      const stored = localStorage.getItem('offline-queue');
      if (stored) {
        const items = JSON.parse(stored);
        // Note: Functions can't be persisted, so this would need to be handled differently
        // in a real implementation
      }
    } catch (error) {
      console.warn('Failed to load persisted queue:', error);
    }
  }

  private clearPersistedQueue(): void {
    localStorage.removeItem('offline-queue');
  }

  private getCachedAuth(): any {
    // Would retrieve cached authentication data
    return null;
  }

  private isAuthValid(auth: any): boolean {
    // Would validate cached auth
    return false;
  }

  private async getCachedData(context: NetworkErrorContext): Promise<any> {
    // Would retrieve cached data based on context
    return null;
  }

  private async getLocalData(context: NetworkErrorContext): Promise<any> {
    // Would retrieve local data
    return null;
  }

  private async yield(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }
  
  /**
   * Setup resource cleanup to prevent memory leaks
   */
  private setupResourceCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.isShutdown) return;
      
      // Cleanup old network history
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // Keep 24 hours
      this.networkHistory = this.networkHistory.filter(entry => entry.timestamp > cutoff);
      
      // Cleanup old operation queue items
      const queueCutoff = Date.now() - this.queueCleanupInterval;
      this.operationQueue = this.operationQueue.filter(item => item.timestamp > queueCutoff);
      
      // Limit history size
      if (this.networkHistory.length > this.maxHistorySize) {
        this.networkHistory.splice(0, this.networkHistory.length - this.maxHistorySize);
      }
      
      // Limit queue size
      if (this.offlineQueue.length > this.maxQueueSize) {
        console.warn('Offline queue size exceeded limit, removing oldest items');
        this.offlineQueue.splice(0, this.offlineQueue.length - this.maxQueueSize);
      }
    }, this.queueCleanupInterval);
  }
  
  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Create timeout promise with proper cleanup
   */
  private createTimeoutPromise<T>(timeout: number, operationId: string): Promise<T> {
    return new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation ${operationId} timed out after ${timeout}ms`));
      }, timeout);
      
      this.requestTimeouts.set(operationId, timer);
    });
  }
  

  
  /**
   * Cleanup operation resources
   */
  private cleanupOperation(operationId: string): void {
    this.activeRequests.delete(operationId);
    
    const timeout = this.requestTimeouts.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      this.requestTimeouts.delete(operationId);
    }
  }
  
  /**
   * Store event listener for cleanup
   */
  private storeEventListener(key: string, listener: { element: EventTarget; event: string; handler: EventListener }): void {
    this.eventListeners.set(key, listener);
  }
  
  /**
   * Abort all active requests
   */
  private abortActiveRequests(): void {
    for (const controller of this.activeRequests.values()) {
      try {
        controller.abort();
      } catch (error) {
        console.warn('Failed to abort request:', error);
      }
    }
    this.activeRequests.clear();
  }
  
  /**
   * Record operation metrics for performance tracking
   */
  private recordOperationMetrics(operationType: string, duration: number, isError: boolean): void {
    if (!this.operationMetrics.has(operationType)) {
      this.operationMetrics.set(operationType, { count: 0, totalTime: 0, errors: 0 });
    }
    
    const metrics = this.operationMetrics.get(operationType)!;
    metrics.count++;
    metrics.totalTime += duration;
    
    if (isError) {
      metrics.errors++;
    }
  }
  
  /**
   * Estimate memory usage for monitoring
   */
  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    const queueSize = this.offlineQueue.length * 1000; // ~1KB per queued operation
    const historySize = this.networkHistory.length * 100; // ~100 bytes per history entry
    const metricsSize = this.operationMetrics.size * 200; // ~200 bytes per metric
    
    return queueSize + historySize + metricsSize;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleUnknownError(
    error: any,
    context: NetworkErrorContext,
    operation: Function
  ): Promise<{ recovered: boolean; strategy: string; result?: any }> {
    // Fallback handling for unknown errors
    const dbError = this.baseErrorHandler.handleError(error, { context });
    
    if (dbError.type === DatabaseErrorType.NETWORK_ERROR) {
      return this.retryWithBackoff(operation, context, { delay: 1000, maxAttempts: 2 });
    }
    
    return { recovered: false, strategy: 'unknown_error' };
  }

  // Public API
  getCurrentCondition(): NetworkCondition {
    return this.currentCondition;
  }

  getNetworkHistory(): Array<{ timestamp: number; condition: NetworkCondition; latency: number }> {
    return [...this.networkHistory];
  }

  isInDegradedMode(): boolean {
    return this.degradedMode;
  }

  getOfflineQueueSize(): number {
    return this.offlineQueue.length;
  }

  forceNetworkCondition(condition: NetworkCondition): void {
    this.currentCondition = condition;
    this.onNetworkConditionChange(condition);
  }
  
  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    activeRequests: number;
    queueSize: number;
    operationMetrics: Record<string, { count: number; avgTime: number; errorRate: number }>;
    memoryUsage: number;
  } {
    const stats: Record<string, { count: number; avgTime: number; errorRate: number }> = {};
    
    for (const [operation, metrics] of this.operationMetrics.entries()) {
      stats[operation] = {
        count: metrics.count,
        avgTime: metrics.count > 0 ? metrics.totalTime / metrics.count : 0,
        errorRate: metrics.count > 0 ? metrics.errors / metrics.count : 0
      };
    }
    
    return {
      activeRequests: this.activeRequests.size,
      queueSize: this.offlineQueue.length + this.operationQueue.length,
      operationMetrics: stats,
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  /**
   * Shutdown and cleanup all resources
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    
    // Abort all active requests
    this.abortActiveRequests();
    
    // Clear all timers
    for (const timeout of this.requestTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.requestTimeouts.clear();
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Remove all event listeners
    for (const [key, listener] of this.eventListeners.entries()) {
      try {
        if (listener.event === 'interval') {
          if (typeof listener.handler === 'function') {
            (listener.handler as Function)();
          }
        } else {
          listener.element.removeEventListener(listener.event, listener.handler);
        }
      } catch (error) {
        console.warn(`Failed to remove event listener ${key}:`, error);
      }
    }
    this.eventListeners.clear();
    
    // Clear queues
    this.offlineQueue.length = 0;
    this.operationQueue.length = 0;
    this.networkHistory.length = 0;
    this.operationMetrics.clear();
  }
}

// Singleton instance
let networkErrorHandler: NetworkErrorHandler | null = null;

export function getNetworkErrorHandler(config?: Partial<AdaptiveErrorConfig>): NetworkErrorHandler {
  if (!networkErrorHandler) {
    networkErrorHandler = new NetworkErrorHandler(config);
  }
  return networkErrorHandler;
}

// Utility function for easy integration
export async function executeWithNetworkHandling<T>(
  operation: () => Promise<T>,
  context: NetworkErrorContext
): Promise<T> {
  const handler = getNetworkErrorHandler();
  return handler.executeWithNetworkHandling(operation, context);
}