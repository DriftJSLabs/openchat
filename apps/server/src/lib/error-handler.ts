import { ORPCError } from "@orpc/server";
import type { Context } from "./context";

/**
 * Error categories for proper classification and handling
 */
export enum ErrorCategory {
  VALIDATION = "VALIDATION",
  AUTHENTICATION = "AUTHENTICATION", 
  AUTHORIZATION = "AUTHORIZATION",
  RATE_LIMIT = "RATE_LIMIT",
  AI_SERVICE = "AI_SERVICE",
  DATABASE = "DATABASE",
  NETWORK = "NETWORK",
  BUSINESS_LOGIC = "BUSINESS_LOGIC",
  SYSTEM = "SYSTEM",
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE"
}

/**
 * Error severity levels for monitoring and alerting
 */
export enum ErrorSeverity {
  LOW = "LOW",       // Minor issues, user can continue
  MEDIUM = "MEDIUM", // Important issues, may affect functionality
  HIGH = "HIGH",     // Critical issues, affects core functionality
  CRITICAL = "CRITICAL" // System-level issues, requires immediate attention
}

/**
 * Structured error information for comprehensive logging and monitoring
 */
export interface ErrorInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  details?: Record<string, any>;
  userId?: string;
  correlationId?: string;
  timestamp: string;
  context?: {
    endpoint?: string;
    userAgent?: string;
    ip?: string;
    sessionId?: string;
  };
  stack?: string;
  retryable?: boolean;
  userMessage?: string; // User-friendly message to display
}

/**
 * Enhanced error class with comprehensive metadata
 */
export class EnhancedError extends Error {
  public readonly errorInfo: ErrorInfo;

  constructor(
    category: ErrorCategory,
    severity: ErrorSeverity,
    code: string,
    message: string,
    options: {
      details?: Record<string, any>;
      userId?: string;
      correlationId?: string;
      context?: ErrorInfo['context'];
      cause?: Error;
      retryable?: boolean;
      userMessage?: string;
    } = {}
  ) {
    super(message);
    this.name = 'EnhancedError';

    this.errorInfo = {
      category,
      severity,
      code,
      message,
      details: options.details,
      userId: options.userId,
      correlationId: options.correlationId || generateCorrelationId(),
      timestamp: new Date().toISOString(),
      context: options.context,
      stack: this.stack,
      retryable: options.retryable || false,
      userMessage: options.userMessage || this.generateUserMessage(category, severity),
    };

    if (options.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Generate user-friendly messages based on error category and severity
   */
  private generateUserMessage(category: ErrorCategory, severity: ErrorSeverity): string {
    const baseMessages = {
      [ErrorCategory.VALIDATION]: "Please check your input and try again.",
      [ErrorCategory.AUTHENTICATION]: "Please sign in to continue.",
      [ErrorCategory.AUTHORIZATION]: "You don't have permission to perform this action.",
      [ErrorCategory.RATE_LIMIT]: "Too many requests. Please wait a moment and try again.",
      [ErrorCategory.AI_SERVICE]: "AI service is temporarily unavailable. Please try again later.",
      [ErrorCategory.DATABASE]: "We're experiencing technical difficulties. Please try again later.",
      [ErrorCategory.NETWORK]: "Connection issue. Please check your internet and try again.",
      [ErrorCategory.BUSINESS_LOGIC]: "Unable to complete this action. Please contact support if the issue persists.",
      [ErrorCategory.SYSTEM]: "System error occurred. Our team has been notified.",
      [ErrorCategory.EXTERNAL_SERVICE]: "External service is temporarily unavailable. Please try again later.",
    };

    if (severity === ErrorSeverity.CRITICAL) {
      return "System maintenance in progress. Please try again in a few minutes.";
    }

    return baseMessages[category] || "An unexpected error occurred. Please try again.";
  }

  /**
   * Convert to oRPC error with appropriate status code
   */
  toORPCError(): ORPCError<any, any> {
    const statusMap = {
      [ErrorCategory.VALIDATION]: "BAD_REQUEST",
      [ErrorCategory.AUTHENTICATION]: "UNAUTHORIZED",
      [ErrorCategory.AUTHORIZATION]: "FORBIDDEN",
      [ErrorCategory.RATE_LIMIT]: "TOO_MANY_REQUESTS",
      [ErrorCategory.AI_SERVICE]: "SERVICE_UNAVAILABLE",
      [ErrorCategory.DATABASE]: "INTERNAL_SERVER_ERROR",
      [ErrorCategory.NETWORK]: "SERVICE_UNAVAILABLE",
      [ErrorCategory.BUSINESS_LOGIC]: "BAD_REQUEST",
      [ErrorCategory.SYSTEM]: "INTERNAL_SERVER_ERROR",
      [ErrorCategory.EXTERNAL_SERVICE]: "SERVICE_UNAVAILABLE",
    } as const;

    const status = statusMap[this.errorInfo.category];
    const error = new ORPCError(status as any, this.errorInfo.userMessage || this.message);
    
    // Attach error metadata for potential use in error handlers
    (error as any).errorInfo = this.errorInfo;
    
    return error;
  }
}

/**
 * Generate unique correlation ID for error tracking
 */
function generateCorrelationId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Error factory functions for common error scenarios
 */
export const ErrorFactory = {
  // Validation errors
  invalidInput: (message: string, details?: Record<string, any>, context?: Context) =>
    new EnhancedError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW,
      "INVALID_INPUT",
      message,
      {
        details,
        userId: context?.session?.user?.id,
        context: {
          userAgent: context?.userAgent,
          ip: context?.ip,
        }
      }
    ),

  missingRequiredField: (field: string, context?: Context) =>
    new EnhancedError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW,
      "MISSING_REQUIRED_FIELD",
      `Required field '${field}' is missing`,
      {
        details: { field },
        userId: context?.session?.user?.id,
        userMessage: `Please provide a value for ${field}.`,
      }
    ),

  // Authentication/Authorization errors
  unauthorized: (context?: Context) =>
    new EnhancedError(
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.MEDIUM,
      "UNAUTHORIZED",
      "Authentication required",
      {
        userId: context?.session?.user?.id,
        context: {
          userAgent: context?.userAgent,
          ip: context?.ip,
        }
      }
    ),

  forbidden: (resource: string, action: string, context?: Context) =>
    new EnhancedError(
      ErrorCategory.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      "FORBIDDEN",
      `Access denied to ${action} ${resource}`,
      {
        details: { resource, action },
        userId: context?.session?.user?.id,
        userMessage: "You don't have permission to perform this action.",
      }
    ),

  // Rate limiting errors
  rateLimitExceeded: (limit: number, window: number, context?: Context) =>
    new EnhancedError(
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      "RATE_LIMIT_EXCEEDED",
      `Rate limit exceeded: ${limit} requests per ${window}ms`,
      {
        details: { limit, window },
        userId: context?.session?.user?.id,
        retryable: true,
        userMessage: `Too many requests. Please wait ${Math.ceil(window / 1000)} seconds and try again.`,
      }
    ),

  // Resource errors
  resourceNotFound: (resource: string, id: string, context?: Context) =>
    new EnhancedError(
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.LOW,
      "RESOURCE_NOT_FOUND",
      `${resource} with ID '${id}' not found`,
      {
        details: { resource, id },
        userId: context?.session?.user?.id,
        userMessage: `The requested ${resource.toLowerCase()} could not be found.`,
      }
    ),

  resourceAlreadyExists: (resource: string, identifier: string, context?: Context) =>
    new EnhancedError(
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.LOW,
      "RESOURCE_ALREADY_EXISTS",
      `${resource} with identifier '${identifier}' already exists`,
      {
        details: { resource, identifier },
        userId: context?.session?.user?.id,
        userMessage: `A ${resource.toLowerCase()} with this identifier already exists.`,
      }
    ),

  // AI Service errors
  aiServiceUnavailable: (provider: string, model: string, context?: Context) =>
    new EnhancedError(
      ErrorCategory.AI_SERVICE,
      ErrorSeverity.HIGH,
      "AI_SERVICE_UNAVAILABLE",
      `AI service unavailable: ${provider}/${model}`,
      {
        details: { provider, model },
        userId: context?.session?.user?.id,
        retryable: true,
      }
    ),

  aiQuotaExceeded: (quotaType: string, limit: number, context?: Context) =>
    new EnhancedError(
      ErrorCategory.AI_SERVICE,
      ErrorSeverity.MEDIUM,
      "AI_QUOTA_EXCEEDED",
      `AI usage quota exceeded: ${quotaType} limit of ${limit}`,
      {
        details: { quotaType, limit },
        userId: context?.session?.user?.id,
        userMessage: `You've reached your ${quotaType} usage limit. Please try again later or upgrade your plan.`,
      }
    ),

  // Database errors
  databaseError: (operation: string, table: string, cause?: Error, context?: Context) =>
    new EnhancedError(
      ErrorCategory.DATABASE,
      ErrorSeverity.HIGH,
      "DATABASE_ERROR",
      `Database error during ${operation} on ${table}`,
      {
        details: { operation, table },
        userId: context?.session?.user?.id,
        cause,
        retryable: true,
      }
    ),

  // Network/External service errors
  externalServiceError: (service: string, operation: string, statusCode?: number, context?: Context) =>
    new EnhancedError(
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorSeverity.MEDIUM,
      "EXTERNAL_SERVICE_ERROR",
      `External service error: ${service} ${operation}`,
      {
        details: { service, operation, statusCode },
        userId: context?.session?.user?.id,
        retryable: statusCode ? statusCode >= 500 : true,
      }
    ),

  // System errors
  systemError: (component: string, message: string, cause?: Error, context?: Context) =>
    new EnhancedError(
      ErrorCategory.SYSTEM,
      ErrorSeverity.CRITICAL,
      "SYSTEM_ERROR",
      `System error in ${component}: ${message}`,
      {
        details: { component },
        userId: context?.session?.user?.id,
        cause,
      }
    ),
};

/**
 * Error logging utility with structured logging
 */
export class ErrorLogger {
  /**
   * Log error with appropriate level based on severity
   */
  static log(error: EnhancedError | Error): void {
    if (error instanceof EnhancedError) {
      const logData = {
        ...error.errorInfo,
        // Don't log sensitive stack traces in production
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      };

      switch (error.errorInfo.severity) {
        case ErrorSeverity.LOW:
          console.log('INFO:', JSON.stringify(logData, null, 2));
          break;
        case ErrorSeverity.MEDIUM:
          console.warn('WARN:', JSON.stringify(logData, null, 2));
          break;
        case ErrorSeverity.HIGH:
          console.error('ERROR:', JSON.stringify(logData, null, 2));
          break;
        case ErrorSeverity.CRITICAL:
          console.error('CRITICAL:', JSON.stringify(logData, null, 2));
          // In production, this would trigger immediate alerts
          this.sendCriticalAlert(error);
          break;
      }
    } else {
      // Fallback for regular errors
      console.error('UNHANDLED ERROR:', {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Send critical alerts (would integrate with monitoring service)
   */
  private static sendCriticalAlert(error: EnhancedError): void {
    // TODO: Integrate with monitoring service (e.g., Sentry, PagerDuty)
    // This is where you'd send immediate notifications for critical errors
    console.error('CRITICAL ALERT TRIGGERED:', {
      correlationId: error.errorInfo.correlationId,
      message: error.message,
      userId: error.errorInfo.userId,
      timestamp: error.errorInfo.timestamp,
    });
  }
}

/**
 * Global error handler middleware for oRPC
 */
export function createErrorHandler() {
  return async ({ context, next }: { context: Context; next: () => any }) => {
    try {
      return await next();
    } catch (err) {
      // Log the error
      ErrorLogger.log(err as Error);

      // Convert to appropriate oRPC error
      if (err instanceof EnhancedError) {
        throw err.toORPCError();
      }

      if (err instanceof ORPCError) {
        throw err;
      }

      // Fallback for unknown errors
      const enhancedError = ErrorFactory.systemError(
        'unknown',
        'An unexpected error occurred',
        err as Error,
        context
      );
      
      ErrorLogger.log(enhancedError);
      throw enhancedError.toORPCError();
    }
  };
}

/**
 * Utility function to safely handle async operations with error wrapping
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  errorFactory: (error: Error) => EnhancedError
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const enhancedError = errorFactory(error as Error);
    ErrorLogger.log(enhancedError);
    throw enhancedError;
  }
}

/**
 * Utility function to validate and parse JSON with enhanced error handling
 */
export function safeJsonParse<T>(
  json: string,
  context?: Context,
  fallback?: T
): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    
    throw ErrorFactory.invalidInput(
      'Invalid JSON format',
      { json: json.slice(0, 100) + (json.length > 100 ? '...' : '') },
      context
    );
  }
}

/**
 * Utility function for input validation with enhanced errors
 */
export function validateRequired<T>(
  value: T | null | undefined,
  fieldName: string,
  context?: Context
): T {
  if (value === null || value === undefined || value === '') {
    throw ErrorFactory.missingRequiredField(fieldName, context);
  }
  return value;
}