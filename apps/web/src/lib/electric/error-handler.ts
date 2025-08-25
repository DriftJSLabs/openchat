/**
 * Comprehensive Error Handling and Retry Logic for ElectricSQL Integration
 * 
 * This module provides robust error handling, retry mechanisms, and recovery strategies
 * for ElectricSQL operations in the OpenChat application. It includes specialized
 * handling for different types of errors and implements sophisticated retry policies.
 */

/**
 * Error types specific to ElectricSQL operations
 */
export enum ElectricErrorType {
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
  
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  
  // Shape subscription errors
  SHAPE_SUBSCRIPTION_FAILED = 'SHAPE_SUBSCRIPTION_FAILED',
  SHAPE_DATA_CORRUPT = 'SHAPE_DATA_CORRUPT',
  SHAPE_SCHEMA_MISMATCH = 'SHAPE_SCHEMA_MISMATCH',
  
  // Sync errors
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',
  SYNC_RATE_LIMITED = 'SYNC_RATE_LIMITED',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  REPLICATION_LAG = 'REPLICATION_LAG',
  
  // Network errors
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  NETWORK_SLOW = 'NETWORK_SLOW',
  
  // Server errors
  SERVER_ERROR = 'SERVER_ERROR',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
  
  // Client errors
  CLIENT_ERROR = 'CLIENT_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  
  // Unknown errors
  UNKNOWN = 'UNKNOWN',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',         // Informational, doesn't affect functionality
  MEDIUM = 'MEDIUM',   // Minor impact, functionality partially affected
  HIGH = 'HIGH',       // Significant impact, core functionality affected
  CRITICAL = 'CRITICAL', // Major impact, service unusable
}

/**
 * Retry strategy types
 */
export enum RetryStrategy {
  LINEAR = 'LINEAR',           // Fixed delay between retries
  EXPONENTIAL = 'EXPONENTIAL', // Exponentially increasing delay
  FIBONACCI = 'FIBONACCI',     // Fibonacci sequence delay
  CUSTOM = 'CUSTOM',          // Custom retry logic
}

/**
 * Enhanced error class for ElectricSQL operations
 */
export class ElectricError extends Error {
  public readonly type: ElectricErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;
  public readonly retryable: boolean;
  public readonly recoverable: boolean;
  
  constructor(
    message: string,
    type: ElectricErrorType = ElectricErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: Record<string, any> = {},
    retryable: boolean = true,
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'ElectricError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.retryable = retryable;
    this.recoverable = recoverable;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ElectricError);
    }
  }

  /**
   * Convert to JSON for logging and transmission
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }

  /**
   * Create error from generic Error object
   */
  static fromError(error: Error, type?: ElectricErrorType, context?: Record<string, any>): ElectricError {
    const electricType = type || ElectricErrorType.UNKNOWN;
    const severity = ElectricErrorHandler.determineSeverity(electricType);
    const retryable = ElectricErrorHandler.isRetryable(electricType);
    const recoverable = ElectricErrorHandler.isRecoverable(electricType);
    
    return new ElectricError(
      error.message,
      electricType,
      severity,
      { ...context, originalError: error.name, originalStack: error.stack },
      retryable,
      recoverable
    );
  }
}

/**
 * Retry configuration interface
 */
export interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean;
  customDelayFunction?: (attempt: number) => number;
}

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  // Logging settings
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Recovery settings
  enableAutoRecovery: boolean;
  maxRecoveryAttempts: number;
  
  // Circuit breaker settings
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  
  // Monitoring settings
  enableMetrics: boolean;
  metricsReportingInterval: number;
  
  // Custom handlers
  onError?: (error: ElectricError) => void;
  onRecovery?: (error: ElectricError, recoveryMethod: string) => void;
  onCircuitBreakerOpen?: () => void;
  onCircuitBreakerClose?: () => void;
}

/**
 * Default retry configurations for different error types
 */
const DEFAULT_RETRY_CONFIGS: Record<ElectricErrorType, RetryConfig> = {
  [ElectricErrorType.CONNECTION_FAILED]: {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    jitter: true,
  },
  [ElectricErrorType.CONNECTION_TIMEOUT]: {
    strategy: RetryStrategy.LINEAR,
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 10000,
    multiplier: 1,
    jitter: false,
  },
  [ElectricErrorType.AUTH_EXPIRED]: {
    strategy: RetryStrategy.LINEAR,
    maxAttempts: 1,
    initialDelay: 500,
    maxDelay: 1000,
    multiplier: 1,
    jitter: false,
  },
  [ElectricErrorType.SHAPE_SUBSCRIPTION_FAILED]: {
    strategy: RetryStrategy.FIBONACCI,
    maxAttempts: 4,
    initialDelay: 1000,
    maxDelay: 15000,
    multiplier: 1.618,
    jitter: true,
  },
  [ElectricErrorType.SYNC_RATE_LIMITED]: {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 3,
    initialDelay: 5000,
    maxDelay: 60000,
    multiplier: 3,
    jitter: true,
  },
  [ElectricErrorType.NETWORK_UNAVAILABLE]: {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 10,
    initialDelay: 2000,
    maxDelay: 120000,
    multiplier: 2,
    jitter: true,
  },
  [ElectricErrorType.SERVER_UNAVAILABLE]: {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 60000,
    multiplier: 2,
    jitter: true,
  },
  // Default config for other error types
  [ElectricErrorType.UNKNOWN]: {
    strategy: RetryStrategy.LINEAR,
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    multiplier: 1,
    jitter: false,
  },
} as any; // Type assertion to handle all enum values

/**
 * Circuit breaker state
 */
enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, rejecting requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service has recovered
}

/**
 * Comprehensive error handler for ElectricSQL operations
 */
export class ElectricErrorHandler {
  private config: ErrorHandlerConfig;
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  
  // Error metrics
  private errorMetrics = {
    totalErrors: 0,
    errorsByType: new Map<ElectricErrorType, number>(),
    errorsBySeverity: new Map<ErrorSeverity, number>(),
    recoveryAttempts: 0,
    successfulRecoveries: 0,
  };

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enableLogging: true,
      logLevel: 'error',
      enableAutoRecovery: true,
      maxRecoveryAttempts: 3,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 30000,
      enableMetrics: true,
      metricsReportingInterval: 60000,
      ...config,
    };
    
    // Start metrics reporting if enabled
    if (this.config.enableMetrics) {
      this.startMetricsReporting();
    }
  }

  /**
   * Handle an error with comprehensive processing
   */
  async handleError<T>(
    error: Error,
    operation: string,
    context: Record<string, any> = {},
    retryFunction?: () => Promise<T>
  ): Promise<T | null> {
    // Convert to ElectricError if needed
    const electricError = error instanceof ElectricError 
      ? error 
      : this.classifyError(error, context);

    // Log the error
    this.logError(electricError, operation, context);
    
    // Update metrics
    this.updateErrorMetrics(electricError);
    
    // Check circuit breaker
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.circuitBreakerTimeout) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.config.onCircuitBreakerClose?.();
      } else {
        throw new ElectricError(
          'Circuit breaker is open',
          ElectricErrorType.SERVER_UNAVAILABLE,
          ErrorSeverity.HIGH,
          { circuitBreakerState: this.circuitBreakerState },
          false,
          false
        );
      }
    }

    // Call custom error handler
    this.config.onError?.(electricError);

    // Attempt retry if applicable
    if (electricError.retryable && retryFunction) {
      try {
        const result = await this.executeWithRetry(retryFunction, electricError);
        
        // Success - update circuit breaker
        this.handleSuccess();
        
        return result;
      } catch (retryError) {
        // All retries failed
        this.handleFailure();
        throw retryError;
      }
    }

    // Attempt recovery if applicable
    if (electricError.recoverable && this.config.enableAutoRecovery) {
      const recovered = await this.attemptRecovery(electricError, operation, context);
      if (recovered) {
        return recovered;
      }
    }

    // Update circuit breaker state
    this.handleFailure();
    
    throw electricError;
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    error: ElectricError,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = {
      ...this.getRetryConfig(error.type),
      ...customConfig,
    };

    let lastError = error;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      if (attempt > 1) {
        const delay = this.calculateDelay(attempt - 1, retryConfig);
        await this.sleep(delay);
      }

      try {
        const result = await fn();
        
        // Log successful retry
        if (attempt > 1 && this.config.enableLogging) {
          console.log(`Operation succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (retryError) {
        lastError = retryError instanceof ElectricError 
          ? retryError 
          : ElectricError.fromError(retryError as Error, error.type);
        
        // Log retry attempt
        if (this.config.enableLogging && attempt < retryConfig.maxAttempts) {
          console.warn(`Retry attempt ${attempt} failed:`, lastError.message);
        }
        
        // Check if error is still retryable
        if (!lastError.retryable) {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Attempt automatic recovery from errors
   */
  private async attemptRecovery<T>(
    error: ElectricError,
    operation: string,
    context: Record<string, any>
  ): Promise<T | null> {
    this.errorMetrics.recoveryAttempts++;

    try {
      let recovered = false;
      
      switch (error.type) {
        case ElectricErrorType.AUTH_EXPIRED:
        case ElectricErrorType.AUTH_INVALID:
          recovered = await this.recoverFromAuthError(error, context);
          break;
          
        case ElectricErrorType.CONNECTION_LOST:
        case ElectricErrorType.CONNECTION_FAILED:
          recovered = await this.recoverFromConnectionError(error, context);
          break;
          
        case ElectricErrorType.SHAPE_SUBSCRIPTION_FAILED:
          recovered = await this.recoverFromShapeError(error, context);
          break;
          
        case ElectricErrorType.SYNC_CONFLICT:
          recovered = await this.recoverFromSyncConflict(error, context);
          break;
          
        default:
          // No specific recovery strategy
          break;
      }

      if (recovered) {
        this.errorMetrics.successfulRecoveries++;
        this.config.onRecovery?.(error, 'auto');
        return null; // Indicate recovery without return value
      }
    } catch (recoveryError) {
      this.logError(
        ElectricError.fromError(recoveryError as Error, ElectricErrorType.CLIENT_ERROR),
        'recovery',
        { originalError: error, operation }
      );
    }

    return null;
  }

  /**
   * Recover from authentication errors
   */
  private async recoverFromAuthError(error: ElectricError, context: Record<string, any>): Promise<boolean> {
    try {
      // Attempt to refresh authentication token
      // This would integrate with the auth manager
      console.log('Attempting to recover from auth error...');
      
      // Implementation would depend on your auth system
      // For now, return false to indicate no recovery
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Recover from connection errors
   */
  private async recoverFromConnectionError(error: ElectricError, context: Record<string, any>): Promise<boolean> {
    try {
      // Wait a bit and try to reconnect
      await this.sleep(2000);
      
      // Check if network is available
      if (!navigator.onLine) {
        return false;
      }
      
      // Attempt to re-establish connection
      console.log('Attempting to recover from connection error...');
      
      // Implementation would depend on your connection management
      // For now, return false to indicate no recovery
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Recover from shape subscription errors
   */
  private async recoverFromShapeError(error: ElectricError, context: Record<string, any>): Promise<boolean> {
    try {
      // Attempt to resubscribe to shape with different parameters
      console.log('Attempting to recover from shape subscription error...');
      
      // Implementation would depend on your shape management
      // For now, return false to indicate no recovery
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Recover from sync conflicts
   */
  private async recoverFromSyncConflict(error: ElectricError, context: Record<string, any>): Promise<boolean> {
    try {
      // Attempt to resolve conflict automatically
      console.log('Attempting to recover from sync conflict...');
      
      // Implementation would depend on your conflict resolution strategy
      // For now, return false to indicate no recovery
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Classify generic errors into ElectricError types
   */
  private classifyError(error: Error, context: Record<string, any>): ElectricError {
    let type = ElectricErrorType.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;

    // Classify based on error message and context
    const message = error.message.toLowerCase();
    
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('token')) {
      if (message.includes('expired')) {
        type = ElectricErrorType.AUTH_EXPIRED;
      } else if (message.includes('invalid')) {
        type = ElectricErrorType.AUTH_INVALID;
      } else {
        type = ElectricErrorType.AUTH_FAILED;
      }
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('connect') || message.includes('network') || message.includes('timeout')) {
      if (message.includes('timeout')) {
        type = ElectricErrorType.CONNECTION_TIMEOUT;
      } else if (message.includes('lost') || message.includes('disconnect')) {
        type = ElectricErrorType.CONNECTION_LOST;
      } else {
        type = ElectricErrorType.CONNECTION_FAILED;
      }
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('shape') || message.includes('subscription')) {
      type = ElectricErrorType.SHAPE_SUBSCRIPTION_FAILED;
      severity = ErrorSeverity.MEDIUM;
    } else if (message.includes('sync') || message.includes('conflict')) {
      if (message.includes('conflict')) {
        type = ElectricErrorType.SYNC_CONFLICT;
      } else if (message.includes('rate limit')) {
        type = ElectricErrorType.SYNC_RATE_LIMITED;
      } else {
        type = ElectricErrorType.SYNC_TIMEOUT;
      }
      severity = ErrorSeverity.MEDIUM;
    } else if (message.includes('server') || message.includes('5')) {
      type = ElectricErrorType.SERVER_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('database') || message.includes('replication')) {
      type = ElectricErrorType.DATABASE_ERROR;
      severity = ErrorSeverity.HIGH;
    }

    const retryable = this.isRetryable(type);
    const recoverable = this.isRecoverable(type);

    return new ElectricError(error.message, type, severity, context, retryable, recoverable);
  }

  /**
   * Determine error severity based on type
   */
  static determineSeverity(type: ElectricErrorType): ErrorSeverity {
    switch (type) {
      case ElectricErrorType.CONNECTION_FAILED:
      case ElectricErrorType.AUTH_FAILED:
      case ElectricErrorType.SERVER_ERROR:
      case ElectricErrorType.DATABASE_ERROR:
        return ErrorSeverity.CRITICAL;
        
      case ElectricErrorType.CONNECTION_TIMEOUT:
      case ElectricErrorType.CONNECTION_LOST:
      case ElectricErrorType.AUTH_EXPIRED:
      case ElectricErrorType.SERVER_UNAVAILABLE:
        return ErrorSeverity.HIGH;
        
      case ElectricErrorType.SHAPE_SUBSCRIPTION_FAILED:
      case ElectricErrorType.SYNC_CONFLICT:
      case ElectricErrorType.SYNC_TIMEOUT:
      case ElectricErrorType.REPLICATION_LAG:
        return ErrorSeverity.MEDIUM;
        
      default:
        return ErrorSeverity.LOW;
    }
  }

  /**
   * Check if error type is retryable
   */
  static isRetryable(type: ElectricErrorType): boolean {
    const nonRetryableTypes = [
      ElectricErrorType.AUTH_INVALID,
      ElectricErrorType.INVALID_REQUEST,
      ElectricErrorType.CLIENT_ERROR,
      ElectricErrorType.SHAPE_SCHEMA_MISMATCH,
    ];
    
    return !nonRetryableTypes.includes(type);
  }

  /**
   * Check if error type is recoverable
   */
  static isRecoverable(type: ElectricErrorType): boolean {
    const nonRecoverableTypes = [
      ElectricErrorType.SHAPE_SCHEMA_MISMATCH,
      ElectricErrorType.INVALID_REQUEST,
      ElectricErrorType.CLIENT_ERROR,
    ];
    
    return !nonRecoverableTypes.includes(type);
  }

  /**
   * Get retry configuration for error type
   */
  private getRetryConfig(type: ElectricErrorType): RetryConfig {
    return DEFAULT_RETRY_CONFIGS[type] || DEFAULT_RETRY_CONFIGS[ElectricErrorType.UNKNOWN];
  }

  /**
   * Calculate delay for retry attempt
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategy.LINEAR:
        delay = config.initialDelay;
        break;
        
      case RetryStrategy.EXPONENTIAL:
        delay = Math.min(config.initialDelay * Math.pow(config.multiplier, attempt), config.maxDelay);
        break;
        
      case RetryStrategy.FIBONACCI:
        delay = Math.min(this.fibonacci(attempt) * config.initialDelay, config.maxDelay);
        break;
        
      case RetryStrategy.CUSTOM:
        delay = config.customDelayFunction?.(attempt) || config.initialDelay;
        break;
        
      default:
        delay = config.initialDelay;
    }

    // Add jitter if enabled
    if (config.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }

    return Math.max(delay, 0);
  }

  /**
   * Calculate fibonacci number
   */
  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    let a = 1, b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  }

  /**
   * Handle successful operation (for circuit breaker)
   */
  private handleSuccess(): void {
    this.successCount++;
    
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.CLOSED;
      this.failureCount = 0;
      console.log('Circuit breaker closed - service recovered');
    }
  }

  /**
   * Handle failed operation (for circuit breaker)
   */
  private handleFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (
      this.config.enableCircuitBreaker &&
      this.circuitBreakerState === CircuitBreakerState.CLOSED &&
      this.failureCount >= this.config.circuitBreakerThreshold
    ) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      this.config.onCircuitBreakerOpen?.();
      console.warn('Circuit breaker opened due to repeated failures');
    }
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: ElectricError, operation: string, context: Record<string, any>): void {
    if (!this.config.enableLogging) return;

    const logData = {
      operation,
      error: error.toJSON(),
      context,
      circuitBreakerState: this.circuitBreakerState,
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('CRITICAL ElectricSQL Error:', logData);
        break;
      case ErrorSeverity.HIGH:
        console.error('HIGH ElectricSQL Error:', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('MEDIUM ElectricSQL Error:', logData);
        break;
      case ErrorSeverity.LOW:
        console.info('LOW ElectricSQL Error:', logData);
        break;
    }
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(error: ElectricError): void {
    if (!this.config.enableMetrics) return;

    this.errorMetrics.totalErrors++;
    
    const typeCount = this.errorMetrics.errorsByType.get(error.type) || 0;
    this.errorMetrics.errorsByType.set(error.type, typeCount + 1);
    
    const severityCount = this.errorMetrics.errorsBySeverity.get(error.severity) || 0;
    this.errorMetrics.errorsBySeverity.set(error.severity, severityCount + 1);
  }

  /**
   * Start metrics reporting
   */
  private startMetricsReporting(): void {
    setInterval(() => {
      console.log('ElectricSQL Error Metrics:', {
        ...this.errorMetrics,
        circuitBreakerState: this.circuitBreakerState,
        failureCount: this.failureCount,
        successCount: this.successCount,
      });
    }, this.config.metricsReportingInterval);
  }

  /**
   * Get current error metrics
   */
  getMetrics(): typeof this.errorMetrics & {
    circuitBreakerState: CircuitBreakerState;
    failureCount: number;
    successCount: number;
  } {
    return {
      ...this.errorMetrics,
      circuitBreakerState: this.circuitBreakerState,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerState = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    console.log('Circuit breaker manually reset');
  }

  /**
   * Utility method to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global error handler instance
let errorHandler: ElectricErrorHandler | null = null;

/**
 * Get the global ElectricSQL error handler instance
 */
export function getElectricErrorHandler(config?: Partial<ErrorHandlerConfig>): ElectricErrorHandler {
  if (!errorHandler) {
    errorHandler = new ElectricErrorHandler(config);
  }
  return errorHandler;
}

/**
 * Utility function to handle errors with automatic classification and retry
 */
export async function handleElectricError<T>(
  error: Error,
  operation: string,
  context: Record<string, any> = {},
  retryFunction?: () => Promise<T>
): Promise<T | null> {
  const handler = getElectricErrorHandler();
  return handler.handleError(error, operation, context, retryFunction);
}

/**
 * Decorator for automatic error handling
 */
export function withElectricErrorHandling<T extends any[], R>(
  operation: string,
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const result = await handleElectricError(
        error as Error,
        operation,
        { args },
        () => fn(...args)
      );
      
      if (result !== null) {
        return result;
      }
      
      throw error;
    }
  };
}