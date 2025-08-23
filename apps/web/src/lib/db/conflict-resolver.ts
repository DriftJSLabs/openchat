import type { Chat, Message } from './schema/shared';
import { OperationalTransform, CollaborativeEditResolver, type TransformableOperation } from './operational-transform';
import { getTransactionManager, type TransactionContext } from './transaction-manager';

export interface ConflictData<T> {
  localVersion: T;
  cloudVersion: T;
  lastSyncTimestamp: number;
  baseVersion?: T;
  localOperation?: TransformableOperation;
  cloudOperation?: TransformableOperation;
}

export interface ConflictResolution<T> {
  resolved: T;
  strategy: 'local' | 'cloud' | 'merge' | 'manual' | 'operational_transform';
  requiresManualReview?: boolean;
  operations?: any[];
  conflictType?: 'content' | 'deletion' | 'concurrent_edit' | 'format';
}

export type ConflictResolver<T> = (conflict: ConflictData<T>) => ConflictResolution<T>;

class ConflictResolverManager {
  private chatResolver: ConflictResolver<Chat>;
  private messageResolver: ConflictResolver<Message>;
  private transactionManager = getTransactionManager();
  
  // Race condition prevention: Track active resolutions
  private activeResolutions = new Map<string, Promise<ConflictResolution<any>>>();
  private resolutionLocks = new Map<string, { timestamp: number; entityId: string }>();
  private lockTimeout = 30000; // 30 second timeout for conflict resolution

  constructor() {
    this.chatResolver = this.createChatResolver();
    this.messageResolver = this.createMessageResolver();
    
    // Setup cleanup for stale locks
    this.setupLockCleanup();
  }

  private createChatResolver(): ConflictResolver<Chat> {
    return (conflict: ConflictData<Chat>): ConflictResolution<Chat> => {
      const { localVersion, cloudVersion, baseVersion, localOperation, cloudOperation } = conflict;

      // Handle deletion conflicts first
      if (localVersion.isDeleted && !cloudVersion.isDeleted) {
        return {
          resolved: cloudVersion,
          strategy: 'cloud',
          conflictType: 'deletion'
        };
      }
      
      if (!localVersion.isDeleted && cloudVersion.isDeleted) {
        return {
          resolved: localVersion,
          strategy: 'local',
          conflictType: 'deletion'
        };
      }

      if (localVersion.isDeleted && cloudVersion.isDeleted) {
        return {
          resolved: localVersion.updatedAt > cloudVersion.updatedAt ? localVersion : cloudVersion,
          strategy: localVersion.updatedAt > cloudVersion.updatedAt ? 'local' : 'cloud',
          conflictType: 'deletion'
        };
      }

      // Use operational transforms for title conflicts if operations are available
      if (localVersion.title !== cloudVersion.title && 
          baseVersion && localOperation && cloudOperation) {
        
        try {
          const otResult = CollaborativeEditResolver.resolveTextConflict(
            localVersion.title,
            cloudVersion.title,
            baseVersion.title,
            localOperation,
            cloudOperation
          );

          const resolvedChat: Chat = {
            ...localVersion,
            title: otResult.resolvedText,
            updatedAt: Math.max(localVersion.updatedAt, cloudVersion.updatedAt)
          };

          return {
            resolved: resolvedChat,
            strategy: 'operational_transform',
            operations: otResult.operations,
            conflictType: otResult.conflict ? 'concurrent_edit' : 'content',
            requiresManualReview: otResult.conflict && otResult.conflictResolution !== 'merge'
          };
        } catch (error) {
          console.warn('Operational transform failed, falling back to timestamp resolution:', error);
        }
      }

      // Fallback to timestamp-based resolution for title conflicts
      if (localVersion.title !== cloudVersion.title) {
        const mostRecent = localVersion.updatedAt > cloudVersion.updatedAt ? localVersion : cloudVersion;
        return {
          resolved: mostRecent,
          strategy: localVersion.updatedAt > cloudVersion.updatedAt ? 'local' : 'cloud',
          conflictType: 'content'
        };
      }

      // If no conflicts, use the most recently updated version
      return {
        resolved: localVersion.updatedAt > cloudVersion.updatedAt ? localVersion : cloudVersion,
        strategy: localVersion.updatedAt > cloudVersion.updatedAt ? 'local' : 'cloud'
      };
    };
  }

  private createMessageResolver(): ConflictResolver<Message> {
    return (conflict: ConflictData<Message>): ConflictResolution<Message> => {
      const { localVersion, cloudVersion, baseVersion, localOperation, cloudOperation } = conflict;

      // Handle deletion conflicts first
      if (localVersion.isDeleted && !cloudVersion.isDeleted) {
        return {
          resolved: cloudVersion,
          strategy: 'cloud',
          conflictType: 'deletion'
        };
      }
      
      if (!localVersion.isDeleted && cloudVersion.isDeleted) {
        return {
          resolved: localVersion,
          strategy: 'local',
          conflictType: 'deletion'
        };
      }

      if (localVersion.isDeleted && cloudVersion.isDeleted) {
        return {
          resolved: localVersion,
          strategy: 'local',
          conflictType: 'deletion'
        };
      }

      // Use operational transforms for content conflicts if operations are available
      if (localVersion.content !== cloudVersion.content && 
          baseVersion && localOperation && cloudOperation) {
        
        try {
          const otResult = CollaborativeEditResolver.resolveTextConflict(
            localVersion.content,
            cloudVersion.content,
            baseVersion.content,
            localOperation,
            cloudOperation
          );

          const resolvedMessage: Message = {
            ...localVersion,
            content: otResult.resolvedText,
            // Messages don't typically have updatedAt, but we'll keep the creation semantics
          };

          return {
            resolved: resolvedMessage,
            strategy: 'operational_transform',
            operations: otResult.operations,
            conflictType: otResult.conflict ? 'concurrent_edit' : 'content',
            requiresManualReview: otResult.conflict && otResult.conflictResolution !== 'merge'
          };
        } catch (error) {
          console.warn('Operational transform failed for message, falling back to cloud version:', error);
        }
      }

      // For content conflicts without operations, prefer cloud as source of truth
      if (localVersion.content !== cloudVersion.content) {
        return {
          resolved: cloudVersion,
          strategy: 'cloud',
          conflictType: 'content',
          requiresManualReview: true
        };
      }

      // Use the original version (messages shouldn't change after creation)
      return {
        resolved: localVersion.createdAt <= cloudVersion.createdAt ? localVersion : cloudVersion,
        strategy: localVersion.createdAt <= cloudVersion.createdAt ? 'local' : 'cloud'
      };
    };
  }

  /**
   * Resolve chat conflict with race condition prevention
   */
  async resolveChatAsync(conflict: ConflictData<Chat>): Promise<ConflictResolution<Chat>> {
    const entityId = conflict.localVersion.id;
    return this.resolveWithLocking('chat', entityId, () => this.chatResolver(conflict));
  }

  /**
   * Resolve message conflict with race condition prevention
   */
  async resolveMessageAsync(conflict: ConflictData<Message>): Promise<ConflictResolution<Message>> {
    const entityId = conflict.localVersion.id;
    return this.resolveWithLocking('message', entityId, () => this.messageResolver(conflict));
  }

  /**
   * Synchronous methods for testing - bypass locking mechanisms
   * Note: These have the same names as async methods but return results directly
   */
  resolveChat(conflict: ConflictData<Chat>): ConflictResolution<Chat> {
    return this.chatResolver(conflict);
  }

  resolveMessage(conflict: ConflictData<Message>): ConflictResolution<Message> {
    return this.messageResolver(conflict);
  }
  
  /**
   * Resolve conflict with proper locking to prevent race conditions
   */
  private async resolveWithLocking<T>(
    entityType: string,
    entityId: string,
    resolver: () => ConflictResolution<T>
  ): Promise<ConflictResolution<T>> {
    const lockKey = `${entityType}:${entityId}`;
    
    // Check if resolution is already in progress
    const activeResolution = this.activeResolutions.get(lockKey);
    if (activeResolution) {
      return activeResolution as Promise<ConflictResolution<T>>;
    }
    
    // Acquire lock for this entity
    if (!this.acquireLock(lockKey, entityId)) {
      // Wait for existing lock to be released
      await this.waitForLock(lockKey);
      return this.resolveWithLocking(entityType, entityId, resolver);
    }
    
    try {
      // Execute resolution within transaction for atomicity
      const resolutionPromise = this.transactionManager.executeInTransaction(async (context) => {
        return resolver();
      });
      
      this.activeResolutions.set(lockKey, resolutionPromise as Promise<ConflictResolution<any>>);
      const result = await resolutionPromise;
      
      return result;
      
    } finally {
      // Always release lock and cleanup
      this.releaseLock(lockKey);
      this.activeResolutions.delete(lockKey);
    }
  }

  // Advanced merge strategies for complex conflicts
  mergeChatData(local: Chat, cloud: Chat): Chat {
    // Create a merged version that combines the best of both
    return {
      ...local,
      // Use the most recent title
      title: local.updatedAt > cloud.updatedAt ? local.title : cloud.title,
      // Use the most recent update timestamp
      updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
      // Use deletion status from the most recent update
      isDeleted: local.updatedAt > cloud.updatedAt ? local.isDeleted : cloud.isDeleted
    };
  }

  // Detect if entities are in conflict
  isInConflict<T extends { updatedAt: number }>(
    local: T, 
    cloud: T, 
    lastSyncTimestamp: number
  ): boolean {
    // Both have been modified since last sync
    return local.updatedAt > lastSyncTimestamp && cloud.updatedAt > lastSyncTimestamp;
  }

  // Get conflict priority (higher number = higher priority)
  getConflictPriority(entityType: 'chat' | 'message', operation: 'create' | 'update' | 'delete'): number {
    const priorities = {
      chat: {
        create: 3,
        update: 2,
        delete: 1
      },
      message: {
        create: 3,
        update: 1, // Messages rarely update
        delete: 2
      }
    };

    return priorities[entityType][operation];
  }

  // Create a manual conflict resolution prompt
  createConflictPrompt<T>(
    entityType: string,
    conflict: ConflictData<T>
  ): {
    title: string;
    description: string;
    options: Array<{
      label: string;
      value: 'local' | 'cloud' | 'merge';
      description: string;
    }>;
  } {
    return {
      title: `${entityType} Conflict Detected`,
      description: `Both local and cloud versions of this ${entityType.toLowerCase()} have been modified. Choose how to resolve:`,
      options: [
        {
          label: 'Keep Local Version',
          value: 'local',
          description: 'Use the version stored on this device'
        },
        {
          label: 'Keep Cloud Version',
          value: 'cloud',
          description: 'Use the version from the server'
        },
        {
          label: 'Merge Changes',
          value: 'merge',
          description: 'Combine both versions intelligently'
        }
      ]
    };
  }
  
  /**
   * Acquire lock for conflict resolution
   */
  private acquireLock(lockKey: string, entityId: string): boolean {
    const existingLock = this.resolutionLocks.get(lockKey);
    
    if (existingLock) {
      // Check if lock has expired
      if (Date.now() - existingLock.timestamp > this.lockTimeout) {
        this.resolutionLocks.delete(lockKey);
      } else {
        return false; // Lock is still active
      }
    }
    
    // Acquire new lock
    this.resolutionLocks.set(lockKey, {
      timestamp: Date.now(),
      entityId
    });
    
    return true;
  }
  
  /**
   * Release lock for conflict resolution
   */
  private releaseLock(lockKey: string): void {
    this.resolutionLocks.delete(lockKey);
  }
  
  /**
   * Wait for lock to be released
   */
  private async waitForLock(lockKey: string): Promise<void> {
    const maxWaitTime = this.lockTimeout;
    const startTime = Date.now();
    
    while (this.resolutionLocks.has(lockKey) && (Date.now() - startTime) < maxWaitTime) {
      await this.sleep(100); // Wait 100ms before checking again
    }
    
    // If we timed out waiting, force release the lock
    if (this.resolutionLocks.has(lockKey)) {
      console.warn(`Forced release of stale lock: ${lockKey}`);
      this.releaseLock(lockKey);
    }
  }
  
  /**
   * Setup cleanup for stale locks
   */
  private setupLockCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [lockKey, lock] of this.resolutionLocks.entries()) {
        if (now - lock.timestamp > this.lockTimeout) {
          console.warn(`Cleaning up stale lock: ${lockKey}`);
          this.resolutionLocks.delete(lockKey);
        }
      }
    }, 60000); // Cleanup every minute
  }
  
  /**
   * Get conflict resolution statistics
   */
  getResolutionStats(): {
    activeLocks: number;
    activeResolutions: number;
    lockTimeouts: number;
  } {
    return {
      activeLocks: this.resolutionLocks.size,
      activeResolutions: this.activeResolutions.size,
      lockTimeouts: Array.from(this.resolutionLocks.values())
        .filter(lock => Date.now() - lock.timestamp > this.lockTimeout).length
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let conflictResolver: ConflictResolverManager | null = null;

export function getConflictResolver(): ConflictResolverManager {
  if (!conflictResolver) {
    conflictResolver = new ConflictResolverManager();
  }
  return conflictResolver;
}

/**
 * Cleanup conflict resolver for testing
 */
export function resetConflictResolver(): void {
  conflictResolver = null;
}

// Utility functions for common conflict scenarios
export function createTimestampConflictResolver<T extends { updatedAt: number }>(
  preferNewest = true
): ConflictResolver<T> {
  return (conflict: ConflictData<T>): ConflictResolution<T> => {
    const { localVersion, cloudVersion } = conflict;
    
    if (preferNewest) {
      return {
        resolved: localVersion.updatedAt > cloudVersion.updatedAt ? localVersion : cloudVersion,
        strategy: localVersion.updatedAt > cloudVersion.updatedAt ? 'local' : 'cloud'
      };
    } else {
      return {
        resolved: localVersion.updatedAt < cloudVersion.updatedAt ? localVersion : cloudVersion,
        strategy: localVersion.updatedAt < cloudVersion.updatedAt ? 'local' : 'cloud'
      };
    }
  };
}

export function createAlwaysPreferResolver<T>(
  strategy: 'local' | 'cloud'
): ConflictResolver<T> {
  return (conflict: ConflictData<T>): ConflictResolution<T> => {
    return {
      resolved: strategy === 'local' ? conflict.localVersion : conflict.cloudVersion,
      strategy
    };
  };
}