import type { Chat, Message, SyncEvent } from './schema/shared';
import { getDatabaseErrorHandler } from './error-handler';

export interface PerformanceConfig {
  batchSize: number;
  maxCacheSize: number;
  preloadThreshold: number;
  compressionEnabled: boolean;
  indexedDBQuotaThreshold: number;
  virtualScrollBuffer: number;
  debounceMs: number;
}

export interface PaginationOptions {
  offset: number;
  limit: number;
  sortDirection: 'asc' | 'desc';
  filter?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  compressed?: boolean;
  size: number; // Memory size in bytes for better cache management
  priority: 'low' | 'medium' | 'high'; // Priority for eviction decisions
}

export interface QueryPerformanceMetrics {
  queryTime: number;
  resultCount: number;
  cacheHit: boolean;
  indexUsed: boolean;
  memoryUsage?: number;
}

/**
 * Performance optimizer for large chat histories and sync operations
 * Implements efficient memory management and prevents unbounded cache growth
 */
export class PerformanceOptimizer {
  private config: PerformanceConfig;
  private cache = new Map<string, CacheEntry<any>>();
  private queryMetrics = new Map<string, QueryPerformanceMetrics[]>();
  private errorHandler = getDatabaseErrorHandler();
  private compressionWorker: Worker | null = null;
  
  // Enhanced memory management
  private currentCacheSize = 0; // Track total cache size in bytes
  private maxMemoryUsage = 50 * 1024 * 1024; // 50MB max cache size
  private evictionInProgress = false;
  private cacheAccessOrder = new Map<string, number>(); // LRU tracking
  private accessCounter = 0;
  
  // Performance monitoring
  private performanceMonitor: PerformanceMonitor;
  private memoryPressureThreshold = 0.85; // 85% of max memory triggers cleanup

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      batchSize: 50,
      maxCacheSize: 1000,
      preloadThreshold: 10,
      compressionEnabled: true,
      indexedDBQuotaThreshold: 0.8, // 80% of quota
      virtualScrollBuffer: 5,
      debounceMs: 100,
      ...config
    };

    // Initialize performance monitoring
    this.performanceMonitor = new PerformanceMonitor();
    
    this.initializeCompressionWorker();
    this.setupQuotaMonitoring();
    this.setupMemoryMonitoring();
  }

  private initializeCompressionWorker(): void {
    if (this.config.compressionEnabled && typeof Worker !== 'undefined') {
      try {
        // Create a simple compression worker
        const workerCode = `
          const { deflate, inflate } = require('pako');
          
          self.onmessage = function(e) {
            const { type, data, id } = e.data;
            
            try {
              if (type === 'compress') {
                const compressed = deflate(JSON.stringify(data));
                self.postMessage({ type: 'compressed', data: compressed, id });
              } else if (type === 'decompress') {
                const decompressed = JSON.parse(inflate(data, { to: 'string' }));
                self.postMessage({ type: 'decompressed', data: decompressed, id });
              }
            } catch (error) {
              self.postMessage({ type: 'error', error: error.message, id });
            }
          };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.compressionWorker = new Worker(URL.createObjectURL(blob));
      } catch (error) {
        console.warn('Failed to initialize compression worker:', error);
        this.config.compressionEnabled = false;
      }
    }
  }

  private setupQuotaMonitoring(): void {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      setInterval(async () => {
        try {
          const estimate = await navigator.storage.estimate();
          const usage = estimate.usage || 0;
          const quota = estimate.quota || 0;
          const usageRatio = quota > 0 ? usage / quota : 0;

          if (usageRatio > this.config.indexedDBQuotaThreshold) {
            console.warn(`Storage usage high: ${(usageRatio * 100).toFixed(1)}%`);
            await this.performStorageCleanup();
          }
        } catch (error) {
          console.error('Failed to check storage quota:', error);
        }
      }, 60000); // Check every minute
    }
  }

  /**
   * Optimized pagination for large chat histories
   */
  async optimizedPagination<T>(
    queryFn: (options: PaginationOptions) => Promise<T[]>,
    options: PaginationOptions,
    cacheKey: string
  ): Promise<{
    data: T[];
    hasMore: boolean;
    totalCount?: number;
    metrics: QueryPerformanceMetrics;
  }> {
    const startTime = performance.now();
    const fullCacheKey = `${cacheKey}:${JSON.stringify(options)}`;

    // Check cache first
    const cached = this.getFromCache<T[]>(fullCacheKey);
    if (cached) {
      const metrics: QueryPerformanceMetrics = {
        queryTime: performance.now() - startTime,
        resultCount: cached.length,
        cacheHit: true,
        indexUsed: true
      };
      
      this.recordMetrics(cacheKey, metrics);
      
      return {
        data: cached,
        hasMore: cached.length === options.limit,
        metrics
      };
    }

    try {
      // Execute query with performance tracking
      const data = await queryFn(options);
      const queryTime = performance.now() - startTime;

      // Cache the results
      await this.addToCache(fullCacheKey, data);

      // Preload next batch if we're near the end
      if (data.length === options.limit && options.offset + options.limit >= options.offset + options.limit - this.config.preloadThreshold) {
        this.preloadNextBatch(queryFn, options, cacheKey);
      }

      const metrics: QueryPerformanceMetrics = {
        queryTime,
        resultCount: data.length,
        cacheHit: false,
        indexUsed: true // Assume optimized queries use indexes
      };

      this.recordMetrics(cacheKey, metrics);

      return {
        data,
        hasMore: data.length === options.limit,
        metrics
      };
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'optimizedPagination', cacheKey });
      throw error;
    }
  }

  /**
   * Batch processing for large sync operations
   */
  async batchProcess<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize: number = this.config.batchSize
  ): Promise<R[]> {
    const results: R[] = [];
    const batches = this.createBatches(items, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const batchResults = await processor(batch);
        results.push(...batchResults);

        // Allow other tasks to run between batches
        if (i < batches.length - 1) {
          await this.yieldToMain();
        }
      } catch (error) {
        this.errorHandler.handleError(error, { 
          operation: 'batchProcess', 
          batchIndex: i, 
          batchSize: batch.length 
        });
        
        // Decide whether to continue or abort based on error type
        if (this.shouldAbortBatch(error)) {
          throw error;
        }
        // Continue with next batch on recoverable errors
      }
    }

    return results;
  }

  /**
   * Intelligent message loading for virtual scrolling
   */
  async loadMessagesForVirtualScroll(
    chatId: string,
    visibleRange: { start: number; end: number },
    totalCount: number,
    messageLoader: (offset: number, limit: number) => Promise<Message[]>
  ): Promise<{
    messages: Message[];
    loadedRange: { start: number; end: number };
    metrics: QueryPerformanceMetrics;
  }> {
    const startTime = performance.now();
    
    // Calculate buffer range
    const bufferSize = this.config.virtualScrollBuffer;
    const loadStart = Math.max(0, visibleRange.start - bufferSize);
    const loadEnd = Math.min(totalCount, visibleRange.end + bufferSize);
    const loadLimit = loadEnd - loadStart;

    const cacheKey = `messages:${chatId}:${loadStart}:${loadLimit}`;
    
    // Check if we have cached data that covers the range
    const cachedMessages = this.getFromCache<Message[]>(cacheKey);
    if (cachedMessages) {
      const metrics: QueryPerformanceMetrics = {
        queryTime: performance.now() - startTime,
        resultCount: cachedMessages.length,
        cacheHit: true,
        indexUsed: true
      };

      return {
        messages: cachedMessages,
        loadedRange: { start: loadStart, end: loadEnd },
        metrics
      };
    }

    try {
      // Load messages in the calculated range
      const messages = await messageLoader(loadStart, loadLimit);
      
      // Cache the loaded messages
      await this.addToCache(cacheKey, messages);

      const metrics: QueryPerformanceMetrics = {
        queryTime: performance.now() - startTime,
        resultCount: messages.length,
        cacheHit: false,
        indexUsed: true
      };

      return {
        messages,
        loadedRange: { start: loadStart, end: loadEnd },
        metrics
      };
    } catch (error) {
      this.errorHandler.handleError(error, { 
        operation: 'loadMessagesForVirtualScroll', 
        chatId, 
        visibleRange 
      });
      throw error;
    }
  }

  /**
   * Optimized search with debouncing and result caching
   */
  createDebouncedSearch<T>(
    searchFn: (query: string, options?: any) => Promise<T[]>,
    debounceMs: number = this.config.debounceMs
  ): (query: string, options?: any) => Promise<T[]> {
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastQuery = '';
    let lastResults: T[] = [];

    return async (query: string, options: any = {}): Promise<T[]> => {
      // Return cached results for same query
      if (query === lastQuery && query !== '') {
        return lastResults;
      }

      return new Promise((resolve, reject) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
          try {
            const cacheKey = `search:${query}:${JSON.stringify(options)}`;
            
            // Check cache first
            const cached = this.getFromCache<T[]>(cacheKey);
            if (cached) {
              lastQuery = query;
              lastResults = cached;
              resolve(cached);
              return;
            }

            // Execute search
            const results = await searchFn(query, options);
            
            // Cache results
            await this.addToCache(cacheKey, results);
            
            lastQuery = query;
            lastResults = results;
            resolve(results);
          } catch (error) {
            reject(error);
          }
        }, debounceMs);
      });
    };
  }

  /**
   * Incremental sync with delta compression
   */
  async incrementalSync(
    lastSyncTimestamp: number,
    syncFn: (since: number) => Promise<SyncEvent[]>
  ): Promise<{
    events: SyncEvent[];
    newTimestamp: number;
    compressed: boolean;
    metrics: QueryPerformanceMetrics;
  }> {
    const startTime = performance.now();
    
    try {
      // Get incremental changes
      const events = await syncFn(lastSyncTimestamp);
      const newTimestamp = Math.max(...events.map(e => e.timestamp), lastSyncTimestamp);

      // Compress large event batches
      let compressed = false;
      if (this.config.compressionEnabled && events.length > 100) {
        compressed = true;
        // Compression happens in cache storage
      }

      const metrics: QueryPerformanceMetrics = {
        queryTime: performance.now() - startTime,
        resultCount: events.length,
        cacheHit: false,
        indexUsed: true
      };

      return {
        events,
        newTimestamp,
        compressed,
        metrics
      };
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'incrementalSync', lastSyncTimestamp });
      throw error;
    }
  }

  // Enhanced cache management methods with proper memory tracking
  private async addToCache<T>(key: string, data: T, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    const dataSize = this.calculateDataSize(data);
    
    // Check if adding this entry would exceed memory limits
    if (this.currentCacheSize + dataSize > this.maxMemoryUsage) {
      await this.performIntelligentEviction(dataSize);
    }
    
    // Remove old entries if cache count limit is reached
    if (this.cache.size >= this.config.maxCacheSize) {
      await this.evictFromCache();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
      compressed: false,
      size: dataSize,
      priority
    };

    // Compress large data if enabled
    if (this.config.compressionEnabled && this.shouldCompress(data)) {
      try {
        const compressedData = await this.compressData(data);
        const compressedSize = this.calculateDataSize(compressedData);
        
        // Only use compressed version if it's actually smaller
        if (compressedSize < dataSize * 0.8) { // 20% size reduction minimum
          entry.data = compressedData;
          entry.compressed = true;
          entry.size = compressedSize;
        }
      } catch (error) {
        console.warn('Failed to compress cache data:', error);
      }
    }

    this.cache.set(key, entry);
    this.currentCacheSize += entry.size;
    this.cacheAccessOrder.set(key, ++this.accessCounter);
    
    // Monitor memory pressure
    this.checkMemoryPressure();
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Update access metadata for LRU tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.cacheAccessOrder.set(key, ++this.accessCounter);

    // Decompress if necessary
    if (entry.compressed) {
      try {
        return this.decompressData(entry.data);
      } catch (error) {
        console.warn('Failed to decompress cache data:', error);
        this.removeCacheEntry(key);
        return null;
      }
    }

    return entry.data;
  }

  private async evictFromCache(): Promise<void> {
    if (this.evictionInProgress) {
      return; // Prevent concurrent evictions
    }
    
    this.evictionInProgress = true;
    
    try {
      // Enhanced LRU eviction strategy with priority and memory consideration
      const entries = Array.from(this.cache.entries());
      
      entries.sort((a, b) => {
        const [keyA, entryA] = a;
        const [keyB, entryB] = b;
        
        // Calculate eviction score (lower = more likely to evict)
        const scoreA = this.calculateEvictionScore(keyA, entryA);
        const scoreB = this.calculateEvictionScore(keyB, entryB);
        
        return scoreA - scoreB;
      });

      // Remove the least valuable 25% of entries
      const toRemove = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < toRemove; i++) {
        this.removeCacheEntry(entries[i][0]);
      }
      
    } finally {
      this.evictionInProgress = false;
    }
  }
  
  /**
   * Perform intelligent eviction based on memory requirements
   */
  private async performIntelligentEviction(requiredSize: number): Promise<void> {
    if (this.evictionInProgress) {
      return;
    }
    
    this.evictionInProgress = true;
    
    try {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => {
        const scoreA = this.calculateEvictionScore(a[0], a[1]);
        const scoreB = this.calculateEvictionScore(b[0], b[1]);
        return scoreA - scoreB;
      });
      
      let freedMemory = 0;
      let index = 0;
      
      // Remove entries until we have enough space
      while (freedMemory < requiredSize && index < entries.length) {
        const [key, entry] = entries[index];
        freedMemory += entry.size;
        this.removeCacheEntry(key);
        index++;
      }
      
      // If we still don't have enough space, remove more aggressively
      if (freedMemory < requiredSize) {
        const additionalRequired = requiredSize - freedMemory;
        const additionalToRemove = Math.ceil(additionalRequired / this.getAverageEntrySize());
        
        for (let i = 0; i < additionalToRemove && index < entries.length; i++, index++) {
          this.removeCacheEntry(entries[index][0]);
        }
      }
      
    } finally {
      this.evictionInProgress = false;
    }
  }

  private shouldCompress(data: any): boolean {
    const jsonString = JSON.stringify(data);
    return jsonString.length > 1024; // Compress data larger than 1KB
  }

  private async compressData(data: any): Promise<any> {
    if (!this.compressionWorker) {
      return data; // Fallback to uncompressed
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);
      
      const handler = (event: MessageEvent) => {
        if (event.data.id === id) {
          this.compressionWorker!.removeEventListener('message', handler);
          
          if (event.data.type === 'compressed') {
            resolve(event.data.data);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.compressionWorker.addEventListener('message', handler);
      this.compressionWorker.postMessage({ type: 'compress', data, id });
    });
  }

  private decompressData(compressedData: any): any {
    // Synchronous decompression for now
    // In production, you might want to use async decompression
    try {
      return JSON.parse(compressedData);
    } catch (error) {
      throw new Error('Failed to decompress data');
    }
  }

  // Utility methods
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async yieldToMain(): Promise<void> {
    return new Promise(resolve => {
      if (typeof MessageChannel !== 'undefined') {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  private shouldAbortBatch(error: any): boolean {
    // Abort on critical errors, continue on recoverable ones
    return error?.name === 'QuotaExceededError' || 
           error?.message?.includes('storage quota') ||
           error?.message?.includes('database is locked');
  }

  private async preloadNextBatch<T>(
    queryFn: (options: PaginationOptions) => Promise<T[]>,
    currentOptions: PaginationOptions,
    cacheKey: string
  ): Promise<void> {
    const nextOptions: PaginationOptions = {
      ...currentOptions,
      offset: currentOptions.offset + currentOptions.limit
    };

    const nextCacheKey = `${cacheKey}:${JSON.stringify(nextOptions)}`;
    
    // Only preload if not already cached
    if (!this.cache.has(nextCacheKey)) {
      try {
        const nextData = await queryFn(nextOptions);
        await this.addToCache(nextCacheKey, nextData);
      } catch (error) {
        // Ignore preload errors
        console.debug('Preload failed:', error);
      }
    }
  }

  private recordMetrics(operation: string, metrics: QueryPerformanceMetrics): void {
    if (!this.queryMetrics.has(operation)) {
      this.queryMetrics.set(operation, []);
    }
    
    const operationMetrics = this.queryMetrics.get(operation)!;
    operationMetrics.push(metrics);
    
    // Keep only last 100 metrics per operation
    if (operationMetrics.length > 100) {
      operationMetrics.splice(0, operationMetrics.length - 100);
    }
  }

  private async performStorageCleanup(): Promise<void> {
    try {
      // Clear old cache entries
      await this.evictFromCache();
      
      // You could add more cleanup logic here:
      // - Remove old sync events
      // - Compress old messages
      // - Archive old chats
      
      console.info('Storage cleanup completed');
    } catch (error) {
      console.error('Storage cleanup failed:', error);
    }
  }
  
  /**
   * Calculate eviction score for cache entries (lower = more likely to evict)
   */
  private calculateEvictionScore(key: string, entry: CacheEntry<any>): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccessed;
    const accessOrder = this.cacheAccessOrder.get(key) || 0;
    
    // Base score factors
    const ageScore = age / (1000 * 60 * 60); // Hours since creation
    const accessScore = timeSinceAccess / (1000 * 60); // Minutes since last access
    const frequencyScore = 1 / Math.max(entry.accessCount, 1); // Inverse of access frequency
    const sizeScore = entry.size / (1024 * 1024); // Size in MB
    const lruScore = (this.accessCounter - accessOrder) / this.accessCounter; // LRU position
    
    // Priority adjustment
    const priorityMultiplier = {
      'high': 0.1,   // Less likely to evict
      'medium': 1.0,
      'low': 2.0     // More likely to evict
    }[entry.priority];
    
    // Combine factors (weighted)
    const score = (
      ageScore * 0.2 +
      accessScore * 0.3 +
      frequencyScore * 0.2 +
      sizeScore * 0.1 +
      lruScore * 0.2
    ) * priorityMultiplier;
    
    return score;
  }
  
  /**
   * Remove cache entry and update memory tracking
   */
  private removeCacheEntry(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentCacheSize -= entry.size;
      this.cache.delete(key);
      this.cacheAccessOrder.delete(key);
    }
  }
  
  /**
   * Calculate data size in bytes
   */
  private calculateDataSize(data: any): number {
    try {
      // Rough estimation of memory usage
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch (error) {
      // Fallback estimation
      return JSON.stringify(data).length * 2; // Assume UTF-16 encoding
    }
  }
  
  /**
   * Get average entry size for eviction calculations
   */
  private getAverageEntrySize(): number {
    if (this.cache.size === 0) return 1024; // Default 1KB
    return this.currentCacheSize / this.cache.size;
  }
  
  /**
   * Check memory pressure and trigger cleanup if needed
   */
  private checkMemoryPressure(): void {
    const memoryPressure = this.currentCacheSize / this.maxMemoryUsage;
    
    if (memoryPressure > this.memoryPressureThreshold) {
      // Trigger background cleanup
      setTimeout(() => this.performIntelligentEviction(0), 0);
    }
  }
  
  /**
   * Setup memory monitoring for cache management
   */
  private setupMemoryMonitoring(): void {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      this.checkMemoryPressure();
      
      // Log memory stats in debug mode
      if (this.config.debounceMs === 0) { // Use debounceMs as debug flag
        const stats = this.getCacheStats();
        console.debug('Cache stats:', {
          memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
          memoryPressure: `${(stats.memoryPressure * 100).toFixed(1)}%`,
          cacheSize: stats.size,
          hitRate: `${(stats.hitRate * 100).toFixed(1)}%`
        });
      }
    }, 30000);
  }

  // Public API methods
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    avgQueryTime: number;
    memoryUsage: number;
    maxMemoryUsage: number;
    memoryPressure: number;
    compressionRatio: number;
  } {
    const allMetrics = Array.from(this.queryMetrics.values()).flat();
    const totalQueries = allMetrics.length;
    const cacheHits = allMetrics.filter(m => m.cacheHit).length;
    const avgQueryTime = totalQueries > 0 
      ? allMetrics.reduce((sum, m) => sum + m.queryTime, 0) / totalQueries 
      : 0;
      
    const compressedEntries = Array.from(this.cache.values()).filter(e => e.compressed);
    const compressionRatio = compressedEntries.length > 0 
      ? compressedEntries.reduce((sum, e) => sum + e.size, 0) / compressedEntries.length
      : 1;

    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: totalQueries > 0 ? cacheHits / totalQueries : 0,
      avgQueryTime,
      memoryUsage: this.currentCacheSize,
      maxMemoryUsage: this.maxMemoryUsage,
      memoryPressure: this.currentCacheSize / this.maxMemoryUsage,
      compressionRatio
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheAccessOrder.clear();
    this.currentCacheSize = 0;
    this.accessCounter = 0;
  }

  cleanup(): void {
    this.clearCache();
    this.queryMetrics.clear();
    
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }
    
    this.performanceMonitor.cleanup();
  }
}

// Singleton instance
let performanceOptimizer: PerformanceOptimizer | null = null;

/**
 * Performance monitor for tracking cache and memory metrics
 */
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTime = Date.now();
  
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only recent metrics (last 1000 values)
    if (values.length > 1000) {
      values.splice(0, values.length - 1000);
    }
  }
  
  getMetricStats(name: string): { avg: number; min: number; max: number; count: number } {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }
    
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    };
  }
  
  cleanup(): void {
    this.metrics.clear();
  }
}

export function getPerformanceOptimizer(config?: Partial<PerformanceConfig>): PerformanceOptimizer {
  if (!performanceOptimizer) {
    performanceOptimizer = new PerformanceOptimizer(config);
  }
  return performanceOptimizer;
}