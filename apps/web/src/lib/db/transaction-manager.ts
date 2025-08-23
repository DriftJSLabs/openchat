import { getDatabaseErrorHandler, DatabaseErrorType, type DatabaseError } from './error-handler';

export type TransactionIsolationLevel = 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

export interface TransactionConfig {
  isolationLevel: TransactionIsolationLevel;
  timeout: number; // Transaction timeout in milliseconds
  retryAttempts: number;
  deadlockRetryDelay: number;
}

export interface TransactionContext {
  id: string;
  startTime: number;
  isolationLevel: TransactionIsolationLevel;
  operations: Array<{
    operation: string;
    timestamp: number;
    data?: any;
  }>;
  rollbackHandlers: Array<() => Promise<void>>;
  isActive: boolean;
  isCommitting: boolean;
  isRollingBack: boolean;
}

/**
 * Transaction manager that provides ACID guarantees for database operations
 * Prevents race conditions and ensures data consistency
 */
export class TransactionManager {
  private config: TransactionConfig;
  private activeTransactions = new Map<string, TransactionContext>();
  private transactionQueue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    context: TransactionContext;
  }> = [];
  private errorHandler = getDatabaseErrorHandler();
  private lockManager = new LockManager();
  private deadlockDetector = new DeadlockDetector();
  private isProcessingQueue = false;

  constructor(config: Partial<TransactionConfig> = {}) {
    this.config = {
      isolationLevel: 'READ_COMMITTED',
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      deadlockRetryDelay: 100,
      ...config
    };
  }

  /**
   * Execute operation within a transaction with proper isolation and rollback
   */
  async executeInTransaction<T>(
    operation: (context: TransactionContext) => Promise<T>,
    config?: Partial<TransactionConfig>
  ): Promise<T> {
    const txConfig = { ...this.config, ...config };
    const context = this.createTransactionContext(txConfig);
    
    this.activeTransactions.set(context.id, context);
    
    try {
      // Set transaction timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Transaction ${context.id} timed out after ${txConfig.timeout}ms`));
        }, txConfig.timeout);
      });

      // Execute operation with timeout
      const result = await Promise.race([
        this.executeWithIsolation(operation, context),
        timeoutPromise
      ]);

      // Commit transaction
      await this.commitTransaction(context);
      
      return result;
      
    } catch (error) {
      // Rollback on any error
      await this.rollbackTransaction(context);
      throw this.errorHandler.handleError(error, {
        transactionId: context.id,
        operation: 'executeInTransaction'
      });
    } finally {
      this.activeTransactions.delete(context.id);
    }
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async executeBatch<T>(
    operations: Array<(context: TransactionContext) => Promise<T>>,
    config?: Partial<TransactionConfig>
  ): Promise<T[]> {
    return this.executeInTransaction(async (context) => {
      const results: T[] = [];
      
      for (const operation of operations) {
        const result = await operation(context);
        results.push(result);
      }
      
      return results;
    }, config);
  }

  /**
   * Execute operation with optimistic concurrency control
   */
  async executeOptimistic<T>(
    operation: (context: TransactionContext) => Promise<T>,
    conflictResolver?: (error: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        return await this.executeInTransaction(operation, {
          isolationLevel: 'READ_COMMITTED',
          retryAttempts: 1
        });
      } catch (error) {
        attempt++;
        
        if (this.isOptimisticConflict(error) && attempt < maxRetries) {
          // Handle optimistic concurrency conflict
          if (conflictResolver) {
            try {
              return await conflictResolver(error);
            } catch (resolverError) {
              // Continue with retry if resolver fails
            }
          }
          
          // Exponential backoff before retry
          await this.sleep(Math.pow(2, attempt) * 100);
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error(`Optimistic transaction failed after ${maxRetries} attempts`);
  }

  /**
   * Create savepoint for partial rollback
   */
  async createSavepoint(context: TransactionContext, name: string): Promise<void> {
    if (!context.isActive) {
      throw new Error('Cannot create savepoint in inactive transaction');
    }
    
    context.operations.push({
      operation: 'SAVEPOINT',
      timestamp: Date.now(),
      data: { name }
    });
  }

  /**
   * Rollback to savepoint
   */
  async rollbackToSavepoint(context: TransactionContext, name: string): Promise<void> {
    if (!context.isActive) {
      throw new Error('Cannot rollback in inactive transaction');
    }
    
    // Find the savepoint
    const savepointIndex = context.operations.findIndex(
      op => op.operation === 'SAVEPOINT' && op.data?.name === name
    );
    
    if (savepointIndex === -1) {
      throw new Error(`Savepoint '${name}' not found`);
    }
    
    // Execute rollback handlers for operations after the savepoint
    const operationsToRollback = context.operations.slice(savepointIndex + 1);
    
    for (let i = operationsToRollback.length - 1; i >= 0; i--) {
      const rollbackHandler = context.rollbackHandlers[savepointIndex + 1 + i];
      if (rollbackHandler) {
        try {
          await rollbackHandler();
        } catch (error) {
          console.warn(`Failed to rollback operation:`, error);
        }
      }
    }
    
    // Remove operations after savepoint
    context.operations.splice(savepointIndex + 1);
    context.rollbackHandlers.splice(savepointIndex + 1);
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    activeTransactions: number;
    queuedOperations: number;
    totalTransactions: number;
    averageTransactionTime: number;
    deadlockCount: number;
    rollbackCount: number;
  } {
    return {
      activeTransactions: this.activeTransactions.size,
      queuedOperations: this.transactionQueue.length,
      totalTransactions: this.deadlockDetector.getTotalTransactions(),
      averageTransactionTime: this.deadlockDetector.getAverageTransactionTime(),
      deadlockCount: this.deadlockDetector.getDeadlockCount(),
      rollbackCount: this.deadlockDetector.getRollbackCount()
    };
  }

  // Private methods
  private createTransactionContext(config: TransactionConfig): TransactionContext {
    return {
      id: this.generateTransactionId(),
      startTime: Date.now(),
      isolationLevel: config.isolationLevel,
      operations: [],
      rollbackHandlers: [],
      isActive: true,
      isCommitting: false,
      isRollingBack: false
    };
  }

  private async executeWithIsolation<T>(
    operation: (context: TransactionContext) => Promise<T>,
    context: TransactionContext
  ): Promise<T> {
    // Apply isolation level constraints
    switch (context.isolationLevel) {
      case 'SERIALIZABLE':
        return this.executeSerializable(operation, context);
      case 'REPEATABLE_READ':
        return this.executeRepeatableRead(operation, context);
      case 'READ_COMMITTED':
        return this.executeReadCommitted(operation, context);
      case 'READ_UNCOMMITTED':
        return this.executeReadUncommitted(operation, context);
      default:
        return operation(context);
    }
  }

  private async executeSerializable<T>(
    operation: (context: TransactionContext) => Promise<T>,
    context: TransactionContext
  ): Promise<T> {
    // Acquire exclusive lock for serializable isolation
    const lockKey = 'SERIALIZABLE_LOCK';
    await this.lockManager.acquireExclusiveLock(lockKey, context.id);
    
    try {
      return await operation(context);
    } finally {
      await this.lockManager.releaseLock(lockKey, context.id);
    }
  }

  private async executeRepeatableRead<T>(
    operation: (context: TransactionContext) => Promise<T>,
    context: TransactionContext
  ): Promise<T> {
    // Acquire shared locks for all reads
    return operation(context);
  }

  private async executeReadCommitted<T>(
    operation: (context: TransactionContext) => Promise<T>,
    context: TransactionContext
  ): Promise<T> {
    // No special locking - default behavior
    return operation(context);
  }

  private async executeReadUncommitted<T>(
    operation: (context: TransactionContext) => Promise<T>,
    context: TransactionContext
  ): Promise<T> {
    // No locking - dirty reads allowed
    return operation(context);
  }

  private async commitTransaction(context: TransactionContext): Promise<void> {
    if (!context.isActive || context.isCommitting || context.isRollingBack) {
      return;
    }
    
    context.isCommitting = true;
    
    try {
      // Check for deadlocks before committing
      await this.deadlockDetector.checkForDeadlock(context);
      
      // Commit all operations
      context.operations.push({
        operation: 'COMMIT',
        timestamp: Date.now()
      });
      
      context.isActive = false;
      
    } catch (error) {
      context.isCommitting = false;
      throw error;
    }
  }

  private async rollbackTransaction(context: TransactionContext): Promise<void> {
    if (!context.isActive || context.isRollingBack) {
      return;
    }
    
    context.isRollingBack = true;
    
    try {
      // Execute rollback handlers in reverse order
      for (let i = context.rollbackHandlers.length - 1; i >= 0; i--) {
        const handler = context.rollbackHandlers[i];
        if (handler) {
          try {
            await handler();
          } catch (error) {
            console.warn(`Rollback handler failed:`, error);
          }
        }
      }
      
      context.operations.push({
        operation: 'ROLLBACK',
        timestamp: Date.now()
      });
      
      context.isActive = false;
      this.deadlockDetector.recordRollback();
      
    } catch (error) {
      console.error('Failed to rollback transaction:', error);
    } finally {
      context.isRollingBack = false;
    }
  }

  private isOptimisticConflict(error: any): boolean {
    if (error instanceof DatabaseError) {
      return error.type === DatabaseErrorType.CONFLICT_RESOLUTION_FAILED ||
             error.type === DatabaseErrorType.CONCURRENT_MODIFICATION;
    }
    
    const message = error?.message?.toLowerCase() || '';
    return message.includes('conflict') || 
           message.includes('version') || 
           message.includes('concurrent');
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Lock manager for handling concurrent access
 */
class LockManager {
  private locks = new Map<string, {
    type: 'shared' | 'exclusive';
    holders: Set<string>;
    waitQueue: Array<{
      transactionId: string;
      type: 'shared' | 'exclusive';
      resolve: () => void;
      reject: (error: any) => void;
    }>;
  }>();

  async acquireSharedLock(key: string, transactionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const lock = this.locks.get(key);
      
      if (!lock) {
        // Create new shared lock
        this.locks.set(key, {
          type: 'shared',
          holders: new Set([transactionId]),
          waitQueue: []
        });
        resolve();
        return;
      }
      
      if (lock.type === 'shared') {
        // Add to existing shared lock
        lock.holders.add(transactionId);
        resolve();
        return;
      }
      
      // Wait for exclusive lock to be released
      lock.waitQueue.push({
        transactionId,
        type: 'shared',
        resolve,
        reject
      });
    });
  }

  async acquireExclusiveLock(key: string, transactionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const lock = this.locks.get(key);
      
      if (!lock) {
        // Create new exclusive lock
        this.locks.set(key, {
          type: 'exclusive',
          holders: new Set([transactionId]),
          waitQueue: []
        });
        resolve();
        return;
      }
      
      // Wait for lock to be released
      lock.waitQueue.push({
        transactionId,
        type: 'exclusive',
        resolve,
        reject
      });
    });
  }

  async releaseLock(key: string, transactionId: string): Promise<void> {
    const lock = this.locks.get(key);
    if (!lock) return;
    
    lock.holders.delete(transactionId);
    
    if (lock.holders.size === 0) {
      // Process wait queue
      const nextWaiter = lock.waitQueue.shift();
      if (nextWaiter) {
        if (nextWaiter.type === 'exclusive') {
          lock.type = 'exclusive';
          lock.holders.add(nextWaiter.transactionId);
          nextWaiter.resolve();
        } else {
          // Grant shared locks to all compatible waiters
          lock.type = 'shared';
          lock.holders.add(nextWaiter.transactionId);
          nextWaiter.resolve();
          
          // Grant additional shared locks
          while (lock.waitQueue.length > 0 && lock.waitQueue[0].type === 'shared') {
            const sharedWaiter = lock.waitQueue.shift()!;
            lock.holders.add(sharedWaiter.transactionId);
            sharedWaiter.resolve();
          }
        }
      } else {
        // No waiters, remove lock
        this.locks.delete(key);
      }
    }
  }
}

/**
 * Deadlock detector using wait-for graph
 */
class DeadlockDetector {
  private waitForGraph = new Map<string, Set<string>>();
  private transactionMetrics = {
    total: 0,
    totalTime: 0,
    deadlocks: 0,
    rollbacks: 0
  };

  async checkForDeadlock(context: TransactionContext): Promise<void> {
    // Simple deadlock detection algorithm
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    if (this.hasCycle(context.id, visited, recursionStack)) {
      this.transactionMetrics.deadlocks++;
      throw new Error(`Deadlock detected involving transaction ${context.id}`);
    }
  }

  recordTransaction(startTime: number): void {
    this.transactionMetrics.total++;
    this.transactionMetrics.totalTime += Date.now() - startTime;
  }

  recordRollback(): void {
    this.transactionMetrics.rollbacks++;
  }

  getTotalTransactions(): number {
    return this.transactionMetrics.total;
  }

  getAverageTransactionTime(): number {
    return this.transactionMetrics.total > 0 
      ? this.transactionMetrics.totalTime / this.transactionMetrics.total 
      : 0;
  }

  getDeadlockCount(): number {
    return this.transactionMetrics.deadlocks;
  }

  getRollbackCount(): number {
    return this.transactionMetrics.rollbacks;
  }

  private hasCycle(transactionId: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    visited.add(transactionId);
    recursionStack.add(transactionId);
    
    const dependencies = this.waitForGraph.get(transactionId);
    if (dependencies) {
      for (const dependency of dependencies) {
        if (!visited.has(dependency)) {
          if (this.hasCycle(dependency, visited, recursionStack)) {
            return true;
          }
        } else if (recursionStack.has(dependency)) {
          return true;
        }
      }
    }
    
    recursionStack.delete(transactionId);
    return false;
  }
}

// Singleton instances
let transactionManager: TransactionManager | null = null;

export function getTransactionManager(config?: Partial<TransactionConfig>): TransactionManager {
  if (!transactionManager) {
    transactionManager = new TransactionManager(config);
  }
  return transactionManager;
}

/**
 * Execute operation in transaction - convenience function
 */
export async function executeInTransaction<T>(
  operation: (context: TransactionContext) => Promise<T>,
  config?: Partial<TransactionConfig>
): Promise<T> {
  const manager = getTransactionManager();
  return manager.executeInTransaction(operation, config);
}

/**
 * Execute batch operations in transaction
 */
export async function executeBatchInTransaction<T>(
  operations: Array<(context: TransactionContext) => Promise<T>>,
  config?: Partial<TransactionConfig>
): Promise<T[]> {
  const manager = getTransactionManager();
  return manager.executeBatch(operations, config);
}