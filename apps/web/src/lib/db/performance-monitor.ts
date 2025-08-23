import { getDatabaseErrorHandler } from './error-handler';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percentage' | 'ratio';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  timestamp: number;
  message: string;
}

export interface SystemResourceUsage {
  memory: {
    used: number;
    total: number;
    pressure: number;
  };
  cpu: {
    usage: number;
    loadAverage?: number[];
  };
  storage: {
    used: number;
    available: number;
    quota: number;
  };
  network: {
    latency: number;
    bandwidth: number;
    effectiveType: string;
  };
}

export interface DatabasePerformanceMetrics {
  queries: {
    total: number;
    avgDuration: number;
    slowQueries: number;
    errorRate: number;
  };
  cache: {
    hitRate: number;
    size: number;
    memoryUsage: number;
    evictions: number;
  };
  sync: {
    operations: number;
    conflicts: number;
    avgSyncTime: number;
    errorRate: number;
  };
  virtualization: {
    renderTime: number;
    cacheEfficiency: number;
    memoryPressure: number;
    loadedMessages: number;
  };
}

/**
 * Comprehensive performance monitoring system for database and application metrics
 * Tracks system resources, database performance, and user experience metrics
 */
export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric[]>();
  private thresholds = new Map<string, PerformanceThreshold>();
  private alerts: PerformanceAlert[] = [];
  private errorHandler = getDatabaseErrorHandler();
  
  // Configuration
  private config = {
    maxMetricsPerType: 1000,
    metricsRetentionTime: 24 * 60 * 60 * 1000, // 24 hours
    alertRetentionTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    collectionInterval: 5000, // 5 seconds
    reportingInterval: 60000, // 1 minute
    enableAutoCollection: true,
    enableAlerting: true
  };
  
  // Auto collection timers
  private collectionTimer: NodeJS.Timeout | null = null;
  private reportingTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Performance observers
  private performanceObserver: PerformanceObserver | null = null;
  private memoryObserver: any = null; // MemoryObserver when available
  
  // Reporting callbacks
  private reportingCallbacks = new Set<(metrics: DatabasePerformanceMetrics) => void>();
  private alertCallbacks = new Set<(alert: PerformanceAlert) => void>();

  constructor() {
    this.setupDefaultThresholds();
    this.setupPerformanceObservation();
    
    if (this.config.enableAutoCollection) {
      this.startAutoCollection();
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, unit: PerformanceMetric['unit'], tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags
    };
    
    // Store metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const metricsList = this.metrics.get(name)!;
    metricsList.push(metric);
    
    // Limit metrics storage to prevent memory issues
    if (metricsList.length > this.config.maxMetricsPerType) {
      metricsList.splice(0, metricsList.length - this.config.maxMetricsPerType);
    }
    
    // Check thresholds and generate alerts
    if (this.config.enableAlerting) {
      this.checkThresholds(metric);
    }
  }

  /**
   * Record database query performance
   */
  recordQuery(duration: number, success: boolean, query?: string, resultCount?: number): void {
    this.recordMetric('db.query.duration', duration, 'ms', {
      success: success.toString(),
      query: query?.substring(0, 50) || 'unknown'
    });
    
    if (resultCount !== undefined) {
      this.recordMetric('db.query.resultCount', resultCount, 'count');
    }
    
    if (!success) {
      this.recordMetric('db.query.errors', 1, 'count');
    }
    
    // Track slow queries
    if (duration > 1000) { // Queries taking more than 1 second
      this.recordMetric('db.query.slow', 1, 'count');
    }
  }

  /**
   * Record cache performance
   */
  recordCacheOperation(operation: 'hit' | 'miss' | 'eviction', size?: number): void {
    this.recordMetric(`cache.${operation}`, 1, 'count');
    
    if (size !== undefined) {
      this.recordMetric('cache.size', size, 'bytes');
    }
  }

  /**
   * Record sync operation performance
   */
  recordSyncOperation(duration: number, success: boolean, conflicts: number, dataSize: number): void {
    this.recordMetric('sync.duration', duration, 'ms');
    this.recordMetric('sync.conflicts', conflicts, 'count');
    this.recordMetric('sync.dataSize', dataSize, 'bytes');
    
    if (!success) {
      this.recordMetric('sync.errors', 1, 'count');
    }
  }

  /**
   * Record virtualization performance
   */
  recordVirtualizationMetrics(renderTime: number, cacheEfficiency: number, memoryPressure: number): void {
    this.recordMetric('virtualization.renderTime', renderTime, 'ms');
    this.recordMetric('virtualization.cacheEfficiency', cacheEfficiency, 'ratio');
    this.recordMetric('virtualization.memoryPressure', memoryPressure, 'ratio');
  }

  /**
   * Get system resource usage
   */
  async getSystemResourceUsage(): Promise<SystemResourceUsage> {
    const resources: SystemResourceUsage = {
      memory: await this.getMemoryUsage(),
      cpu: await this.getCPUUsage(),
      storage: await this.getStorageUsage(),
      network: await this.getNetworkMetrics()
    };
    
    // Record as metrics
    this.recordMetric('system.memory.used', resources.memory.used, 'bytes');
    this.recordMetric('system.memory.pressure', resources.memory.pressure, 'ratio');
    this.recordMetric('system.cpu.usage', resources.cpu.usage, 'percentage');
    this.recordMetric('system.storage.used', resources.storage.used, 'bytes');
    this.recordMetric('system.network.latency', resources.network.latency, 'ms');
    
    return resources;
  }

  /**
   * Get database performance summary
   */
  getDatabasePerformanceMetrics(): DatabasePerformanceMetrics {
    const now = Date.now();
    const timeWindow = 5 * 60 * 1000; // Last 5 minutes
    
    return {
      queries: {
        total: this.getMetricCount('db.query.duration', timeWindow),
        avgDuration: this.getMetricAverage('db.query.duration', timeWindow),
        slowQueries: this.getMetricCount('db.query.slow', timeWindow),
        errorRate: this.calculateErrorRate('db.query.errors', 'db.query.duration', timeWindow)
      },
      cache: {
        hitRate: this.calculateCacheHitRate(timeWindow),
        size: this.getMetricLatest('cache.size') || 0,
        memoryUsage: this.getMetricLatest('cache.memoryUsage') || 0,
        evictions: this.getMetricCount('cache.eviction', timeWindow)
      },
      sync: {
        operations: this.getMetricCount('sync.duration', timeWindow),
        conflicts: this.getMetricSum('sync.conflicts', timeWindow),
        avgSyncTime: this.getMetricAverage('sync.duration', timeWindow),
        errorRate: this.calculateErrorRate('sync.errors', 'sync.duration', timeWindow)
      },
      virtualization: {
        renderTime: this.getMetricAverage('virtualization.renderTime', timeWindow),
        cacheEfficiency: this.getMetricAverage('virtualization.cacheEfficiency', timeWindow),
        memoryPressure: this.getMetricAverage('virtualization.memoryPressure', timeWindow),
        loadedMessages: this.getMetricLatest('virtualization.loadedMessages') || 0
      }
    };
  }

  /**
   * Set performance threshold
   */
  setThreshold(metric: string, warning: number, critical: number, unit: string): void {
    this.thresholds.set(metric, { metric, warning, critical, unit });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    const cutoff = Date.now() - this.config.alertRetentionTime;
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Subscribe to performance reports
   */
  onReport(callback: (metrics: DatabasePerformanceMetrics) => void): () => void {
    this.reportingCallbacks.add(callback);
    return () => this.reportingCallbacks.delete(callback);
  }

  /**
   * Subscribe to alerts
   */
  onAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    this.startAutoCollection();
    this.startReporting();
    this.startCleanup();
  }

  /**
   * Stop monitoring and cleanup
   */
  stopMonitoring(): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }
    
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
      this.reportingTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(timeWindow?: number): Record<string, PerformanceMetric[]> {
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;
    const exported: Record<string, PerformanceMetric[]> = {};
    
    for (const [name, metrics] of this.metrics.entries()) {
      exported[name] = metrics.filter(metric => metric.timestamp > cutoff);
    }
    
    return exported;
  }

  // Private methods
  
  private setupDefaultThresholds(): void {
    // Database thresholds
    this.setThreshold('db.query.duration', 500, 2000, 'ms');
    this.setThreshold('db.query.slow', 5, 20, 'count');
    this.setThreshold('cache.memoryUsage', 50 * 1024 * 1024, 100 * 1024 * 1024, 'bytes');
    this.setThreshold('sync.duration', 5000, 15000, 'ms');
    
    // System thresholds
    this.setThreshold('system.memory.pressure', 0.8, 0.95, 'ratio');
    this.setThreshold('system.cpu.usage', 70, 90, 'percentage');
    this.setThreshold('system.network.latency', 500, 2000, 'ms');
    
    // Virtualization thresholds
    this.setThreshold('virtualization.renderTime', 16, 50, 'ms'); // 60fps = 16ms
    this.setThreshold('virtualization.memoryPressure', 0.7, 0.9, 'ratio');
  }

  private setupPerformanceObservation(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure') {
              this.recordMetric(
                `performance.${entry.name}`,
                entry.duration,
                'ms'
              );
            }
          }
        });
        
        this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
      } catch (error) {
        console.warn('Failed to setup PerformanceObserver:', error);
      }
    }
  }

  private startAutoCollection(): void {
    this.collectionTimer = setInterval(async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        this.errorHandler.handleError(error, { operation: 'collectSystemMetrics' });
      }
    }, this.config.collectionInterval);
  }

  private startReporting(): void {
    this.reportingTimer = setInterval(() => {
      try {
        const metrics = this.getDatabasePerformanceMetrics();
        this.reportingCallbacks.forEach(callback => {
          try {
            callback(metrics);
          } catch (error) {
            console.error('Reporting callback error:', error);
          }
        });
      } catch (error) {
        this.errorHandler.handleError(error, { operation: 'generateReport' });
      }
    }, this.config.reportingInterval);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
      this.cleanupOldAlerts();
    }, this.config.metricsRetentionTime / 4); // Cleanup every 6 hours
  }

  private async collectSystemMetrics(): Promise<void> {
    await this.getSystemResourceUsage();
  }

  private async getMemoryUsage(): Promise<SystemResourceUsage['memory']> {
    let memoryInfo = { used: 0, total: 0, pressure: 0 };
    
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      memoryInfo = {
        used: memory.usedJSHeapSize || 0,
        total: memory.totalJSHeapSize || 0,
        pressure: memory.usedJSHeapSize / memory.totalJSHeapSize || 0
      };
    }
    
    return memoryInfo;
  }

  private async getCPUUsage(): Promise<SystemResourceUsage['cpu']> {
    // CPU usage is difficult to measure in browser environment
    // This is a placeholder implementation
    return {
      usage: 0, // Would need native API or estimation
      loadAverage: undefined
    };
  }

  private async getStorageUsage(): Promise<SystemResourceUsage['storage']> {
    let storageInfo = { used: 0, available: 0, quota: 0 };
    
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        storageInfo = {
          used: estimate.usage || 0,
          available: (estimate.quota || 0) - (estimate.usage || 0),
          quota: estimate.quota || 0
        };
      } catch (error) {
        console.warn('Failed to get storage estimate:', error);
      }
    }
    
    return storageInfo;
  }

  private async getNetworkMetrics(): Promise<SystemResourceUsage['network']> {
    let networkInfo = {
      latency: 0,
      bandwidth: 0,
      effectiveType: 'unknown'
    };
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      networkInfo = {
        latency: connection.rtt || 0,
        bandwidth: connection.downlink || 0,
        effectiveType: connection.effectiveType || 'unknown'
      };
    }
    
    return networkInfo;
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;
    
    let severity: 'warning' | 'critical' | null = null;
    let thresholdValue: number;
    
    if (metric.value >= threshold.critical) {
      severity = 'critical';
      thresholdValue = threshold.critical;
    } else if (metric.value >= threshold.warning) {
      severity = 'warning';
      thresholdValue = threshold.warning;
    }
    
    if (severity) {
      const alert: PerformanceAlert = {
        id: `${metric.name}-${Date.now()}`,
        metric: metric.name,
        value: metric.value,
        threshold: thresholdValue,
        severity,
        timestamp: metric.timestamp,
        message: `${metric.name} is ${metric.value}${metric.unit}, exceeding ${severity} threshold of ${thresholdValue}${metric.unit}`
      };
      
      this.alerts.push(alert);
      
      // Notify alert callbacks
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          console.error('Alert callback error:', error);
        }
      });
    }
  }

  private getMetricCount(metricName: string, timeWindow: number): number {
    const metrics = this.metrics.get(metricName);
    if (!metrics) return 0;
    
    const cutoff = Date.now() - timeWindow;
    return metrics.filter(m => m.timestamp > cutoff).length;
  }

  private getMetricSum(metricName: string, timeWindow: number): number {
    const metrics = this.metrics.get(metricName);
    if (!metrics) return 0;
    
    const cutoff = Date.now() - timeWindow;
    return metrics
      .filter(m => m.timestamp > cutoff)
      .reduce((sum, m) => sum + m.value, 0);
  }

  private getMetricAverage(metricName: string, timeWindow: number): number {
    const metrics = this.metrics.get(metricName);
    if (!metrics) return 0;
    
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = metrics.filter(m => m.timestamp > cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const sum = recentMetrics.reduce((total, m) => total + m.value, 0);
    return sum / recentMetrics.length;
  }

  private getMetricLatest(metricName: string): number | null {
    const metrics = this.metrics.get(metricName);
    if (!metrics || metrics.length === 0) return null;
    
    return metrics[metrics.length - 1].value;
  }

  private calculateErrorRate(errorMetric: string, totalMetric: string, timeWindow: number): number {
    const errors = this.getMetricCount(errorMetric, timeWindow);
    const total = this.getMetricCount(totalMetric, timeWindow);
    
    return total > 0 ? errors / total : 0;
  }

  private calculateCacheHitRate(timeWindow: number): number {
    const hits = this.getMetricCount('cache.hit', timeWindow);
    const misses = this.getMetricCount('cache.miss', timeWindow);
    const total = hits + misses;
    
    return total > 0 ? hits / total : 0;
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.metricsRetentionTime;
    
    for (const [name, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp > cutoff);
      this.metrics.set(name, filtered);
    }
  }

  private cleanupOldAlerts(): void {
    const cutoff = Date.now() - this.config.alertRetentionTime;
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
  }
}

// Singleton instance
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

/**
 * Performance timing decorator for functions
 */
export function measurePerformance(metricName: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const monitor = getPerformanceMonitor();
      const startTime = performance.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;
        monitor.recordMetric(metricName, duration, 'ms');
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        monitor.recordMetric(metricName, duration, 'ms', { error: 'true' });
        throw error;
      }
    };
    
    return descriptor;
  };
}