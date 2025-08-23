import { getDatabaseErrorHandler, DatabaseErrorType, type DatabaseError } from './error-handler';

export type RetryStrategy = 'exponential' | 'linear' | 'fixed' | 'fibonacci' | 'adaptive';

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  strategy: RetryStrategy;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  timeoutMs: number;
  retryCondition?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

export interface RetryState {
  attempt: number;
  totalDelay: number;
  lastError: any;
  startTime: number;
  networkQuality: 'excellent' | 'good' | 'poor' | 'offline';
}

export interface NetworkCondition {
  online: boolean;
  effectiveType: string;
  rtt: number;
  downlink: number;
  saveData: boolean;
}

/**
 * Advanced retry manager with adaptive strategies and network awareness
 */
export class RetryManager {
  private config: RetryConfig;
  private activeRetries = new Map<string, RetryState>();
  private networkConditions: NetworkCondition = {
    online: navigator.onLine,
    effectiveType: 'unknown',
    rtt: 0,
    downlink: 0,
    saveData: false
  };
  private errorHandler = getDatabaseErrorHandler();
  private adaptiveMetrics = new Map<string, number[]>(); // Track success rates

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      strategy: 'exponential',
      backoffMultiplier: 2,
      jitterEnabled: true,
      timeoutMs: 300000, // 5 minutes total timeout
      ...config
    };

    this.setupNetworkMonitoring();
    this.setupDefaultRetryConditions();
  }

  private setupNetworkMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.networkConditions.online = true;
      this.resumePausedRetries();
    });

    window.addEventListener('offline', () => {
      this.networkConditions.online = false;
      this.pauseRetries();
    });

    // Monitor network quality if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      const updateNetworkInfo = () => {
        this.networkConditions = {
          online: navigator.onLine,
          effectiveType: connection.effectiveType || 'unknown',
          rtt: connection.rtt || 0,
          downlink: connection.downlink || 0,
          saveData: connection.saveData || false
        };
        
        this.adaptRetryStrategies();
      };

      connection.addEventListener('change', updateNetworkInfo);
      updateNetworkInfo();
    }
  }

  private setupDefaultRetryConditions(): void {
    if (!this.config.retryCondition) {
      this.config.retryCondition = (error: any, attempt: number) => {
        // Don't retry certain types of errors
        if (error instanceof DatabaseError) {
          const nonRetryableErrors = [
            DatabaseErrorType.PERMISSION_DENIED,
            DatabaseErrorType.STORAGE_QUOTA_EXCEEDED,
            DatabaseErrorType.CONFLICT_RESOLUTION_FAILED
          ];
          
          if (nonRetryableErrors.includes(error.type)) {
            return false;
          }
        }

        // Don't retry if we've exceeded time limit
        const retryState = this.getRetryState(this.generateOperationId(error));
        if (retryState && Date.now() - retryState.startTime > this.config.timeoutMs) {
          return false;
        }

        // Always retry network errors if we're online
        if (this.isNetworkError(error) && this.networkConditions.online) {
          return true;
        }

        // Don't retry 4xx client errors (except for specific cases)
        if (this.isClientError(error)) {
          return false;
        }

        return true;
      };
    }
  }

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationId?: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.config, ...customConfig };
    const id = operationId || this.generateOperationId(operation);
    
    let retryState: RetryState = {
      attempt: 0,
      totalDelay: 0,
      lastError: null,
      startTime: Date.now(),
      networkQuality: this.assessNetworkQuality()
    };

    this.activeRetries.set(id, retryState);

    try {
      while (retryState.attempt < config.maxAttempts) {
        try {
          // Check timeout
          if (Date.now() - retryState.startTime > config.timeoutMs) {
            throw new Error(`Operation timeout after ${config.timeoutMs}ms`);
          }

          // Execute the operation
          const result = await this.executeWithTimeout(operation, config.timeoutMs);
          
          // Success - clean up and record metrics
          this.activeRetries.delete(id);
          this.recordSuccess(id, retryState.attempt);
          return result;

        } catch (error) {
          retryState.lastError = error;
          retryState.attempt++;
          
          const dbError = this.errorHandler.handleError(error, {
            operationId: id,
            attempt: retryState.attempt,
            networkConditions: this.networkConditions
          });

          // Check if we should retry
          if (!config.retryCondition!(dbError, retryState.attempt) || 
              retryState.attempt >= config.maxAttempts) {
            this.activeRetries.delete(id);
            this.recordFailure(id, retryState.attempt);
            throw dbError;
          }

          // Calculate delay for next attempt
          const delay = this.calculateDelay(config, retryState);
          retryState.totalDelay += delay;

          // Call retry callback if provided
          config.onRetry?.(dbError, retryState.attempt, delay);

          // Wait before retrying
          await this.sleep(delay);
          
          // Update retry state
          this.activeRetries.set(id, retryState);
        }
      }
    } catch (error) {
      this.activeRetries.delete(id);
      throw error;
    }

    // Should never reach here, but just in case
    this.activeRetries.delete(id);
    throw retryState.lastError;
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceId: string,
    options: {
      failureThreshold: number;
      resetTimeout: number;
      monitorWindow: number;
    } = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitorWindow: 300000
    }
  ): Promise<T> {
    const circuitState = this.getCircuitState(serviceId, options);

    switch (circuitState.state) {
      case 'OPEN':
        if (Date.now() - circuitState.lastFailure < options.resetTimeout) {
          throw new Error(`Circuit breaker OPEN for ${serviceId}`);
        }
        // Move to half-open state
        circuitState.state = 'HALF_OPEN';
        break;

      case 'HALF_OPEN':
        // Allow one request through
        break;

      case 'CLOSED':
        // Normal operation
        break;
    }

    try {
      const result = await this.execute(operation, `circuit-${serviceId}`);
      
      // Success - close circuit or keep it closed
      if (circuitState.state === 'HALF_OPEN') {
        circuitState.state = 'CLOSED';
        circuitState.failures = 0;
      }
      
      return result;

    } catch (error) {
      circuitState.failures++;
      circuitState.lastFailure = Date.now();
      
      // Check if we should open the circuit
      if (circuitState.failures >= options.failureThreshold) {
        circuitState.state = 'OPEN';
      }
      
      throw error;
    }
  }

  /**
   * Batch retry for multiple operations
   */
  async executeBatch<T>(
    operations: Array<() => Promise<T>>,
    options: {
      maxConcurrency: number;
      failFast: boolean;
      retryFailedOnly: boolean;
    } = {
      maxConcurrency: 3,
      failFast: false,
      retryFailedOnly: true
    }
  ): Promise<Array<{ success: boolean; result?: T; error?: any }>> {
    const results: Array<{ success: boolean; result?: T; error?: any }> = [];
    const pendingOperations = [...operations];
    const activeOperations = new Set<Promise<any>>();

    while (pendingOperations.length > 0 || activeOperations.size > 0) {
      // Start new operations up to concurrency limit
      while (pendingOperations.length > 0 && activeOperations.size < options.maxConcurrency) {
        const operation = pendingOperations.shift()!;
        const operationPromise = this.execute(operation)
          .then(result => ({ success: true, result }))
          .catch(error => ({ success: false, error }));
        
        activeOperations.add(operationPromise);
      }

      // Wait for at least one operation to complete
      if (activeOperations.size > 0) {
        const completed = await Promise.race(activeOperations);
        activeOperations.delete(Promise.resolve(completed));
        results.push(completed);

        // Handle fail-fast behavior
        if (options.failFast && !completed.success) {
          // Cancel remaining operations and return
          break;
        }
      }
    }

    // If retryFailedOnly is enabled, retry failed operations
    if (options.retryFailedOnly) {
      const failedResults = results.filter(r => !r.success);
      if (failedResults.length > 0) {
        // Implement retry logic for failed operations
        // This is a simplified implementation - you might want more sophisticated retry logic
      }
    }

    return results;
  }

  private calculateDelay(config: RetryConfig, retryState: RetryState): number {
    let delay: number;

    switch (config.strategy) {
      case 'exponential':
        delay = config.initialDelay * Math.pow(config.backoffMultiplier, retryState.attempt - 1);
        break;

      case 'linear':
        delay = config.initialDelay * retryState.attempt;
        break;

      case 'fixed':
        delay = config.initialDelay;
        break;

      case 'fibonacci':
        delay = this.fibonacci(retryState.attempt) * config.initialDelay;
        break;

      case 'adaptive':
        delay = this.calculateAdaptiveDelay(config, retryState);
        break;

      default:
        delay = config.initialDelay * Math.pow(config.backoffMultiplier, retryState.attempt - 1);
    }

    // Apply maximum delay cap
    delay = Math.min(delay, config.maxDelay);

    // Apply network condition adjustments
    delay = this.adjustDelayForNetwork(delay, retryState.networkQuality);

    // Apply jitter if enabled
    if (config.jitterEnabled) {
      const jitter = Math.random() * 0.3; // ±30% jitter
      delay *= (1 + (jitter - 0.15));
    }

    return Math.max(delay, 100); // Minimum 100ms delay
  }

  private calculateAdaptiveDelay(config: RetryConfig, retryState: RetryState): number {
    const operationId = this.generateOperationId(retryState.lastError);
    const successRates = this.adaptiveMetrics.get(operationId) || [];
    
    if (successRates.length < 3) {
      // Not enough data, use exponential backoff
      return config.initialDelay * Math.pow(config.backoffMultiplier, retryState.attempt - 1);
    }

    // Calculate recent success rate
    const recentSuccessRate = successRates.slice(-10).reduce((sum, rate) => sum + rate, 0) / Math.min(successRates.length, 10);
    
    // Adjust delay based on success rate and network conditions
    const baseDelay = config.initialDelay * Math.pow(config.backoffMultiplier, retryState.attempt - 1);
    const successAdjustment = 1 + (1 - recentSuccessRate); // Higher delay for lower success rates
    const networkAdjustment = this.getNetworkAdjustment();
    
    return baseDelay * successAdjustment * networkAdjustment;
  }

  private adjustDelayForNetwork(delay: number, networkQuality: string): number {
    switch (networkQuality) {
      case 'excellent':
        return delay * 0.5; // Faster retries on good networks
      case 'good':
        return delay * 0.8;
      case 'poor':
        return delay * 1.5; // Slower retries on poor networks
      case 'offline':
        return delay * 3; // Much slower when offline
      default:
        return delay;
    }
  }

  private assessNetworkQuality(): 'excellent' | 'good' | 'poor' | 'offline' {
    if (!this.networkConditions.online) {
      return 'offline';
    }

    const { effectiveType, rtt, downlink } = this.networkConditions;
    
    if (effectiveType === '4g' && rtt < 100 && downlink > 10) {
      return 'excellent';
    } else if (effectiveType === '4g' || (rtt < 300 && downlink > 1)) {
      return 'good';
    } else {
      return 'poor';
    }
  }

  private getNetworkAdjustment(): number {
    const quality = this.assessNetworkQuality();
    switch (quality) {
      case 'excellent': return 0.5;
      case 'good': return 0.8;
      case 'poor': return 1.5;
      case 'offline': return 3;
      default: return 1;
    }
  }

  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    let a = 1, b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isNetworkError(error: any): boolean {
    if (error instanceof DatabaseError) {
      return error.type === DatabaseErrorType.NETWORK_ERROR || 
             error.type === DatabaseErrorType.CONNECTION_FAILED;
    }
    
    const message = error?.message?.toLowerCase() || '';
    return message.includes('network') || 
           message.includes('fetch') || 
           message.includes('timeout') ||
           message.includes('connection');
  }

  private isClientError(error: any): boolean {
    // Check for HTTP 4xx errors
    if (error?.response?.status >= 400 && error?.response?.status < 500) {
      // Retry auth errors (401) but not other client errors
      return error.response.status !== 401;
    }
    return false;
  }

  private generateOperationId(operation: any): string {
    // Generate a semi-stable ID for the operation
    const operationString = operation?.toString() || JSON.stringify(operation) || 'unknown';
    return `op-${this.simpleHash(operationString)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private getRetryState(operationId: string): RetryState | undefined {
    return this.activeRetries.get(operationId);
  }

  private recordSuccess(operationId: string, attempts: number): void {
    if (!this.adaptiveMetrics.has(operationId)) {
      this.adaptiveMetrics.set(operationId, []);
    }
    
    const metrics = this.adaptiveMetrics.get(operationId)!;
    metrics.push(1); // Success
    
    // Keep only recent metrics
    if (metrics.length > 50) {
      metrics.splice(0, metrics.length - 50);
    }
  }

  private recordFailure(operationId: string, attempts: number): void {
    if (!this.adaptiveMetrics.has(operationId)) {
      this.adaptiveMetrics.set(operationId, []);
    }
    
    const metrics = this.adaptiveMetrics.get(operationId)!;
    metrics.push(0); // Failure
    
    // Keep only recent metrics
    if (metrics.length > 50) {
      metrics.splice(0, metrics.length - 50);
    }
  }

  private adaptRetryStrategies(): void {
    // Adjust global retry parameters based on network conditions
    const quality = this.assessNetworkQuality();
    
    switch (quality) {
      case 'excellent':
        this.config.maxAttempts = Math.min(this.config.maxAttempts, 3);
        this.config.initialDelay = Math.max(this.config.initialDelay * 0.5, 500);
        break;
      case 'poor':
        this.config.maxAttempts = Math.max(this.config.maxAttempts, 7);
        this.config.initialDelay = this.config.initialDelay * 1.5;
        break;
      case 'offline':
        // Pause all active retries
        this.pauseRetries();
        break;
    }
  }

  private pauseRetries(): void {
    // In a real implementation, you might pause timers
    console.info('Retries paused due to offline status');
  }

  private resumePausedRetries(): void {
    // In a real implementation, you might resume paused timers
    console.info('Retries resumed - back online');
  }

  private circuitStates = new Map<string, {
    state: 'OPEN' | 'CLOSED' | 'HALF_OPEN';
    failures: number;
    lastFailure: number;
  }>();

  private getCircuitState(serviceId: string, options: any) {
    if (!this.circuitStates.has(serviceId)) {
      this.circuitStates.set(serviceId, {
        state: 'CLOSED',
        failures: 0,
        lastFailure: 0
      });
    }
    return this.circuitStates.get(serviceId)!;
  }

  // Public API methods
  getActiveRetries(): Array<{ id: string; state: RetryState }> {
    return Array.from(this.activeRetries.entries()).map(([id, state]) => ({ id, state }));
  }

  getNetworkConditions(): NetworkCondition {
    return { ...this.networkConditions };
  }

  getRetryMetrics(): {
    activeRetries: number;
    totalOperations: number;
    successRate: number;
    avgAttempts: number;
  } {
    const allMetrics = Array.from(this.adaptiveMetrics.values()).flat();
    const totalOperations = allMetrics.length;
    const successCount = allMetrics.filter(m => m === 1).length;
    
    return {
      activeRetries: this.activeRetries.size,
      totalOperations,
      successRate: totalOperations > 0 ? successCount / totalOperations : 0,
      avgAttempts: 0 // Would need to track this separately
    };
  }

  reset(): void {
    this.activeRetries.clear();
    this.adaptiveMetrics.clear();
    this.circuitStates.clear();
  }
}

// Singleton instance
let retryManager: RetryManager | null = null;

export function getRetryManager(config?: Partial<RetryConfig>): RetryManager {
  if (!retryManager) {
    retryManager = new RetryManager(config);
  }
  return retryManager;
}

// Utility functions for common retry patterns
export function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const retryManager = getRetryManager();
  return retryManager.execute(operation, undefined, config);
}

export function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  serviceId: string,
  options?: any
): Promise<T> {
  const retryManager = getRetryManager();
  return retryManager.executeWithCircuitBreaker(operation, serviceId, options);
}