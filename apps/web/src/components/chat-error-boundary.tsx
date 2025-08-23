'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangleIcon, RefreshCwIcon, HomeIcon, BugIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Error boundary state interface
 */
interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
  retryCount: number;
}

/**
 * Props for the ChatErrorBoundary component
 */
interface ChatErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Custom fallback component to render on error */
  fallback?: (error: Error, errorInfo: React.ErrorInfo, retry: () => void) => ReactNode;
  /** Callback called when an error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Maximum number of retry attempts before showing permanent error */
  maxRetries?: number;
  /** Whether to show technical error details */
  showErrorDetails?: boolean;
  /** Custom error messages for specific error types */
  errorMessages?: Record<string, string>;
  /** Whether to automatically retry certain errors */
  autoRetry?: boolean;
  /** Auto retry delay in milliseconds */
  autoRetryDelay?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Comprehensive Error Boundary for Chat Interface
 * 
 * This error boundary provides robust error handling for the chat interface with:
 * - Automatic error recovery and retry mechanisms
 * - User-friendly error messages and recovery options
 * - Technical error reporting for debugging
 * - Graceful degradation when errors occur
 * - Comprehensive error classification and handling
 * - Integration with application logging and monitoring
 * 
 * Features:
 * - Catches JavaScript errors anywhere in the chat component tree
 * - Provides contextual error messages based on error type
 * - Automatic retry for transient errors (network, timeout, etc.)
 * - Manual retry functionality with exponential backoff
 * - Error reporting and telemetry integration
 * - Fallback UI that maintains basic functionality
 * - Recovery options including page refresh and navigation
 * - Development mode enhanced error details
 * 
 * Error Categories:
 * - Network errors (connection, timeout, API failures)
 * - Database errors (SQLite, sync, data corruption)
 * - Streaming errors (AI API, WebSocket, parsing)
 * - Component errors (React rendering, prop validation)
 * - Authentication errors (session, permissions)
 * - Unknown errors (unexpected failures)
 */
export class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
    };
  }

  /**
   * Static method to derive state from error
   */
  static getDerivedStateFromError(error: Error): Partial<ChatErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /**
   * Component did catch - handle the error
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log the error for debugging
    console.error('ChatErrorBoundary caught an error:', error, errorInfo);

    // Report error to monitoring service (if configured)
    this.reportError(error, errorInfo);

    // Auto retry for certain errors
    if (this.props.autoRetry && this.shouldAutoRetry(error)) {
      this.scheduleAutoRetry();
    }
  }

  /**
   * Determine if an error should be automatically retried
   */
  private shouldAutoRetry(error: Error): boolean {
    const { retryCount } = this.state;
    const maxRetries = this.props.maxRetries ?? 3;

    if (retryCount >= maxRetries) {
      return false;
    }

    // Auto retry for these error types
    const autoRetryableErrors = [
      'NetworkError',
      'TimeoutError',
      'FetchError',
      'ChunkLoadError',
      'ConnectionError',
    ];

    return autoRetryableErrors.some(errorType => 
      error.name.includes(errorType) || 
      error.message.includes(errorType) ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout')
    );
  }

  /**
   * Schedule an automatic retry with exponential backoff
   */
  private scheduleAutoRetry(): void {
    const delay = this.props.autoRetryDelay ?? 1000;
    const backoffDelay = delay * Math.pow(2, this.state.retryCount);

    this.retryTimeout = setTimeout(() => {
      this.handleRetry();
    }, backoffDelay);
  }

  /**
   * Report error to monitoring/logging service
   */
  private reportError(error: Error, errorInfo: React.ErrorInfo): void {
    // In production, you would send this to your error reporting service
    const errorReport = {
      errorId: this.state.errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.getUserId(),
      retryCount: this.state.retryCount,
    };

    // Example: Send to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport),
      // }).catch(console.error);
    }

    console.error('Error report:', errorReport);
  }

  /**
   * Get current user ID for error reporting
   */
  private getUserId(): string | null {
    // This would integrate with your auth system
    try {
      // Example: return localStorage.getItem('userId');
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Classify the error type for user-friendly messaging
   */
  private classifyError(error: Error): {
    type: 'network' | 'database' | 'streaming' | 'component' | 'auth' | 'unknown';
    severity: 'low' | 'medium' | 'high' | 'critical';
    recoverable: boolean;
  } {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      name.includes('networkerror')
    ) {
      return { type: 'network', severity: 'medium', recoverable: true };
    }

    // Database errors
    if (
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('worker') ||
      message.includes('sync')
    ) {
      return { type: 'database', severity: 'high', recoverable: true };
    }

    // Streaming errors
    if (
      message.includes('stream') ||
      message.includes('ai') ||
      message.includes('chat') ||
      message.includes('generation')
    ) {
      return { type: 'streaming', severity: 'medium', recoverable: true };
    }

    // Authentication errors
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('permission') ||
      message.includes('token')
    ) {
      return { type: 'auth', severity: 'high', recoverable: false };
    }

    // Component errors
    if (
      message.includes('react') ||
      message.includes('component') ||
      message.includes('render') ||
      name.includes('syntaxerror')
    ) {
      return { type: 'component', severity: 'critical', recoverable: false };
    }

    // Unknown errors
    return { type: 'unknown', severity: 'medium', recoverable: true };
  }

  /**
   * Get user-friendly error message based on error type
   */
  private getErrorMessage(error: Error): string {
    const classification = this.classifyError(error);
    const customMessages = this.props.errorMessages ?? {};

    // Check for custom message first
    if (customMessages[error.name] || customMessages[classification.type]) {
      return customMessages[error.name] || customMessages[classification.type];
    }

    // Default messages based on error type
    switch (classification.type) {
      case 'network':
        return 'Unable to connect to the chat service. Please check your internet connection and try again.';
      case 'database':
        return 'There was an issue with the local database. Your messages are safe, but some features may be temporarily unavailable.';
      case 'streaming':
        return 'There was an issue with the AI response. You can try resending your message.';
      case 'auth':
        return 'Your session has expired. Please refresh the page and sign in again.';
      case 'component':
        return 'A technical error occurred in the chat interface. Please refresh the page to continue.';
      default:
        return 'An unexpected error occurred. Please try again or refresh the page.';
    }
  }

  /**
   * Handle retry action
   */
  private handleRetry = (): void => {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  /**
   * Handle page refresh
   */
  private handleRefresh = (): void => {
    window.location.reload();
  };

  /**
   * Handle navigation to home
   */
  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  /**
   * Handle sending error feedback
   */
  private handleSendFeedback = (): void => {
    const { error, errorInfo, errorId } = this.state;
    
    if (!error || !errorInfo) return;

    // Open email client with error details
    const subject = encodeURIComponent(`Chat Error Report - ${errorId}`);
    const body = encodeURIComponent(`
Error ID: ${errorId}
Error Message: ${error.message}
Timestamp: ${new Date().toISOString()}

Please describe what you were doing when this error occurred:

---
Technical Details:
${error.stack}

Component Stack:
${errorInfo.componentStack}
    `);

    window.open(`mailto:support@example.com?subject=${subject}&body=${body}`);
  };

  /**
   * Component will unmount cleanup
   */
  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    const { hasError, error, errorInfo, retryCount } = this.state;
    const { 
      children, 
      fallback, 
      maxRetries = 3, 
      showErrorDetails = process.env.NODE_ENV === 'development',
      className 
    } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback(error, errorInfo!, this.handleRetry);
      }

      const classification = this.classifyError(error);
      const errorMessage = this.getErrorMessage(error);
      const canRetry = classification.recoverable && retryCount < maxRetries;

      return (
        <div className={cn(
          'flex h-full w-full items-center justify-center p-6',
          'bg-background text-foreground',
          className
        )}>
          <div className="max-w-md space-y-4">
            {/* Main Error Alert */}
            <Alert variant={classification.severity === 'critical' ? 'destructive' : 'default'}>
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertTitle className="text-base font-semibold">
                {classification.severity === 'critical' ? 'Critical Error' : 'Something went wrong'}
              </AlertTitle>
              <AlertDescription className="mt-2">
                {errorMessage}
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {canRetry && (
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCwIcon className="mr-2 h-4 w-4" />
                  Try Again
                  {retryCount > 0 && ` (${retryCount}/${maxRetries})`}
                </Button>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={this.handleRefresh} className="flex-1">
                  <RefreshCwIcon className="mr-2 h-4 w-4" />
                  Refresh Page
                </Button>
                <Button variant="outline" onClick={this.handleGoHome} className="flex-1">
                  <HomeIcon className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </div>

              <Button variant="ghost" onClick={this.handleSendFeedback} className="w-full">
                <BugIcon className="mr-2 h-4 w-4" />
                Report Issue
              </Button>
            </div>

            {/* Technical Details (Development Only) */}
            {showErrorDetails && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                  Technical Details
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  <div>
                    <strong>Error ID:</strong> {this.state.errorId}
                  </div>
                  <div>
                    <strong>Error Type:</strong> {classification.type} ({classification.severity})
                  </div>
                  <div>
                    <strong>Recoverable:</strong> {classification.recoverable ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Retry Count:</strong> {retryCount}/{maxRetries}
                  </div>
                  <div>
                    <strong>Message:</strong> {error.message}
                  </div>
                  {error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-all bg-muted p-2 rounded text-xs">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-all bg-muted p-2 rounded text-xs">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withChatErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ChatErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ChatErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ChatErrorBoundary>
  );

  WrappedComponent.displayName = `withChatErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for manual error reporting within components
 */
export function useErrorReporting() {
  const reportError = (error: Error, context?: Record<string, any>) => {
    console.error('Manual error report:', error, context);
    
    // In production, send to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Implementation would go here
    }
  };

  return { reportError };
}