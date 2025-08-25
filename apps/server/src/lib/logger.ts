/**
 * Structured Logging System for OpenChat Server
 * 
 * This module provides a comprehensive logging system with structured output,
 * multiple transports, and integration with monitoring systems.
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface LogContext {
  requestId?: string;
  userId?: string;
  chatId?: string;
  messageId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  performance?: {
    duration: number;
    memory: NodeJS.MemoryUsage;
  };
  metadata?: Record<string, any>;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'pretty';
  outputs: Array<'console' | 'file' | 'remote'>;
  fileConfig?: {
    directory: string;
    maxFileSize: number;
    maxFiles: number;
    compress: boolean;
  };
  remoteConfig?: {
    endpoint: string;
    apiKey: string;
    batchSize: number;
    flushInterval: number;
  };
}

/**
 * Main logger class with structured logging capabilities
 */
class Logger {
  private config: LoggerConfig;
  private logStream?: NodeJS.WritableStream;
  private remoteBatch: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'pretty') || 'json',
      outputs: ['console'],
      fileConfig: {
        directory: process.env.LOG_DIRECTORY || './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        compress: true,
      },
      remoteConfig: {
        endpoint: process.env.LOG_ENDPOINT || '',
        apiKey: process.env.LOG_API_KEY || '',
        batchSize: 100,
        flushInterval: 5000, // 5 seconds
      },
      ...config,
    };

    this.initializeOutputs();
  }

  /**
   * Initialize logging outputs based on configuration
   */
  private initializeOutputs(): void {
    // Set up file logging if configured
    if (this.config.outputs.includes('file') && this.config.fileConfig) {
      this.setupFileLogging();
    }

    // Set up remote logging if configured
    if (this.config.outputs.includes('remote') && this.config.remoteConfig?.endpoint) {
      this.setupRemoteLogging();
    }
  }

  /**
   * Set up file logging with rotation
   */
  private setupFileLogging(): void {
    if (!this.config.fileConfig) return;

    const logDir = this.config.fileConfig.directory;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const logFile = join(logDir, `openchat-${new Date().toISOString().split('T')[0]}.log`);
    this.logStream = createWriteStream(logFile, { flags: 'a' });
  }

  /**
   * Set up remote logging with batching
   */
  private setupRemoteLogging(): void {
    if (!this.config.remoteConfig) return;

    // Set up periodic flushing
    this.flushTimer = setInterval(() => {
      this.flushRemoteLogs();
    }, this.config.remoteConfig.flushInterval);

    // Flush logs on process exit
    process.on('exit', () => this.flushRemoteLogs());
    process.on('SIGINT', () => this.flushRemoteLogs());
    process.on('SIGTERM', () => this.flushRemoteLogs());
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    };

    return levels[level] >= levels[this.config.level];
  }

  /**
   * Format log entry based on configuration
   */
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.format === 'pretty') {
      return this.formatPretty(entry);
    }
    return JSON.stringify(entry);
  }

  /**
   * Format log entry for pretty printing
   */
  private formatPretty(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const message = entry.message;
    
    let formatted = `${timestamp} [${level}] ${message}`;
    
    if (entry.context) {
      const contextStr = Object.entries(entry.context)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      formatted += ` | ${contextStr}`;
    }
    
    if (entry.error) {
      formatted += `
Error: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `
${entry.error.stack}`;
      }
    }
    
    if (entry.performance) {
      formatted += ` | duration=${entry.performance.duration}ms memory=${Math.round(entry.performance.memory.heapUsed / 1024 / 1024)}MB`;
    }
    
    return formatted;
  }

  /**
   * Write log entry to configured outputs
   */
  private writeLog(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);

    // Console output
    if (this.config.outputs.includes('console')) {
      const logMethod = entry.level === 'error' || entry.level === 'fatal' ? console.error : console.log;
      logMethod(formatted);
    }

    // File output
    if (this.config.outputs.includes('file') && this.logStream) {
      this.logStream.write(formatted + '\n');
    }

    // Remote output
    if (this.config.outputs.includes('remote')) {
      this.addToRemoteBatch(entry);
    }
  }

  /**
   * Add log entry to remote batch
   */
  private addToRemoteBatch(entry: LogEntry): void {
    this.remoteBatch.push(entry);

    if (this.remoteBatch.length >= (this.config.remoteConfig?.batchSize || 100)) {
      this.flushRemoteLogs();
    }
  }

  /**
   * Flush remote logs batch
   */
  private async flushRemoteLogs(): Promise<void> {
    if (this.remoteBatch.length === 0 || !this.config.remoteConfig?.endpoint) return;

    const batch = [...this.remoteBatch];
    this.remoteBatch = [];

    try {
      const response = await fetch(this.config.remoteConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.remoteConfig.apiKey}`,
        },
        body: JSON.stringify({ logs: batch }),
      });

      if (!response.ok) {
        console.error('Failed to send logs to remote endpoint:', response.status);
      }
    } catch (error) {
      console.error('Error sending logs to remote endpoint:', error);
      // Re-add logs to batch for retry
      this.remoteBatch.unshift(...batch);
    }
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
    metadata?: Record<string, any>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    if (metadata) {
      entry.metadata = metadata;
    }

    return entry;
  }

  /**
   * Debug logging
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('debug')) return;
    const entry = this.createLogEntry('debug', message, context, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Info logging
   */
  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('info')) return;
    const entry = this.createLogEntry('info', message, context, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('warn')) return;
    const entry = this.createLogEntry('warn', message, context, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Error logging
   */
  error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('error')) return;
    const entry = this.createLogEntry('error', message, context, error, metadata);
    this.writeLog(entry);
  }

  /**
   * Fatal logging
   */
  fatal(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void {
    if (!this.shouldLog('fatal')) return;
    const entry = this.createLogEntry('fatal', message, context, error, metadata);
    this.writeLog(entry);
  }

  /**
   * Performance logging with timing
   */
  performance(message: string, startTime: number, context?: LogContext): void {
    const duration = Date.now() - startTime;
    const memory = process.memoryUsage();
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context,
      performance: {
        duration,
        memory,
      },
    };

    this.writeLog(entry);
  }

  /**
   * HTTP request logging
   */
  request(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const message = `${method} ${url} ${statusCode}`;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        method,
        url,
        statusCode,
      },
      performance: {
        duration,
        memory: process.memoryUsage(),
      },
    };

    this.writeLog(entry);
  }

  /**
   * Chat-specific logging
   */
  chatActivity(
    action: string,
    chatId: string,
    userId: string,
    context?: LogContext
  ): void {
    this.info(`Chat ${action}`, {
      ...context,
      chatId,
      userId,
      action,
    });
  }

  /**
   * Authentication logging
   */
  auth(
    action: 'login' | 'logout' | 'register' | 'failed_login',
    userId?: string,
    context?: LogContext
  ): void {
    const level = action === 'failed_login' ? 'warn' : 'info';
    const message = `Authentication ${action}`;
    
    const entry = this.createLogEntry(level, message, {
      ...context,
      userId,
      action,
    });

    this.writeLog(entry);
  }

  /**
   * Database operation logging
   */
  database(operation: string, table: string, duration: number, context?: LogContext): void {
    this.info(`Database ${operation} on ${table}`, {
      ...context,
      operation,
      table,
      duration,
    });
  }

  /**
   * Create child logger with additional context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger(this.config);
    
    // Override write method to include default context
    const originalWriteLog = childLogger.writeLog.bind(childLogger);
    childLogger.writeLog = (entry: LogEntry) => {
      entry.context = { ...defaultContext, ...entry.context };
      originalWriteLog(entry);
    };

    return childLogger;
  }

  /**
   * Close all log streams and cleanup
   */
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushRemoteLogs();

    if (this.logStream) {
      this.logStream.end();
    }
  }
}

// Create and export default logger instance
export const logger = new Logger({
  outputs: process.env.NODE_ENV === 'development' 
    ? ['console'] 
    : ['console', 'file'],
});

// Export Logger class for custom instances
export { Logger, LogLevel, LogContext, LogEntry, LoggerConfig };