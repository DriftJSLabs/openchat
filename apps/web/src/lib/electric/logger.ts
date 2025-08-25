/**
 * Comprehensive Logging System for ElectricSQL Operations in OpenChat
 * 
 * This module provides structured, contextual logging for all ElectricSQL operations
 * including sync activities, error handling, performance monitoring, and debugging.
 * 
 * Key features:
 * - Structured logging with JSON output
 * - Context-aware logging with correlation IDs
 * - Performance metrics and timing
 * - Multiple log levels and filtering
 * - Integration with monitoring systems
 * - Client-side and server-side logging
 * - Log aggregation and analysis
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * Log categories for organizing different types of operations
 */
export enum LogCategory {
  AUTH = 'auth',
  SYNC = 'sync',
  SHAPE = 'shape',
  CONNECTION = 'connection',
  DATABASE = 'database',
  PERFORMANCE = 'performance',
  ERROR = 'error',
  USER_ACTION = 'user_action',
  SYSTEM = 'system',
}

/**
 * Log context interface for providing additional information
 */
export interface LogContext {
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  correlationId?: string;
  operationId?: string;
  shapeName?: string;
  tableName?: string;
  recordCount?: number;
  duration?: number;
  errorCode?: string;
  stackTrace?: string;
  userAgent?: string;
  ip?: string;
  [key: string]: any;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  category: LogCategory;
  message: string;
  context: LogContext;
  environment: string;
  version: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  // Basic settings
  level: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  
  // Format settings
  useJsonFormat: boolean;
  includeStackTrace: boolean;
  
  // Context settings
  autoGenerateCorrelationId: boolean;
  includeUserContext: boolean;
  includeDeviceContext: boolean;
  
  // Performance settings
  enablePerformanceLogging: boolean;
  performanceThreshold: number; // ms
  
  // Remote logging settings
  remoteEndpoint?: string;
  remoteApiKey?: string;
  batchSize: number;
  flushInterval: number; // ms
  
  // Storage settings
  enableLocalStorage: boolean;
  maxLocalStorageEntries: number;
  
  // Filtering
  excludeCategories: LogCategory[];
  includeOnlyCategories?: LogCategory[];
  
  // Development settings
  enableDebugMode: boolean;
  verboseErrors: boolean;
}

/**
 * Default logger configuration
 */
const defaultConfig: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableRemote: false,
  useJsonFormat: true,
  includeStackTrace: false,
  autoGenerateCorrelationId: true,
  includeUserContext: true,
  includeDeviceContext: true,
  enablePerformanceLogging: true,
  performanceThreshold: 1000,
  batchSize: 50,
  flushInterval: 5000,
  enableLocalStorage: true,
  maxLocalStorageEntries: 1000,
  excludeCategories: [],
  enableDebugMode: false,
  verboseErrors: true,
};

/**
 * Performance timer interface
 */
interface PerformanceTimer {
  id: string;
  startTime: number;
  category: LogCategory;
  operation: string;
  context: LogContext;
}

/**
 * Remote log queue entry
 */
interface RemoteLogQueueEntry {
  logEntry: LogEntry;
  retryCount: number;
  lastAttempt: number;
}

/**
 * Comprehensive ElectricSQL Logger
 */
export class ElectricLogger {
  private config: LoggerConfig;
  private context: LogContext = {};
  private performanceTimers = new Map<string, PerformanceTimer>();
  private remoteLogQueue: RemoteLogQueueEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private correlationCounter = 0;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Initialize auto-flush for remote logging
    if (this.config.enableRemote) {
      this.startAutoFlush();
    }
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    // Initialize device context
    this.initializeDeviceContext();
  }

  /**
   * Set global context that will be included in all log entries
   */
  setGlobalContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Update global context
   */
  updateGlobalContext(updates: Partial<LogContext>): void {
    Object.assign(this.context, updates);
  }

  /**
   * Clear global context
   */
  clearGlobalContext(): void {
    this.context = {};
  }

  /**
   * Debug level logging
   */
  debug(message: string, category: LogCategory = LogCategory.SYSTEM, context: LogContext = {}): void {
    this.log(LogLevel.DEBUG, category, message, context);
  }

  /**
   * Info level logging
   */
  info(message: string, category: LogCategory = LogCategory.SYSTEM, context: LogContext = {}): void {
    this.log(LogLevel.INFO, category, message, context);
  }

  /**
   * Warning level logging
   */
  warn(message: string, category: LogCategory = LogCategory.SYSTEM, context: LogContext = {}): void {
    this.log(LogLevel.WARN, category, message, context);
  }

  /**
   * Error level logging
   */
  error(message: string, category: LogCategory = LogCategory.ERROR, context: LogContext = {}): void {
    this.log(LogLevel.ERROR, category, message, context);
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, category: LogCategory = LogCategory.ERROR, context: LogContext = {}): void {
    this.log(LogLevel.FATAL, category, message, context);
  }

  /**
   * Log authentication events
   */
  logAuth(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.AUTH, context);
  }

  /**
   * Log sync operations
   */
  logSync(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.SYNC, context);
  }

  /**
   * Log shape operations
   */
  logShape(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.SHAPE, context);
  }

  /**
   * Log connection events
   */
  logConnection(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.CONNECTION, context);
  }

  /**
   * Log database operations
   */
  logDatabase(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.DATABASE, context);
  }

  /**
   * Log user actions
   */
  logUserAction(message: string, context: LogContext = {}): void {
    this.info(message, LogCategory.USER_ACTION, context);
  }

  /**
   * Log errors with automatic classification
   */
  logError(error: Error | string, category: LogCategory = LogCategory.ERROR, context: LogContext = {}): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorContext = error instanceof Error 
      ? { ...context, errorCode: error.name, stackTrace: error.stack }
      : context;

    this.error(errorMessage, category, errorContext);
  }

  /**
   * Start performance timer
   */
  startTimer(operation: string, category: LogCategory = LogCategory.PERFORMANCE, context: LogContext = {}): string {
    const timerId = this.generateTimerId(operation);
    
    this.performanceTimers.set(timerId, {
      id: timerId,
      startTime: performance.now(),
      category,
      operation,
      context: { ...this.context, ...context },
    });

    if (this.config.enableDebugMode) {
      this.debug(`Timer started: ${operation}`, LogCategory.PERFORMANCE, { timerId, ...context });
    }

    return timerId;
  }

  /**
   * End performance timer and log results
   */
  endTimer(timerId: string, additionalContext: LogContext = {}): number {
    const timer = this.performanceTimers.get(timerId);
    
    if (!timer) {
      this.warn(`Timer not found: ${timerId}`, LogCategory.PERFORMANCE);
      return 0;
    }

    const duration = performance.now() - timer.startTime;
    const finalContext = {
      ...timer.context,
      ...additionalContext,
      duration,
      timerId,
    };

    // Log performance metrics
    if (this.config.enablePerformanceLogging) {
      const level = duration > this.config.performanceThreshold ? LogLevel.WARN : LogLevel.INFO;
      const message = `${timer.operation} completed in ${duration.toFixed(2)}ms`;
      
      this.log(level, LogCategory.PERFORMANCE, message, finalContext);
    }

    this.performanceTimers.delete(timerId);
    return duration;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    fn: () => Promise<T> | T,
    operation: string,
    category: LogCategory = LogCategory.PERFORMANCE,
    context: LogContext = {}
  ): Promise<T> {
    const timerId = this.startTimer(operation, category, context);
    
    try {
      const result = await fn();
      this.endTimer(timerId, { success: true });
      return result;
    } catch (error) {
      this.endTimer(timerId, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Log structured data
   */
  logStructured(data: Record<string, any>, level: LogLevel = LogLevel.INFO, category: LogCategory = LogCategory.SYSTEM): void {
    const message = 'Structured data log';
    this.log(level, category, message, data);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, category: LogCategory, message: string, context: LogContext = {}): void {
    // Check if logging is enabled for this level
    if (level < this.config.level) {
      return;
    }

    // Check category filters
    if (this.config.excludeCategories.includes(category)) {
      return;
    }

    if (this.config.includeOnlyCategories && !this.config.includeOnlyCategories.includes(category)) {
      return;
    }

    // Create log entry
    const logEntry = this.createLogEntry(level, category, message, context);

    // Output to console
    if (this.config.enableConsole) {
      this.outputToConsole(logEntry);
    }

    // Store locally
    if (this.config.enableLocalStorage) {
      this.storeLocally(logEntry);
    }

    // Queue for remote logging
    if (this.config.enableRemote) {
      this.queueForRemote(logEntry);
    }
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(level: LogLevel, category: LogCategory, message: string, context: LogContext): LogEntry {
    const timestamp = new Date().toISOString();
    const correlationId = context.correlationId || 
      (this.config.autoGenerateCorrelationId ? this.generateCorrelationId() : undefined);

    const finalContext: LogContext = {
      ...this.context,
      ...context,
    };

    // Add correlation ID if generated
    if (correlationId) {
      finalContext.correlationId = correlationId;
    }

    // Add user context if enabled and available
    if (this.config.includeUserContext && this.context.userId) {
      finalContext.userId = this.context.userId;
    }

    // Add device context if enabled and available
    if (this.config.includeDeviceContext && this.context.deviceId) {
      finalContext.deviceId = this.context.deviceId;
    }

    return {
      timestamp,
      level,
      levelName: LogLevel[level],
      category,
      message,
      context: finalContext,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
    };
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(logEntry: LogEntry): void {
    const { level, levelName, category, message, context, timestamp } = logEntry;

    if (this.config.useJsonFormat) {
      // JSON format for structured logging
      const jsonOutput = JSON.stringify(logEntry, null, this.config.enableDebugMode ? 2 : 0);
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(jsonOutput);
          break;
        case LogLevel.INFO:
          console.info(jsonOutput);
          break;
        case LogLevel.WARN:
          console.warn(jsonOutput);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(jsonOutput);
          break;
      }
    } else {
      // Human-readable format
      const prefix = `[${timestamp}] ${levelName} [${category.toUpperCase()}]`;
      const contextStr = Object.keys(context).length > 0 
        ? ` ${JSON.stringify(context)}`
        : '';
      
      const output = `${prefix} ${message}${contextStr}`;
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(output);
          break;
        case LogLevel.INFO:
          console.info(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(output);
          break;
      }
    }
  }

  /**
   * Store log entry locally
   */
  private storeLocally(logEntry: LogEntry): void {
    if (typeof window === 'undefined') return;

    try {
      const storageKey = 'electric-sql-logs';
      const existingLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      existingLogs.push(logEntry);
      
      // Maintain maximum storage limit
      if (existingLogs.length > this.config.maxLocalStorageEntries) {
        existingLogs.splice(0, existingLogs.length - this.config.maxLocalStorageEntries);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(existingLogs));
    } catch (error) {
      console.warn('Failed to store log locally:', error);
    }
  }

  /**
   * Queue log entry for remote transmission
   */
  private queueForRemote(logEntry: LogEntry): void {
    this.remoteLogQueue.push({
      logEntry,
      retryCount: 0,
      lastAttempt: 0,
    });

    // Flush immediately if queue is full
    if (this.remoteLogQueue.length >= this.config.batchSize) {
      this.flushRemoteQueue();
    }
  }

  /**
   * Start auto-flush timer for remote logging
   */
  private startAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushRemoteQueue();
    }, this.config.flushInterval);
  }

  /**
   * Flush remote log queue
   */
  private async flushRemoteQueue(): Promise<void> {
    if (this.remoteLogQueue.length === 0 || !this.config.remoteEndpoint) {
      return;
    }

    const batch = this.remoteLogQueue.splice(0, this.config.batchSize);
    
    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.remoteApiKey && { 'Authorization': `Bearer ${this.config.remoteApiKey}` }),
        },
        body: JSON.stringify({
          logs: batch.map(entry => entry.logEntry),
          timestamp: new Date().toISOString(),
          source: 'electric-sql-client',
        }),
      });

      if (!response.ok) {
        throw new Error(`Remote logging failed: ${response.status} ${response.statusText}`);
      }

      // Success - logs were sent
      if (this.config.enableDebugMode) {
        console.debug(`Successfully sent ${batch.length} logs to remote endpoint`);
      }
    } catch (error) {
      // Failed to send - re-queue with retry logic
      const now = Date.now();
      const retryableBatch = batch.filter(entry => {
        entry.retryCount++;
        entry.lastAttempt = now;
        
        // Max 3 retries with exponential backoff
        const maxRetries = 3;
        const backoffDelay = Math.pow(2, entry.retryCount) * 1000; // 1s, 2s, 4s
        const shouldRetry = entry.retryCount <= maxRetries && 
                           (now - entry.lastAttempt) > backoffDelay;
        
        return shouldRetry;
      });

      // Re-queue retryable entries
      this.remoteLogQueue.unshift(...retryableBatch);
      
      console.warn(`Failed to send logs to remote endpoint:`, error);
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', LogCategory.ERROR, {
        reason: event.reason,
        promise: 'Promise object not serializable',
        stackTrace: event.reason?.stack,
      });
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.error('Uncaught error', LogCategory.ERROR, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stackTrace: event.error?.stack,
      });
    });
  }

  /**
   * Initialize device context
   */
  private initializeDeviceContext(): void {
    if (typeof window === 'undefined') return;

    try {
      // Generate or retrieve device ID
      let deviceId = localStorage.getItem('electric-device-id');
      if (!deviceId) {
        deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2)}`;
        localStorage.setItem('electric-device-id', deviceId);
      }

      // Set device context
      this.context.deviceId = deviceId;
      this.context.userAgent = navigator.userAgent;
      
      // Add session ID
      this.context.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    } catch (error) {
      console.warn('Failed to initialize device context:', error);
    }
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    this.correlationCounter++;
    return `corr-${Date.now()}-${this.correlationCounter}`;
  }

  /**
   * Generate timer ID
   */
  private generateTimerId(operation: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `timer-${operation}-${timestamp}-${random}`;
  }

  /**
   * Get stored logs from local storage
   */
  getStoredLogs(): LogEntry[] {
    if (typeof window === 'undefined') return [];

    try {
      const storageKey = 'electric-sql-logs';
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (error) {
      console.warn('Failed to retrieve stored logs:', error);
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  clearStoredLogs(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem('electric-sql-logs');
    } catch (error) {
      console.warn('Failed to clear stored logs:', error);
    }
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    const logs = this.getStoredLogs();
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Get logging statistics
   */
  getStatistics(): {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByCategory: Record<string, number>;
    queuedForRemote: number;
    activeTimers: number;
  } {
    const logs = this.getStoredLogs();
    const logsByLevel: Record<string, number> = {};
    const logsByCategory: Record<string, number> = {};

    logs.forEach(log => {
      const level = LogLevel[log.level] || 'UNKNOWN';
      logsByLevel[level] = (logsByLevel[level] || 0) + 1;
      logsByCategory[log.category] = (logsByCategory[log.category] || 0) + 1;
    });

    return {
      totalLogs: logs.length,
      logsByLevel,
      logsByCategory,
      queuedForRemote: this.remoteLogQueue.length,
      activeTimers: this.performanceTimers.size,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush of remote queue
    if (this.remoteLogQueue.length > 0) {
      this.flushRemoteQueue();
    }

    // Clear timers
    this.performanceTimers.clear();
  }
}

// Global logger instance
let globalLogger: ElectricLogger | null = null;

/**
 * Get the global ElectricSQL logger instance
 */
export function getElectricLogger(config?: Partial<LoggerConfig>): ElectricLogger {
  if (!globalLogger) {
    globalLogger = new ElectricLogger(config);
  }
  return globalLogger;
}

/**
 * Convenience logging functions using global logger
 */
export const logger = {
  debug: (message: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().debug(message, category, context),
  info: (message: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().info(message, category, context),
  warn: (message: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().warn(message, category, context),
  error: (message: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().error(message, category, context),
  fatal: (message: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().fatal(message, category, context),
    
  // Specialized logging methods
  logAuth: (message: string, context?: LogContext) =>
    getElectricLogger().logAuth(message, context),
  logSync: (message: string, context?: LogContext) =>
    getElectricLogger().logSync(message, context),
  logShape: (message: string, context?: LogContext) =>
    getElectricLogger().logShape(message, context),
  logConnection: (message: string, context?: LogContext) =>
    getElectricLogger().logConnection(message, context),
  logDatabase: (message: string, context?: LogContext) =>
    getElectricLogger().logDatabase(message, context),
  logUserAction: (message: string, context?: LogContext) =>
    getElectricLogger().logUserAction(message, context),
  logError: (error: Error | string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().logError(error, category, context),
    
  // Performance timing
  startTimer: (operation: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().startTimer(operation, category, context),
  endTimer: (timerId: string, context?: LogContext) =>
    getElectricLogger().endTimer(timerId, context),
  timeFunction: <T>(fn: () => Promise<T> | T, operation: string, category?: LogCategory, context?: LogContext) =>
    getElectricLogger().timeFunction(fn, operation, category, context),
    
  // Context management
  setGlobalContext: (context: Partial<LogContext>) =>
    getElectricLogger().setGlobalContext(context),
  updateGlobalContext: (updates: Partial<LogContext>) =>
    getElectricLogger().updateGlobalContext(updates),
  clearGlobalContext: () =>
    getElectricLogger().clearGlobalContext(),
};