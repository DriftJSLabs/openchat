import type { Message } from './schema/shared';
import { getPerformanceOptimizer } from './performance-optimizer';
import { getDatabaseErrorHandler } from './error-handler';

export interface VirtualizationConfig {
  itemHeight: number; // Average height of message item in pixels
  bufferSize: number; // Number of items to render outside visible area
  preloadSize: number; // Number of items to preload for smooth scrolling
  maxCacheSize: number; // Maximum number of messages to keep in memory
  cleanupThreshold: number; // Trigger cleanup when cache exceeds this ratio
  estimatedItemHeight: number; // Used for dynamic height calculation
  overscan: number; // Additional items to render for performance
}

export interface VirtualizedMessage extends Message {
  index: number;
  height?: number;
  top?: number;
  isVisible: boolean;
  isPreloaded: boolean;
}

export interface VirtualScrollState {
  scrollTop: number;
  containerHeight: number;
  totalHeight: number;
  visibleStartIndex: number;
  visibleEndIndex: number;
  renderStartIndex: number;
  renderEndIndex: number;
}

export interface MessageRange {
  start: number;
  end: number;
  messages: VirtualizedMessage[];
}

/**
 * Efficient message virtualization system for handling large chat histories
 * Implements memory-efficient rendering and proper cleanup to prevent memory leaks
 */
export class MessageVirtualizationManager {
  private config: VirtualizationConfig;
  private performanceOptimizer = getPerformanceOptimizer();
  private errorHandler = getDatabaseErrorHandler();
  
  // Core virtualization data
  private messages = new Map<number, VirtualizedMessage>();
  private messageHeights = new Map<number, number>();
  private visibleMessages = new Set<number>();
  private preloadedMessages = new Set<number>();
  
  // Memory management
  private memoryUsage = 0;
  private maxMemoryUsage = 100 * 1024 * 1024; // 100MB limit
  private lastCleanup = Date.now();
  private cleanupInterval = 30000; // 30 seconds
  
  // Scroll state management
  private scrollState: VirtualScrollState = {
    scrollTop: 0,
    containerHeight: 0,
    totalHeight: 0,
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    renderStartIndex: 0,
    renderEndIndex: 0
  };
  
  // Performance monitoring
  private renderMetrics: {
    totalRenders: number;
    avgRenderTime: number;
    cacheHitRate: number;
    memoryPressure: number;
  } = {
    totalRenders: 0,
    avgRenderTime: 0,
    cacheHitRate: 0,
    memoryPressure: 0
  };
  
  // Message loader function
  private messageLoader: (start: number, count: number) => Promise<Message[]>;
  private totalMessageCount = 0;
  
  // Cleanup and optimization
  private cleanupTimer: NodeJS.Timeout | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(
    config: Partial<VirtualizationConfig>,
    messageLoader: (start: number, count: number) => Promise<Message[]>
  ) {
    this.config = {
      itemHeight: 60,
      bufferSize: 5,
      preloadSize: 20,
      maxCacheSize: 1000,
      cleanupThreshold: 0.8,
      estimatedItemHeight: 60,
      overscan: 2,
      ...config
    };
    
    this.messageLoader = messageLoader;
    this.setupCleanupScheduler();
    this.setupIntersectionObserver();
  }

  /**
   * Initialize virtualization with total message count
   */
  async initialize(totalCount: number): Promise<void> {
    this.totalMessageCount = totalCount;
    this.scrollState.totalHeight = totalCount * this.config.estimatedItemHeight;
    
    // Preload initial messages
    await this.loadInitialMessages();
  }

  /**
   * Update scroll position and recalculate visible range
   */
  async updateScrollPosition(scrollTop: number, containerHeight: number): Promise<MessageRange> {
    const startTime = performance.now();
    
    this.scrollState.scrollTop = scrollTop;
    this.scrollState.containerHeight = containerHeight;
    
    // Calculate visible range
    this.calculateVisibleRange();
    
    // Load any missing messages in the visible range
    await this.ensureMessagesLoaded();
    
    // Update memory usage and cleanup if needed
    this.updateMemoryUsage();
    
    if (this.shouldPerformCleanup()) {
      await this.performMemoryCleanup();
    }
    
    // Record performance metrics
    const renderTime = performance.now() - startTime;
    this.updateRenderMetrics(renderTime);
    
    // Return visible messages
    return this.getVisibleMessageRange();
  }

  /**
   * Get message by index with lazy loading
   */
  async getMessage(index: number): Promise<VirtualizedMessage | null> {
    if (index < 0 || index >= this.totalMessageCount) {
      return null;
    }
    
    // Check if message is already loaded
    let message = this.messages.get(index);
    if (message) {
      return message;
    }
    
    // Load message batch containing this index
    await this.loadMessageBatch(index);
    
    return this.messages.get(index) || null;
  }

  /**
   * Update message height for dynamic sizing
   */
  updateMessageHeight(index: number, height: number): void {
    this.messageHeights.set(index, height);
    
    const message = this.messages.get(index);
    if (message) {
      message.height = height;
      this.recalculateScrollPositions();
    }
  }

  /**
   * Invalidate cached messages and force reload
   */
  invalidateCache(): void {
    this.messages.clear();
    this.messageHeights.clear();
    this.visibleMessages.clear();
    this.preloadedMessages.clear();
    this.memoryUsage = 0;
  }

  /**
   * Get virtualization statistics
   */
  getStats(): {
    totalMessages: number;
    loadedMessages: number;
    visibleMessages: number;
    preloadedMessages: number;
    memoryUsage: number;
    maxMemoryUsage: number;
    renderMetrics: typeof this.renderMetrics;
    cacheEfficiency: number;
  } {
    return {
      totalMessages: this.totalMessageCount,
      loadedMessages: this.messages.size,
      visibleMessages: this.visibleMessages.size,
      preloadedMessages: this.preloadedMessages.size,
      memoryUsage: this.memoryUsage,
      maxMemoryUsage: this.maxMemoryUsage,
      renderMetrics: { ...this.renderMetrics },
      cacheEfficiency: this.calculateCacheEfficiency()
    };
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    
    this.invalidateCache();
  }

  // Private methods
  
  private async loadInitialMessages(): Promise<void> {
    const initialLoadSize = Math.min(
      this.config.preloadSize,
      this.totalMessageCount
    );
    
    if (initialLoadSize > 0) {
      await this.loadMessageBatch(0, initialLoadSize);
    }
  }

  private calculateVisibleRange(): void {
    const { scrollTop, containerHeight } = this.scrollState;
    const { itemHeight, bufferSize, overscan } = this.config;
    
    // Calculate visible indices based on scroll position
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);
    
    // Add buffer for smooth scrolling
    this.scrollState.visibleStartIndex = Math.max(0, startIndex - bufferSize);
    this.scrollState.visibleEndIndex = Math.min(this.totalMessageCount - 1, endIndex + bufferSize);
    
    // Calculate render range with overscan
    this.scrollState.renderStartIndex = Math.max(0, startIndex - overscan);
    this.scrollState.renderEndIndex = Math.min(this.totalMessageCount - 1, endIndex + overscan);
  }

  private async ensureMessagesLoaded(): Promise<void> {
    const { renderStartIndex, renderEndIndex } = this.scrollState;
    const messagesToLoad: number[] = [];
    
    // Find missing messages in render range
    for (let i = renderStartIndex; i <= renderEndIndex; i++) {
      if (!this.messages.has(i)) {
        messagesToLoad.push(i);
      }
    }
    
    if (messagesToLoad.length === 0) {
      return;
    }
    
    // Group consecutive indices into batches
    const batches = this.groupIntoBatches(messagesToLoad);
    
    // Load batches in parallel
    await Promise.all(batches.map(batch => this.loadMessageBatch(batch.start, batch.count)));
  }

  private async loadMessageBatch(startIndex: number, count?: number): Promise<void> {
    const batchSize = count || this.config.preloadSize;
    const endIndex = Math.min(startIndex + batchSize, this.totalMessageCount);
    const actualCount = endIndex - startIndex;
    
    if (actualCount <= 0) {
      return;
    }
    
    try {
      const messages = await this.messageLoader(startIndex, actualCount);
      
      // Convert to virtualized messages and cache them
      messages.forEach((message, offset) => {
        const index = startIndex + offset;
        const virtualizedMessage: VirtualizedMessage = {
          ...message,
          index,
          height: this.messageHeights.get(index) || this.config.estimatedItemHeight,
          isVisible: this.isIndexVisible(index),
          isPreloaded: true
        };
        
        this.messages.set(index, virtualizedMessage);
        this.preloadedMessages.add(index);
        
        // Update memory usage
        this.memoryUsage += this.estimateMessageMemoryUsage(virtualizedMessage);
      });
      
    } catch (error) {
      this.errorHandler.handleError(error, {
        operation: 'loadMessageBatch',
        startIndex,
        count: actualCount
      });
    }
  }

  private groupIntoBatches(indices: number[]): Array<{ start: number; count: number }> {
    if (indices.length === 0) return [];
    
    indices.sort((a, b) => a - b);
    const batches: Array<{ start: number; count: number }> = [];
    let currentStart = indices[0];
    let currentCount = 1;
    
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === indices[i - 1] + 1) {
        // Consecutive index, extend current batch
        currentCount++;
      } else {
        // Gap found, start new batch
        batches.push({ start: currentStart, count: currentCount });
        currentStart = indices[i];
        currentCount = 1;
      }
    }
    
    // Add the last batch
    batches.push({ start: currentStart, count: currentCount });
    
    return batches;
  }

  private getVisibleMessageRange(): MessageRange {
    const { renderStartIndex, renderEndIndex } = this.scrollState;
    const messages: VirtualizedMessage[] = [];
    
    for (let i = renderStartIndex; i <= renderEndIndex; i++) {
      const message = this.messages.get(i);
      if (message) {
        message.isVisible = this.isIndexVisible(i);
        messages.push(message);
      }
    }
    
    return {
      start: renderStartIndex,
      end: renderEndIndex,
      messages
    };
  }

  private isIndexVisible(index: number): boolean {
    return index >= this.scrollState.visibleStartIndex && 
           index <= this.scrollState.visibleEndIndex;
  }

  private recalculateScrollPositions(): void {
    let totalHeight = 0;
    
    for (let i = 0; i < this.totalMessageCount; i++) {
      const height = this.messageHeights.get(i) || this.config.estimatedItemHeight;
      const message = this.messages.get(i);
      
      if (message) {
        message.top = totalHeight;
        message.height = height;
      }
      
      totalHeight += height;
    }
    
    this.scrollState.totalHeight = totalHeight;
  }

  private updateMemoryUsage(): void {
    this.memoryUsage = Array.from(this.messages.values())
      .reduce((total, message) => total + this.estimateMessageMemoryUsage(message), 0);
  }

  private estimateMessageMemoryUsage(message: VirtualizedMessage): number {
    // Rough estimation: 
    // - Base object overhead: 200 bytes
    // - Content size: content length * 2 (UTF-16)
    // - Additional properties: 100 bytes
    return 300 + (message.content?.length || 0) * 2;
  }

  private shouldPerformCleanup(): boolean {
    const memoryPressure = this.memoryUsage / this.maxMemoryUsage;
    const timeSinceLastCleanup = Date.now() - this.lastCleanup;
    
    return memoryPressure > this.config.cleanupThreshold || 
           timeSinceLastCleanup > this.cleanupInterval;
  }

  private async performMemoryCleanup(): Promise<void> {
    const { visibleStartIndex, visibleEndIndex } = this.scrollState;
    const keepBuffer = this.config.bufferSize * 2; // Keep extra buffer
    
    // Determine which messages to keep
    const keepStart = Math.max(0, visibleStartIndex - keepBuffer);
    const keepEnd = Math.min(this.totalMessageCount - 1, visibleEndIndex + keepBuffer);
    
    // Remove messages outside the keep range
    for (const [index, message] of this.messages.entries()) {
      if (index < keepStart || index > keepEnd) {
        this.memoryUsage -= this.estimateMessageMemoryUsage(message);
        this.messages.delete(index);
        this.preloadedMessages.delete(index);
        this.visibleMessages.delete(index);
      }
    }
    
    this.lastCleanup = Date.now();
  }

  private setupCleanupScheduler(): void {
    this.cleanupTimer = setInterval(async () => {
      if (this.shouldPerformCleanup()) {
        await this.performMemoryCleanup();
      }
    }, this.cleanupInterval);
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return; // Not available in this environment
    }
    
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const index = parseInt(entry.target.getAttribute('data-message-index') || '0');
          
          if (entry.isIntersecting) {
            this.visibleMessages.add(index);
          } else {
            this.visibleMessages.delete(index);
          }
        });
      },
      {
        root: null,
        rootMargin: '50px', // Preload 50px before entering viewport
        threshold: 0.1
      }
    );
  }

  private updateRenderMetrics(renderTime: number): void {
    this.renderMetrics.totalRenders++;
    
    // Update average render time (exponential moving average)
    const alpha = 0.1;
    this.renderMetrics.avgRenderTime = 
      this.renderMetrics.avgRenderTime * (1 - alpha) + renderTime * alpha;
    
    // Update cache hit rate
    const visibleRange = this.scrollState.visibleEndIndex - this.scrollState.visibleStartIndex + 1;
    const cacheHits = this.visibleMessages.size;
    this.renderMetrics.cacheHitRate = visibleRange > 0 ? cacheHits / visibleRange : 0;
    
    // Update memory pressure
    this.renderMetrics.memoryPressure = this.memoryUsage / this.maxMemoryUsage;
  }

  private calculateCacheEfficiency(): number {
    if (this.messages.size === 0) return 0;
    
    const utilizationRate = this.visibleMessages.size / this.messages.size;
    const memoryEfficiency = 1 - (this.memoryUsage / this.maxMemoryUsage);
    
    return (utilizationRate + memoryEfficiency) / 2;
  }
}

/**
 * Factory function to create message virtualization manager
 */
export function createMessageVirtualization(
  config: Partial<VirtualizationConfig>,
  messageLoader: (start: number, count: number) => Promise<Message[]>
): MessageVirtualizationManager {
  return new MessageVirtualizationManager(config, messageLoader);
}

/**
 * React hook for message virtualization (if using React)
 */
export function useMessageVirtualization(
  totalCount: number,
  messageLoader: (start: number, count: number) => Promise<Message[]>,
  config?: Partial<VirtualizationConfig>
) {
  // This would be implemented as a React hook in a React environment
  // For now, we'll just return the manager factory
  return createMessageVirtualization(config || {}, messageLoader);
}