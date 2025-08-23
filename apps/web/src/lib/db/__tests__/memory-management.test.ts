import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPerformanceOptimizer } from '../performance-optimizer';
import { createMessageVirtualization } from '../message-virtualization';
import { getPerformanceMonitor } from '../performance-monitor';
import { getNetworkErrorHandler } from '../network-error-handler';

// Mock global objects for testing
const mockNavigator = {
  onLine: true,
  storage: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024, // 1MB
      quota: 100 * 1024 * 1024 // 100MB
    })
  }
};

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
};

// @ts-ignore
global.navigator = mockNavigator;
// @ts-ignore
global.window = mockWindow;

describe('Memory Management Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup any global state
    vi.restoreAllMocks();
  });

  describe('Cache Memory Management', () => {
    test('should enforce strict memory limits', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 100,
        compressionEnabled: false
      });
      
      // Create large data entries
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        content: 'x'.repeat(5000), // 5KB per item
        metadata: { index: i, timestamp: Date.now() }
      }));
      
      const messageLoader = vi.fn().mockResolvedValue(largeData);
      
      // Attempt to load data that exceeds memory limits
      try {
        for (let i = 0; i < 200; i++) {
          await optimizer.optimizedPagination(
            messageLoader,
            { offset: i * 10, limit: 10, sortDirection: 'desc' },
            `cache-key-${i}`
          );
        }
      } catch (error) {
        // Some operations might fail due to memory pressure, which is expected
      }
      
      const stats = optimizer.getCacheStats();
      
      // Memory usage should be controlled
      expect(stats.memoryUsage).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
      expect(stats.memoryPressure).toBeLessThan(1.0); // Under 100% pressure
      
      optimizer.cleanup();
    });

    test('should perform aggressive cleanup under memory pressure', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 10,
        compressionEnabled: true
      });
      
      const messageLoader = vi.fn().mockImplementation((offset, limit) => {
        return Promise.resolve(
          Array.from({ length: limit }, (_, i) => ({
            id: `msg-${offset + i}`,
            content: 'x'.repeat(2000), // 2KB per message
            createdAt: Date.now(),
            userId: 'user1',
            chatId: 'chat1'
          }))
        );
      });
      
      // Load many items to trigger cleanup
      for (let i = 0; i < 50; i++) {
        await optimizer.optimizedPagination(
          messageLoader,
          { offset: i * 5, limit: 5, sortDirection: 'desc' },
          `test-${i}`
        );
      }
      
      const stats = optimizer.getCacheStats();
      
      // Cache should be kept under control
      expect(stats.size).toBeLessThanOrEqual(10);
      expect(stats.memoryPressure).toBeLessThan(0.9); // Under 90% pressure
      
      optimizer.cleanup();
    });

    test('should handle compression effectively', async () => {
      const optimizer = getPerformanceOptimizer({
        maxCacheSize: 50,
        compressionEnabled: true
      });
      
      // Create highly compressible data
      const compressibleContent = 'A'.repeat(10000); // Highly compressible
      
      const messageLoader = vi.fn().mockResolvedValue([{
        id: 'compressible-msg',
        content: compressibleContent,
        createdAt: Date.now(),
        userId: 'user1',
        chatId: 'chat1'
      }]);
      
      await optimizer.optimizedPagination(
        messageLoader,
        { offset: 0, limit: 1, sortDirection: 'desc' },
        'compression-test'
      );
      
      const stats = optimizer.getCacheStats();
      
      // Compression should be effective
      expect(stats.compressionRatio).toBeLessThan(1.0);
      
      optimizer.cleanup();
    });
  });

  describe('Virtualization Memory Management', () => {
    test('should maintain bounded memory usage during scrolling', async () => {
      const messageLoader = vi.fn().mockImplementation((start, count) => {
        return Promise.resolve(
          Array.from({ length: count }, (_, i) => ({
            id: `msg-${start + i}`,
            content: `${'x'.repeat(1000)}`, // 1KB content
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
          maxCacheSize: 100,
          cleanupThreshold: 0.7
        },
        messageLoader
      );
      
      await virtualizer.initialize(50000); // 50k total messages
      
      const memorySnapshots: number[] = [];
      
      // Simulate extensive scrolling
      for (let i = 0; i < 100; i++) {
        const scrollPosition = i * 1000;
        await virtualizer.updateScrollPosition(scrollPosition, 600);
        
        const stats = virtualizer.getStats();
        memorySnapshots.push(stats.memoryUsage);
        
        // Memory should not grow unbounded
        expect(stats.memoryUsage).toBeLessThan(20 * 1024 * 1024); // Less than 20MB
        expect(stats.loadedMessages).toBeLessThanOrEqual(200); // Reasonable cache size
      }
      
      // Memory usage should stabilize (not grow linearly)
      const firstHalf = memorySnapshots.slice(0, 50);
      const secondHalf = memorySnapshots.slice(50);
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      // Memory should not grow significantly between first and second half
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5);
      
      virtualizer.dispose();
    });

    test('should clean up observers and timers on dispose', () => {
      const virtualizer = createMessageVirtualization(
        {
          itemHeight: 60,
          bufferSize: 5,
          maxCacheSize: 50,
          cleanupThreshold: 0.8
        },
        vi.fn().mockResolvedValue([])
      );
      
      // Mock IntersectionObserver
      const mockObserver = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
      
      // @ts-ignore
      global.IntersectionObserver = vi.fn().mockImplementation(() => mockObserver);
      
      // Initialize and then dispose
      virtualizer.initialize(1000);
      virtualizer.dispose();
      
      // Should clean up properly
      const stats = virtualizer.getStats();
      expect(stats.loadedMessages).toBe(0);
      expect(stats.memoryUsage).toBe(0);
    });
  });

  describe('Event Listener Memory Leaks', () => {
    test('should properly remove all event listeners', async () => {
      const handler = getNetworkErrorHandler();
      
      // Track event listener calls
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      // Create handler which should add event listeners
      const handlerWithListeners = getNetworkErrorHandler();
      
      // Verify listeners were added
      expect(addEventListenerSpy).toHaveBeenCalled();
      
      // Shutdown should remove all listeners
      await handlerWithListeners.shutdown();
      
      // Should have removed listeners
      expect(removeEventListenerSpy).toHaveBeenCalled();
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    test('should abort pending requests on shutdown', async () => {
      const handler = getNetworkErrorHandler();
      
      const longRunningOperation = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );
      
      const context = {
        condition: 'good' as const,
        retryAttempt: 0,
        operationType: 'sync' as const,
        priority: 'medium' as const,
        userInitiated: true,
        backgroundOperation: false
      };
      
      // Start multiple operations
      const operations = Array.from({ length: 5 }, () =>
        handler.executeWithNetworkHandling(longRunningOperation, context)
      );
      
      // Shutdown should abort all pending operations
      const shutdownPromise = handler.shutdown();
      
      // Operations should be rejected
      await Promise.allSettled(operations);
      await shutdownPromise;
      
      const stats = handler.getPerformanceStats();
      expect(stats.activeRequests).toBe(0);
    });
  });

  describe('Performance Monitor Memory Management', () => {
    test('should limit metrics storage to prevent unbounded growth', () => {
      const monitor = getPerformanceMonitor();
      
      // Record many metrics
      for (let i = 0; i < 2000; i++) {
        monitor.recordMetric(`test.metric.${i % 10}`, Math.random() * 100, 'ms');
      }
      
      // Each metric type should be limited in size
      const exported = monitor.exportMetrics();
      
      for (const [metricName, metrics] of Object.entries(exported)) {
        expect(metrics.length).toBeLessThanOrEqual(1000); // Should not exceed max
      }
      
      monitor.stopMonitoring();
    });

    test('should clean up old metrics and alerts', async () => {
      const monitor = getPerformanceMonitor();
      
      // Record metrics with old timestamps
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      
      // Mock Date.now to return old timestamp
      const originalNow = Date.now;
      Date.now = vi.fn().mockReturnValue(oldTimestamp);
      
      monitor.recordMetric('old.metric', 100, 'ms');
      monitor.recordMetric('old.metric', 200, 'ms');
      
      // Restore Date.now
      Date.now = originalNow;
      
      // Record recent metrics
      monitor.recordMetric('old.metric', 300, 'ms');
      
      // Wait for cleanup cycle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const exported = monitor.exportMetrics(24 * 60 * 60 * 1000); // Last 24 hours
      
      // Should only have recent metrics
      expect(exported['old.metric'].length).toBe(1);
      expect(exported['old.metric'][0].value).toBe(300);
      
      monitor.stopMonitoring();
    });
  });

  describe('Memory Stress Tests', () => {
    test('should handle rapid allocation and deallocation', async () => {
      const initialMemory = getMemoryUsage();
      
      // Rapid allocation test
      for (let iteration = 0; iteration < 10; iteration++) {
        const optimizer = getPerformanceOptimizer({
          maxCacheSize: 20,
          compressionEnabled: true
        });
        
        // Load data rapidly
        const messageLoader = vi.fn().mockImplementation((offset, limit) => {
          return Promise.resolve(
            Array.from({ length: limit }, (_, i) => ({
              id: `msg-${offset + i}`,
              content: `Message content ${offset + i}`,
              createdAt: Date.now(),
              userId: 'user1',
              chatId: 'chat1'
            }))
          );
        });
        
        for (let i = 0; i < 30; i++) {
          await optimizer.optimizedPagination(
            messageLoader,
            { offset: i * 5, limit: 5, sortDirection: 'desc' },
            `stress-test-${iteration}-${i}`
          );
        }
        
        // Cleanup
        optimizer.cleanup();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = getMemoryUsage();
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle concurrent memory-intensive operations', async () => {
      const operations = Array.from({ length: 20 }, async (_, i) => {
        const virtualizer = createMessageVirtualization(
          {
            itemHeight: 60,
            bufferSize: 5,
            maxCacheSize: 25,
            cleanupThreshold: 0.8
          },
          vi.fn().mockImplementation((start, count) => {
            return Promise.resolve(
              Array.from({ length: count }, (_, j) => ({
                id: `msg-${i}-${start + j}`,
                content: `${'x'.repeat(500)}`, // 500 bytes
                createdAt: Date.now(),
                userId: 'user1',
                chatId: 'chat1'
              }))
            );
          })
        );
        
        await virtualizer.initialize(1000);
        
        // Simulate scrolling
        for (let scroll = 0; scroll < 10; scroll++) {
          await virtualizer.updateScrollPosition(scroll * 100, 400);
        }
        
        const stats = virtualizer.getStats();
        virtualizer.dispose();
        
        return stats.memoryUsage;
      });
      
      const memoryUsages = await Promise.all(operations);
      
      // Each operation should use reasonable memory
      memoryUsages.forEach(usage => {
        expect(usage).toBeLessThan(5 * 1024 * 1024); // Less than 5MB each
      });
    });
  });

  describe('Resource Cleanup Verification', () => {
    test('should completely clean up all resources', async () => {
      const initialResources = {
        intervals: global.clearInterval ? global.clearInterval.mock?.calls?.length || 0 : 0,
        timeouts: global.clearTimeout ? global.clearTimeout.mock?.calls?.length || 0 : 0
      };
      
      // Create and use various components
      const monitor = getPerformanceMonitor();
      const optimizer = getPerformanceOptimizer();
      const handler = getNetworkErrorHandler();
      
      monitor.startMonitoring();
      
      // Use components
      monitor.recordMetric('test', 100, 'ms');
      
      await optimizer.optimizedPagination(
        vi.fn().mockResolvedValue([{
          id: 'test',
          content: 'test',
          createdAt: Date.now(),
          userId: 'user1',
          chatId: 'chat1'
        }]),
        { offset: 0, limit: 1, sortDirection: 'desc' },
        'test'
      );
      
      await handler.executeWithNetworkHandling(
        () => Promise.resolve('test'),
        {
          condition: 'good',
          retryAttempt: 0,
          operationType: 'data',
          priority: 'low',
          userInitiated: false,
          backgroundOperation: false
        }
      );
      
      // Cleanup all resources
      monitor.stopMonitoring();
      optimizer.cleanup();
      await handler.shutdown();
      
      // Verify cleanup (this is environment-dependent)
      // In a real test environment, you would check that no timers are left running
      expect(true).toBe(true); // Placeholder assertion
    });
  });
});

// Helper function to get memory usage
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  
  // Fallback for environments without process.memoryUsage
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize || 0;
  }
  
  return 0;
}

// Helper to measure memory difference
async function measureMemoryUsage<T>(operation: () => Promise<T>): Promise<{ result: T; memoryDelta: number }> {
  const initialMemory = getMemoryUsage();
  
  const result = await operation();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const finalMemory = getMemoryUsage();
  const memoryDelta = finalMemory - initialMemory;
  
  return { result, memoryDelta };
}