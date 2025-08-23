import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { 
  getEnhancedSyncManager, 
  disposeEnhancedSyncManager,
  resetEnhancedSyncManager 
} from '../enhanced-sync-manager';
import { getPerformanceOptimizer } from '../performance-optimizer';
import { getTransactionManager } from '../transaction-manager';
import { getConflictResolver, resetConflictResolver } from '../conflict-resolver';
import { createMessageVirtualization } from '../message-virtualization';
import { getPerformanceMonitor } from '../performance-monitor';
import { getNetworkErrorHandler } from '../network-error-handler';

// Mock dependencies
vi.mock('../realtime-sync', () => ({
  getRealtimeSyncManager: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    sendSyncEvent: vi.fn(),
    getStatus: () => ({ connected: true })
  })
}));

vi.mock('../sync-auth', () => ({
  getSyncAuthManager: () => ({
    authenticate: vi.fn(),
    isAuthenticated: () => true,
    refreshAuthentication: vi.fn(),
    createAuthHeaders: vi.fn(),
    logout: vi.fn(),
    getCurrentSession: () => ({ valid: true })
  })
}));

vi.mock('../sync-strategies', () => ({
  getSyncStrategyManager: () => ({
    decideSyncStrategy: vi.fn().mockResolvedValue({ strategy: 'incremental', reason: 'test' }),
    executeSync: vi.fn().mockResolvedValue({ success: true, conflictsResolved: 0 }),
    getSyncHistory: vi.fn().mockReturnValue([])
  })
}));

vi.mock('../retry-manager', () => ({
  getRetryManager: () => ({
    execute: vi.fn().mockImplementation((fn) => fn()),
    reset: vi.fn()
  })
}));

vi.mock('../error-handler', () => ({
  getDatabaseErrorHandler: () => ({
    handleError: vi.fn().mockReturnValue({ type: 'NETWORK_ERROR' })
  })
}));

describe('Performance Optimization Tests', () => {
  
  beforeEach(() => {
    // Reset all singletons before each test
    resetEnhancedSyncManager();
    resetConflictResolver();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup after each test
    await disposeEnhancedSyncManager();
  });

  describe('Memory Leak Prevention', () => {
    test('should properly cleanup timers and event listeners on shutdown', async () => {
      const syncManager = getEnhancedSyncManager();
      
      // Initialize sync manager
      await syncManager.initialize('test-user', 'test-token');
      
      // Verify initialization
      expect(syncManager.getHealthStatus().overall).toBe('healthy');
      
      // Add callbacks to test cleanup
      const statusCallback = vi.fn();
      const metricsCallback = vi.fn();
      
      const unsubscribeStatus = syncManager.onStatusChange(statusCallback);
      const unsubscribeMetrics = syncManager.onMetricsChange(metricsCallback);
      
      // Shutdown should cleanup everything
      await syncManager.shutdown();
      
      // Verify callbacks are properly cleaned up
      expect(statusCallback).not.toHaveBeenCalledAfter(await syncManager.shutdown());
      
      // Cleanup subscriptions
      unsubscribeStatus();
      unsubscribeMetrics();
    });

    test('should prevent unbounded callback growth', async () => {
      const syncManager = getEnhancedSyncManager();
      await syncManager.initialize('test-user', 'test-token');
      
      // Add more callbacks than the limit (100)
      const callbacks: (() => void)[] = [];
      for (let i = 0; i < 105; i++) {
        const unsubscribe = syncManager.onStatusChange(() => {});
        callbacks.push(unsubscribe);
      }
      
      // Should not exceed memory limits (implementation should handle this)
      const memoryBefore = process.memoryUsage().heapUsed;
      
      // Trigger callbacks
      await syncManager.performSync('test-user', {}, {});
      
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfter - memoryBefore;
      
      // Memory increase should be reasonable (less than 10MB for this test)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      
      // Cleanup
      callbacks.forEach(cleanup => cleanup());
      await syncManager.shutdown();
    });

    test('should handle disposal of singleton instances', async () => {
      const syncManager = getEnhancedSyncManager();
      await syncManager.initialize('test-user', 'test-token');
      
      // Dispose should cleanup the singleton
      await disposeEnhancedSyncManager();
      
      // Getting a new instance should create a fresh one
      const newSyncManager = getEnhancedSyncManager();
      expect(newSyncManager).toBeDefined();
      expect(newSyncManager.getHealthStatus().overall).not.toBe('healthy'); // Not initialized
    });
  });

  describe('Cache Management', () => {
    test('should enforce cache size limits', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 10,
        compressionEnabled: false
      });
      
      // Mock message loader
      const messageLoader = vi.fn().mockImplementation((offset, limit) => {
        return Promise.resolve(
          Array.from({ length: limit }, (_, i) => ({
            id: `msg-${offset + i}`,
            content: `Message ${offset + i}`,
            createdAt: Date.now(),
            userId: 'user1',
            chatId: 'chat1'
          }))
        );
      });
      
      // Load more messages than cache limit
      for (let i = 0; i < 15; i++) {
        await optimizer.optimizedPagination(
          messageLoader,
          { offset: i * 5, limit: 5, sortDirection: 'desc' },
          `test-cache-${i}`
        );
      }
      
      const stats = optimizer.getCacheStats();
      
      // Cache should not exceed the configured limit
      expect(stats.size).toBeLessThanOrEqual(10);
      expect(stats.memoryPressure).toBeLessThan(1.0);
      
      optimizer.cleanup();
    });

    test('should implement LRU eviction strategy', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 5,
        compressionEnabled: false
      });
      
      const messageLoader = vi.fn().mockImplementation((offset, limit) => {
        return Promise.resolve([{
          id: `msg-${offset}`,
          content: `Message ${offset}`,
          createdAt: Date.now(),
          userId: 'user1',
          chatId: 'chat1'
        }]);
      });
      
      // Load items into cache
      const cacheKeys = [];
      for (let i = 0; i < 7; i++) {
        const key = `cache-key-${i}`;
        cacheKeys.push(key);
        await optimizer.optimizedPagination(
          messageLoader,
          { offset: i, limit: 1, sortDirection: 'desc' },
          key
        );
      }
      
      // Access some items to affect LRU order
      await optimizer.optimizedPagination(
        messageLoader,
        { offset: 0, limit: 1, sortDirection: 'desc' },
        cacheKeys[0]
      );
      
      await optimizer.optimizedPagination(
        messageLoader,
        { offset: 2, limit: 1, sortDirection: 'desc' },
        cacheKeys[2]
      );
      
      const stats = optimizer.getCacheStats();
      
      // Cache should have evicted oldest unused items
      expect(stats.size).toBeLessThanOrEqual(5);
      expect(stats.hitRate).toBeGreaterThan(0); // Should have cache hits
      
      optimizer.cleanup();
    });

    test('should compress large cache entries', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 100,
        compressionEnabled: true
      });
      
      // Create large message content
      const largeContent = 'x'.repeat(2000); // 2KB content
      
      const messageLoader = vi.fn().mockImplementation(() => {
        return Promise.resolve([{
          id: 'large-msg',
          content: largeContent,
          createdAt: Date.now(),
          userId: 'user1',
          chatId: 'chat1'
        }]);
      });
      
      await optimizer.optimizedPagination(
        messageLoader,
        { offset: 0, limit: 1, sortDirection: 'desc' },
        'large-message-test'
      );
      
      const stats = optimizer.getCacheStats();
      
      // Should show compression being used
      expect(stats.compressionRatio).toBeDefined();
      
      optimizer.cleanup();
    });
  });

  describe('Transaction Management', () => {
    test('should handle concurrent transactions without race conditions', async () => {
      const transactionManager = getTransactionManager();
      const results: string[] = [];
      
      // Simulate concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) => 
        transactionManager.executeInTransaction(async (context) => {
          // Simulate database work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          results.push(`operation-${i}`);
          return `result-${i}`;
        })
      );
      
      const transactionResults = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(transactionResults).toHaveLength(10);
      expect(results).toHaveLength(10);
      
      // No active transactions should remain
      const stats = transactionManager.getTransactionStats();
      expect(stats.activeTransactions).toBe(0);
    });

    test('should rollback transactions on error', async () => {
      const transactionManager = getTransactionManager();
      let rollbackExecuted = false;
      
      try {
        await transactionManager.executeInTransaction(async (context) => {
          // Add a rollback handler
          context.rollbackHandlers.push(async () => {
            rollbackExecuted = true;
          });
          
          // Simulate an error
          throw new Error('Test transaction error');
        });
      } catch (error) {
        expect(error.message).toBe('Test transaction error');
      }
      
      // Rollback should have been executed
      expect(rollbackExecuted).toBe(true);
    });

    test('should handle transaction timeouts', async () => {
      const transactionManager = getTransactionManager();
      
      await expect(
        transactionManager.executeInTransaction(
          async () => {
            // Simulate long-running operation
            await new Promise(resolve => setTimeout(resolve, 100));
          },
          { timeout: 50 } // 50ms timeout
        )
      ).rejects.toThrow(/timed out/);
    });
  });

  describe('Conflict Resolution', () => {
    test('should prevent race conditions in conflict resolution', async () => {
      const resolver = getConflictResolver();
      
      const testChat = {
        id: 'test-chat',
        title: 'Test Chat',
        updatedAt: Date.now(),
        createdAt: Date.now() - 1000,
        userId: 'user1',
        isDeleted: false
      };
      
      const conflictData = {
        localVersion: { ...testChat, title: 'Local Title' },
        cloudVersion: { ...testChat, title: 'Cloud Title' },
        lastSyncTimestamp: Date.now() - 5000
      };
      
      // Simulate concurrent resolution requests
      const resolutions = await Promise.all([
        resolver.resolveChat(conflictData),
        resolver.resolveChat(conflictData),
        resolver.resolveChat(conflictData)
      ]);
      
      // All resolutions should be consistent
      expect(resolutions[0].resolved.title).toBe(resolutions[1].resolved.title);
      expect(resolutions[1].resolved.title).toBe(resolutions[2].resolved.title);
      
      const stats = resolver.getResolutionStats();
      expect(stats.activeLocks).toBe(0); // All locks should be released
    });
  });

  describe('Message Virtualization', () => {
    test('should efficiently handle large message lists', async () => {
      const messageLoader = vi.fn().mockImplementation((start, count) => {
        return Promise.resolve(
          Array.from({ length: count }, (_, i) => ({
            id: `msg-${start + i}`,
            content: `Message ${start + i}`,
            createdAt: Date.now() - (start + i) * 1000,
            userId: 'user1',
            chatId: 'chat1'
          }))
        );
      });
      
      const virtualizer = createMessageVirtualization(
        {
          itemHeight: 60,
          bufferSize: 5,
          maxCacheSize: 100,
          preloadSize: 20
        },
        messageLoader
      );
      
      await virtualizer.initialize(10000); // 10k messages
      
      // Simulate scrolling through messages
      const range1 = await virtualizer.updateScrollPosition(0, 400);
      expect(range1.messages.length).toBeGreaterThan(0);
      
      const range2 = await virtualizer.updateScrollPosition(1000, 400);
      expect(range2.messages.length).toBeGreaterThan(0);
      
      const range3 = await virtualizer.updateScrollPosition(5000, 400);
      expect(range3.messages.length).toBeGreaterThan(0);
      
      const stats = virtualizer.getStats();
      
      // Should maintain reasonable memory usage
      expect(stats.memoryUsage).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
      expect(stats.cacheEfficiency).toBeGreaterThan(0.5); // At least 50% efficiency
      
      virtualizer.dispose();
    });

    test('should perform memory cleanup during scrolling', async () => {
      const messageLoader = vi.fn().mockImplementation((start, count) => {
        return Promise.resolve(
          Array.from({ length: count }, (_, i) => ({
            id: `msg-${start + i}`,
            content: 'x'.repeat(1000), // 1KB per message
            createdAt: Date.now() - (start + i) * 1000,
            userId: 'user1',
            chatId: 'chat1'
          }))
        );
      });
      
      const virtualizer = createMessageVirtualization(
        {
          itemHeight: 60,
          bufferSize: 10,
          maxCacheSize: 50,
          cleanupThreshold: 0.8
        },
        messageLoader
      );
      
      await virtualizer.initialize(1000);
      
      // Load many messages by scrolling
      for (let i = 0; i < 100; i++) {
        await virtualizer.updateScrollPosition(i * 60, 400);
      }
      
      const stats = virtualizer.getStats();
      
      // Memory should be managed efficiently
      expect(stats.loadedMessages).toBeLessThanOrEqual(50);
      expect(stats.memoryUsage).toBeLessThan(100 * 1024); // Reasonable memory usage
      
      virtualizer.dispose();
    });
  });

  describe('Performance Monitoring', () => {
    test('should track performance metrics', async () => {
      const monitor = getPerformanceMonitor();
      
      // Record various metrics
      monitor.recordQuery(100, true, 'SELECT * FROM messages', 50);
      monitor.recordQuery(250, true, 'SELECT * FROM chats', 10);
      monitor.recordQuery(1500, false, 'SELECT * FROM large_table'); // Slow query
      
      monitor.recordCacheOperation('hit', 1024);
      monitor.recordCacheOperation('miss', 2048);
      monitor.recordCacheOperation('eviction');
      
      monitor.recordSyncOperation(2000, true, 2, 5000);
      monitor.recordSyncOperation(5000, false, 5, 10000);
      
      const metrics = monitor.getDatabasePerformanceMetrics();
      
      // Verify metrics are collected correctly
      expect(metrics.queries.total).toBe(3);
      expect(metrics.queries.slowQueries).toBe(1);
      expect(metrics.queries.errorRate).toBeGreaterThan(0);
      
      expect(metrics.cache.evictions).toBe(1);
      expect(metrics.cache.hitRate).toBeGreaterThan(0);
      
      expect(metrics.sync.operations).toBe(2);
      expect(metrics.sync.conflicts).toBe(7);
      
      monitor.stopMonitoring();
    });

    test('should generate alerts for threshold violations', async () => {
      const monitor = getPerformanceMonitor();
      const alerts: any[] = [];
      
      monitor.onAlert((alert) => {
        alerts.push(alert);
      });
      
      // Set a low threshold for testing
      monitor.setThreshold('test.metric', 10, 20, 'ms');
      
      // Record metrics that exceed thresholds
      monitor.recordMetric('test.metric', 15, 'ms'); // Warning
      monitor.recordMetric('test.metric', 25, 'ms'); // Critical
      
      // Wait for alerts to be processed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alerts).toHaveLength(2);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[1].severity).toBe('critical');
      
      monitor.stopMonitoring();
    });
  });

  describe('Network Error Handling', () => {
    test('should handle network errors without resource leaks', async () => {
      const handler = getNetworkErrorHandler();
      
      const failingOperation = vi.fn().mockRejectedValue(new Error('Network timeout'));
      
      const context = {
        condition: 'poor' as const,
        retryAttempt: 0,
        operationType: 'sync' as const,
        priority: 'medium' as const,
        userInitiated: true,
        backgroundOperation: false
      };
      
      await expect(
        handler.executeWithNetworkHandling(failingOperation, context)
      ).rejects.toThrow();
      
      const stats = handler.getPerformanceStats();
      
      // Should not have leaked resources
      expect(stats.activeRequests).toBe(0);
      expect(stats.memoryUsage).toBeLessThan(1024 * 1024); // Less than 1MB
      
      await handler.shutdown();
    });

    test('should abort operations on shutdown', async () => {
      const handler = getNetworkErrorHandler();
      
      const slowOperation = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      const context = {
        condition: 'good' as const,
        retryAttempt: 0,
        operationType: 'data' as const,
        priority: 'low' as const,
        userInitiated: false,
        backgroundOperation: true
      };
      
      // Start operation
      const operationPromise = handler.executeWithNetworkHandling(slowOperation, context);
      
      // Shutdown immediately
      await handler.shutdown();
      
      // Operation should be aborted
      await expect(operationPromise).rejects.toThrow(/shutdown|abort/i);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete sync workflow without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const syncManager = getEnhancedSyncManager({
        performance: {
          maxCacheSize: 50,
          compressionEnabled: true
        }
      });
      
      await syncManager.initialize('test-user', 'test-token');
      
      // Perform multiple sync operations
      for (let i = 0; i < 10; i++) {
        await syncManager.performSync('test-user', {}, {});
      }
      
      // Handle some conflicts
      for (let i = 0; i < 5; i++) {
        await syncManager.handleCollaborativeEdit(
          'chat',
          `chat-${i}`,
          'old content',
          'new content',
          'test-user',
          1
        );
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Cleanup
      await syncManager.shutdown();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    });

    test('should maintain performance under stress', async () => {
      const monitor = getPerformanceMonitor();
      const optimizer = getPerformanceOptimizer();
      
      monitor.startMonitoring();
      
      const startTime = Date.now();
      
      // Simulate heavy workload
      const operations = Array.from({ length: 100 }, async (_, i) => {
        // Database operations
        monitor.recordQuery(Math.random() * 100, true, `query-${i}`);
        
        // Cache operations
        optimizer.createDebouncedSearch(async (query) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return [`result-${query}`];
        })(`search-${i}`);
        
        return i;
      });
      
      await Promise.all(operations);
      
      const duration = Date.now() - startTime;
      const metrics = monitor.getDatabasePerformanceMetrics();
      
      // Performance should be reasonable
      expect(duration).toBeLessThan(5000); // Less than 5 seconds
      expect(metrics.queries.avgDuration).toBeLessThan(100); // Less than 100ms average
      
      monitor.stopMonitoring();
      optimizer.cleanup();
    });
  });
});

// Helper function to simulate time passing
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Memory usage helper
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  return 0;
}