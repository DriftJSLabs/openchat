// Basic error monitoring and logging utilities
// In production, you'd want to integrate with services like Sentry, DataDog, etc.

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags?: Record<string, string>;
}

export interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
  timestamp: string;
}

class MonitoringService {
  private isDevelopment = process.env.NODE_ENV === 'development';

  logError(error: Error, context: Partial<ErrorContext> = {}): void {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...context,
      timestamp: new Date().toISOString(),
      severity: context.severity || 'medium'
    };

    // In development, log to console
    if (this.isDevelopment) {
      console.error('🚨 Error logged:', errorData);
    } else {
      // In production, you'd send to monitoring service
      console.error('Error:', JSON.stringify(errorData));
      // Example: send to Sentry, DataDog, etc.
      // await this.sendToMonitoringService(errorData);
    }
  }

  logEvent(event: LogEvent): void {
    const eventData = {
      ...event,
      timestamp: new Date().toISOString()
    };

    if (this.isDevelopment) {
      const emoji = {
        debug: '🐛',
        info: '💡',
        warn: '⚠️',
        error: '🚨'
      };
      
      console.log(`${emoji[event.level]} ${event.message}`, event.context || '');
    } else {
      // In production, send to logging service
      console.log(JSON.stringify(eventData));
    }
  }

  // Performance monitoring
  measurePerformance<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = Date.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.then((value) => {
          const duration = Date.now() - start;
          this.logEvent({
            level: 'info',
            message: `Performance: ${name}`,
            context: { duration_ms: duration }
          });
          return value;
        }).catch((error) => {
          const duration = Date.now() - start;
          this.logError(error, {
            severity: 'medium',
            tags: { operation: name, duration_ms: duration.toString() }
          });
          throw error;
        });
      } else {
        const duration = Date.now() - start;
        this.logEvent({
          level: 'info',
          message: `Performance: ${name}`,
          context: { duration_ms: duration }
        });
        return result;
      }
    } catch (error) {
      const duration = Date.now() - start;
      if (error instanceof Error) {
        this.logError(error, {
          severity: 'medium',
          tags: { operation: name, duration_ms: duration.toString() }
        });
      }
      throw error;
    }
  }

  // Security event logging
  logSecurityEvent(event: string, details: Record<string, any>): void {
    this.logEvent({
      level: 'warn',
      message: `Security: ${event}`,
      context: {
        ...details,
        security_event: true
      }
    });
  }

  // Rate limit violations
  logRateLimitViolation(clientId: string, endpoint: string): void {
    this.logSecurityEvent('Rate limit exceeded', {
      client_id: clientId,
      endpoint: endpoint,
      severity: 'medium'
    });
  }

  // Validation failures
  logValidationFailure(endpoint: string, error: string, input?: any): void {
    this.logEvent({
      level: 'warn',
      message: `Validation failed: ${error}`,
      context: {
        endpoint,
        input_keys: input ? Object.keys(input) : undefined,
        // Don't log sensitive input data
      }
    });
  }
}

export const monitoring = new MonitoringService();

// Helper function to safely serialize errors
export function serializeError(error: unknown): Record<string, any> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  
  return {
    message: String(error),
    type: typeof error,
  };
}

// Request context helper
export function getRequestContext(req: Request): Partial<ErrorContext> {
  const url = req.url;
  const userAgent = req.headers.get('user-agent') || undefined;
  
  return {
    url,
    userAgent,
    timestamp: new Date().toISOString(),
  };
}