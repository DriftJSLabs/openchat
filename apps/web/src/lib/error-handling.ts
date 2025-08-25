/**
 * Comprehensive error handling and loading state management for TanStack DB operations
 * Provides centralized error handling, recovery strategies, and user-friendly error messages
 * for all chat database operations in OpenChat.
 */

'use client';

import { toast } from 'sonner';
import { 
  EntityType, 
  SyncOperation, 
  SyncStatus, 
  DatabaseConnectionStatus 
} from '@/lib/tanstack-db';

import type {
  DatabaseError,
  ErrorRecoveryOptions,
  GlobalSyncState,
  EntitySyncState
} from '@/lib/types/tanstack-db.types';

/**
 * Error severity levels for categorization and handling
 */
export enum ErrorSeverity {
  LOW = 'low',           // Non-critical errors that don't affect core functionality
  MEDIUM = 'medium',     // Errors that affect some functionality but have workarounds
  HIGH = 'high',         // Critical errors that significantly impact user experience
  CRITICAL = 'critical'  // System-breaking errors that require immediate attention
}

/**
 * Error context for providing additional debugging information
 */
export interface ErrorContext {
  /** User ID when error occurred */
  userId?: string;
  /** Entity information related to the error */
  entityInfo?: {
    entityType: EntityType;
    entityId?: string;
  };
  /** Operation being performed when error occurred */
  operation?: SyncOperation;
  /** Browser/environment information */
  environment?: {
    userAgent: string;
    timestamp: Date;
    url: string;
    online: boolean;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Enhanced database error with recovery options
 */
export class EnhancedDatabaseError extends Error implements DatabaseError {
  public readonly timestamp: Date;
  public readonly severity: ErrorSeverity;
  
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: DatabaseError['category'],
    public readonly entityInfo?: DatabaseError['entityInfo'],
    public readonly retryable: boolean = false,
    public readonly retryDelay?: number,
    public readonly context?: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ) {
    super(message);
    this.name = 'EnhancedDatabaseError';
    this.timestamp = new Date();
    this.severity = severity;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedDatabaseError);
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.category) {
      case 'network':
        if (!navigator.onLine) {
          return 'You appear to be offline. Your changes will be saved and synced when you reconnect.';
        }
        return 'Connection issue detected. We\'ll try again automatically.';
        
      case 'validation':
        return 'Please check your input and try again.';
        
      case 'conflict':
        return 'This item was updated elsewhere. Please refresh and try again.';
        
      case 'permission':
        return 'You don\'t have permission to perform this action.';
        
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  /**
   * Get suggested recovery action
   */
  getRecoveryAction(): string | null {
    switch (this.category) {
      case 'network':
        return 'Check your internet connection';
        
      case 'validation':
        return 'Review your input for errors';
        
      case 'conflict':
        return 'Refresh the page and try again';
        
      case 'permission':
        return 'Contact your administrator';
        
      default:
        return null;
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      retryDelay: this.retryDelay,
      entityInfo: this.entityInfo,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Loading state manager for tracking operation states
 */
export class LoadingStateManager {
  private loadingStates = new Map<string, {
    isLoading: boolean;
    operation: string;
    startTime: Date;
    entityInfo?: {
      entityType: EntityType;
      entityId?: string;
    };
  }>();
  
  private listeners = new Set<(states: Map<string, any>) => void>();

  /**
   * Start loading state for an operation
   */
  startLoading(
    operationId: string, 
    operation: string, 
    entityInfo?: { entityType: EntityType; entityId?: string }
  ): void {
    this.loadingStates.set(operationId, {
      isLoading: true,
      operation,
      startTime: new Date(),
      entityInfo,
    });
    
    this.notifyListeners();
  }

  /**
   * Stop loading state for an operation
   */
  stopLoading(operationId: string): void {
    this.loadingStates.delete(operationId);
    this.notifyListeners();
  }

  /**
   * Check if operation is loading
   */
  isLoading(operationId: string): boolean {
    return this.loadingStates.has(operationId);
  }

  /**
   * Get all loading operations
   */
  getLoadingOperations(): Array<{
    id: string;
    operation: string;
    duration: number;
    entityInfo?: { entityType: EntityType; entityId?: string };
  }> {
    const now = new Date();
    return Array.from(this.loadingStates.entries()).map(([id, state]) => ({
      id,
      operation: state.operation,
      duration: now.getTime() - state.startTime.getTime(),
      entityInfo: state.entityInfo,
    }));
  }

  /**
   * Subscribe to loading state changes
   */
  subscribe(listener: (states: Map<string, any>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all loading states
   */
  clearAll(): void {
    this.loadingStates.clear();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(new Map(this.loadingStates)));
  }
}

/**
 * Error recovery manager with automatic retry logic
 */
export class ErrorRecoveryManager {
  private retryAttempts = new Map<string, number>();
  private backoffDelays = new Map<string, number>();

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery<T>(
    operation: () => Promise<T>,
    options: ErrorRecoveryOptions & {
      operationId: string;
      onRetry?: (attempt: number) => void;
      onMaxRetriesReached?: (error: Error) => void;
    }
  ): Promise<T> {
    const { 
      operationId, 
      maxRetries = 3, 
      baseRetryDelay = 1000, 
      autoRetry = true,
      onRetry,
      onMaxRetriesReached 
    } = options;

    const currentAttempts = this.retryAttempts.get(operationId) || 0;

    try {
      const result = await operation();
      
      // Reset retry count on success
      this.retryAttempts.delete(operationId);
      this.backoffDelays.delete(operationId);
      
      return result;
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, operationId);
      
      if (!autoRetry || !enhancedError.retryable || currentAttempts >= maxRetries) {
        if (onMaxRetriesReached && currentAttempts >= maxRetries) {
          onMaxRetriesReached(enhancedError);
        }
        throw enhancedError;
      }

      // Increment retry count
      const newAttempts = currentAttempts + 1;
      this.retryAttempts.set(operationId, newAttempts);
      
      // Calculate backoff delay with jitter
      const currentBackoff = this.backoffDelays.get(operationId) || baseRetryDelay;
      const nextBackoff = Math.min(currentBackoff * 2, 30000); // Cap at 30 seconds
      const jitter = Math.random() * 0.1 * nextBackoff;
      const delay = enhancedError.retryDelay || (nextBackoff + jitter);
      
      this.backoffDelays.set(operationId, nextBackoff);
      
      if (onRetry) {
        onRetry(newAttempts);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Recursive retry
      return this.attemptRecovery(operation, options);
    }
  }

  /**
   * Clear retry state for an operation
   */
  clearRetryState(operationId: string): void {
    this.retryAttempts.delete(operationId);
    this.backoffDelays.delete(operationId);
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): {
    activeOperations: number;
    totalRetries: number;
    averageRetries: number;
  } {
    const attempts = Array.from(this.retryAttempts.values());
    const totalRetries = attempts.reduce((sum, count) => sum + count, 0);
    
    return {
      activeOperations: attempts.length,
      totalRetries,
      averageRetries: attempts.length > 0 ? totalRetries / attempts.length : 0,
    };
  }

  private enhanceError(error: Error, operationId: string): EnhancedDatabaseError {
    if (error instanceof EnhancedDatabaseError) {
      return error;
    }

    // Determine error category and properties based on error message/type
    let category: DatabaseError['category'] = 'unknown';
    let retryable = false;
    let severity = ErrorSeverity.MEDIUM;

    if (error.message.includes('network') || error.message.includes('fetch')) {
      category = 'network';
      retryable = true;
      severity = ErrorSeverity.LOW;
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      category = 'validation';
      severity = ErrorSeverity.MEDIUM;
    } else if (error.message.includes('conflict') || error.message.includes('concurrent')) {
      category = 'conflict';
      retryable = true;
      severity = ErrorSeverity.HIGH;
    } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      category = 'permission';
      severity = ErrorSeverity.HIGH;
    }

    return new EnhancedDatabaseError(
      error.message,
      'ENHANCED_ERROR',
      category,
      undefined,
      retryable,
      undefined,
      {
        environment: {
          userAgent: navigator.userAgent,
          timestamp: new Date(),
          url: window.location.href,
          online: navigator.onLine,
        },
        metadata: { operationId },
      },
      severity
    );
  }
}

/**
 * User notification manager for error and status messages
 */
export class NotificationManager {
  private notificationQueue = new Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration?: number;
    action?: {
      label: string;
      handler: () => void;
    };
  }>();

  /**
   * Show error notification
   */
  showError(
    error: EnhancedDatabaseError,
    options: {
      showToast?: boolean;
      persistent?: boolean;
      action?: { label: string; handler: () => void };
    } = {}
  ): void {
    const { showToast = true, persistent = false, action } = options;
    
    const notification = {
      id: `error-${Date.now()}`,
      type: 'error' as const,
      title: this.getErrorTitle(error),
      message: error.getUserMessage(),
      duration: persistent ? Infinity : this.getNotificationDuration(error.severity),
      action: action || (error.getRecoveryAction() ? {
        label: error.getRecoveryAction()!,
        handler: () => console.log('Recovery action triggered'),
      } : undefined),
    };

    if (showToast) {
      this.showToast(notification);
    }

    this.notificationQueue.push(notification);
  }

  /**
   * Show success notification
   */
  showSuccess(
    message: string,
    options: {
      title?: string;
      duration?: number;
      showToast?: boolean;
    } = {}
  ): void {
    const { title = 'Success', duration = 3000, showToast = true } = options;
    
    const notification = {
      id: `success-${Date.now()}`,
      type: 'success' as const,
      title,
      message,
      duration,
    };

    if (showToast) {
      this.showToast(notification);
    }

    this.notificationQueue.push(notification);
  }

  /**
   * Show loading notification
   */
  showLoading(
    message: string,
    operationId: string,
    options: {
      title?: string;
      showToast?: boolean;
    } = {}
  ): string {
    const { title = 'Loading...', showToast = true } = options;
    
    const notification = {
      id: operationId,
      type: 'info' as const,
      title,
      message,
      duration: Infinity, // Persist until dismissed
    };

    if (showToast) {
      toast.loading(message, { id: operationId });
    }

    this.notificationQueue.push(notification);
    return notification.id;
  }

  /**
   * Dismiss loading notification
   */
  dismissLoading(operationId: string, successMessage?: string): void {
    const index = this.notificationQueue.findIndex(n => n.id === operationId);
    if (index >= 0) {
      this.notificationQueue.splice(index, 1);
    }

    if (successMessage) {
      toast.success(successMessage, { id: operationId });
    } else {
      toast.dismiss(operationId);
    }
  }

  /**
   * Show sync status notification
   */
  showSyncStatus(state: GlobalSyncState): void {
    const { status, isOffline, pendingOperations, error } = state;
    
    if (isOffline) {
      toast.warning('You are offline. Changes will sync when you reconnect.', {
        id: 'offline-status',
        duration: 5000,
      });
      return;
    }

    switch (status) {
      case SyncStatus.SYNCING:
        if (pendingOperations > 0) {
          toast.loading(`Syncing ${pendingOperations} changes...`, {
            id: 'sync-status',
          });
        }
        break;
        
      case SyncStatus.SUCCESS:
        toast.dismiss('sync-status');
        if (pendingOperations === 0) {
          toast.success('All changes synced', {
            id: 'sync-complete',
            duration: 2000,
          });
        }
        break;
        
      case SyncStatus.ERROR:
        if (error) {
          toast.error(`Sync failed: ${error}`, {
            id: 'sync-error',
            duration: 5000,
            action: {
              label: 'Retry',
              onClick: () => {
                // Trigger retry logic
                console.log('Retry sync triggered');
              },
            },
          });
        }
        break;
    }
  }

  private showToast(notification: typeof this.notificationQueue[0]): void {
    const { type, title, message, duration, action } = notification;
    
    const toastOptions = {
      id: notification.id,
      duration: duration === Infinity ? undefined : duration,
      action: action ? {
        label: action.label,
        onClick: action.handler,
      } : undefined,
    };

    switch (type) {
      case 'success':
        toast.success(message, toastOptions);
        break;
        
      case 'error':
        toast.error(message, toastOptions);
        break;
        
      case 'warning':
        toast.warning(message, toastOptions);
        break;
        
      case 'info':
        toast.info(message, toastOptions);
        break;
    }
  }

  private getErrorTitle(error: EnhancedDatabaseError): string {
    switch (error.category) {
      case 'network':
        return 'Connection Issue';
      case 'validation':
        return 'Input Error';
      case 'conflict':
        return 'Conflict Detected';
      case 'permission':
        return 'Access Denied';
      default:
        return 'Error Occurred';
    }
  }

  private getNotificationDuration(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 3000;
      case ErrorSeverity.MEDIUM:
        return 5000;
      case ErrorSeverity.HIGH:
        return 8000;
      case ErrorSeverity.CRITICAL:
        return Infinity;
      default:
        return 5000;
    }
  }
}

/**
 * Main error handler that coordinates all error handling functionality
 */
export class ErrorHandler {
  private loadingStateManager = new LoadingStateManager();
  private errorRecoveryManager = new ErrorRecoveryManager();
  private notificationManager = new NotificationManager();

  /**
   * Handle an error with full recovery and notification support
   */
  async handleError<T>(
    error: Error,
    options: {
      operationId: string;
      operation: string;
      entityInfo?: { entityType: EntityType; entityId?: string };
      recovery?: ErrorRecoveryOptions;
      retryOperation?: () => Promise<T>;
      showNotification?: boolean;
      context?: Partial<ErrorContext>;
    }
  ): Promise<T | null> {
    const { 
      operationId, 
      operation, 
      entityInfo, 
      recovery, 
      retryOperation, 
      showNotification = true,
      context 
    } = options;

    // Stop loading state
    this.loadingStateManager.stopLoading(operationId);

    // Enhance error with context
    const enhancedError = new EnhancedDatabaseError(
      error.message,
      'OPERATION_ERROR',
      this.categorizeError(error),
      entityInfo,
      !!retryOperation,
      undefined,
      {
        ...context,
        operation: SyncOperation.CREATE, // Default, should be provided
        environment: {
          userAgent: navigator.userAgent,
          timestamp: new Date(),
          url: typeof window !== 'undefined' ? window.location.href : '',
          online: navigator.onLine,
        },
        metadata: { operationId, operation },
      }
    );

    // Show notification
    if (showNotification) {
      this.notificationManager.showError(enhancedError, {
        action: retryOperation ? {
          label: 'Retry',
          handler: () => {
            if (retryOperation) {
              this.executeWithErrorHandling(
                retryOperation,
                { operationId, operation, entityInfo }
              );
            }
          },
        } : undefined,
      });
    }

    // Attempt recovery if configured
    if (recovery && retryOperation) {
      try {
        return await this.errorRecoveryManager.attemptRecovery(
          retryOperation,
          { ...recovery, operationId }
        );
      } catch (recoveryError) {
        console.error('Error recovery failed:', recoveryError);
      }
    }

    // Log error for debugging
    this.logError(enhancedError);

    return null;
  }

  /**
   * Execute an operation with comprehensive error handling
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    options: {
      operationId: string;
      operation: string;
      entityInfo?: { entityType: EntityType; entityId?: string };
      showLoading?: boolean;
      loadingMessage?: string;
      successMessage?: string;
      recovery?: ErrorRecoveryOptions;
    }
  ): Promise<T | null> {
    const { 
      operationId, 
      operation: operationName, 
      entityInfo, 
      showLoading = true,
      loadingMessage,
      successMessage,
      recovery 
    } = options;

    try {
      // Start loading state
      if (showLoading) {
        this.loadingStateManager.startLoading(operationId, operationName, entityInfo);
        
        if (loadingMessage) {
          this.notificationManager.showLoading(loadingMessage, operationId);
        }
      }

      // Execute operation
      const result = await operation();

      // Stop loading and show success
      this.loadingStateManager.stopLoading(operationId);
      
      if (loadingMessage) {
        this.notificationManager.dismissLoading(operationId, successMessage);
      } else if (successMessage) {
        this.notificationManager.showSuccess(successMessage);
      }

      return result;
    } catch (error) {
      return this.handleError(error as Error, {
        operationId,
        operation: operationName,
        entityInfo,
        recovery,
        retryOperation: operation,
      });
    }
  }

  /**
   * Get loading state manager
   */
  getLoadingStateManager(): LoadingStateManager {
    return this.loadingStateManager;
  }

  /**
   * Get notification manager
   */
  getNotificationManager(): NotificationManager {
    return this.notificationManager;
  }

  /**
   * Get error recovery manager
   */
  getErrorRecoveryManager(): ErrorRecoveryManager {
    return this.errorRecoveryManager;
  }

  private categorizeError(error: Error): DatabaseError['category'] {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network';
    } else if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    } else if (message.includes('conflict') || message.includes('concurrent')) {
      return 'conflict';
    } else if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'permission';
    }
    
    return 'unknown';
  }

  private logError(error: EnhancedDatabaseError): void {
    const errorData = error.toJSON();
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Database Error:', errorData);
    }

    // In production, you might want to send to an error tracking service
    // like Sentry, LogRocket, or a custom logging endpoint
    if (process.env.NODE_ENV === 'production') {
      // Example: sendErrorToService(errorData);
      console.warn('Error logged (production mode)');
    }
  }
}

/**
 * Global error handler instance
 */
export const errorHandler = new ErrorHandler();