import type { SyncEvent, Chat, Message, Device } from './schema/shared';
import { getPerformanceOptimizer } from './performance-optimizer';
import { getRetryManager } from './retry-manager';
import { getSyncAuthManager } from './sync-auth';
import { getDatabaseErrorHandler } from './error-handler';

export type SyncStrategy = 'incremental' | 'full' | 'selective' | 'adaptive';

export interface SyncDecision {
  strategy: SyncStrategy;
  reason: string;
  estimatedDataSize: number;
  estimatedTime: number;
  networkOptimal: boolean;
  backgroundSync: boolean;
}

export interface SyncProgress {
  stage: 'prepare' | 'pull' | 'resolve' | 'push' | 'complete';
  percentage: number;
  processedItems: number;
  totalItems: number;
  currentOperation: string;
  estimatedTimeRemaining: number;
}

export interface SyncResult {
  success: boolean;
  strategy: SyncStrategy;
  itemsSynced: number;
  conflictsResolved: number;
  duration: number;
  dataTransferred: number;
  errors: any[];
  nextSyncRecommendation: {
    strategy: SyncStrategy;
    delayMs: number;
  };
}

export interface SyncConfig {
  preferredStrategy: SyncStrategy;
  maxDataSizeForIncremental: number;
  maxTimeGapForIncremental: number; // milliseconds
  conflictThreshold: number;
  backgroundSyncEnabled: boolean;
  adaptiveThresholds: {
    networkSpeedThreshold: number; // Mbps
    batteryLevelThreshold: number; // percentage
    dataUsageThreshold: number; // MB per day
  };
}

/**
 * Intelligent sync strategy manager that automatically chooses optimal sync approach
 */
export class SyncStrategyManager {
  private config: SyncConfig;
  private performanceOptimizer = getPerformanceOptimizer();
  private retryManager = getRetryManager();
  private authManager = getSyncAuthManager();
  private errorHandler = getDatabaseErrorHandler();
  private syncHistory = new Map<string, SyncResult[]>();
  private onProgressCallback?: (progress: SyncProgress) => void;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = {
      preferredStrategy: 'adaptive',
      maxDataSizeForIncremental: 10 * 1024 * 1024, // 10MB
      maxTimeGapForIncremental: 24 * 60 * 60 * 1000, // 24 hours
      conflictThreshold: 0.1, // 10% conflict rate threshold
      backgroundSyncEnabled: true,
      adaptiveThresholds: {
        networkSpeedThreshold: 1, // 1 Mbps
        batteryLevelThreshold: 20, // 20%
        dataUsageThreshold: 100 // 100MB per day
      },
      ...config
    };
  }

  /**
   * Analyze and decide optimal sync strategy
   */
  async decideSyncStrategy(
    userId: string,
    lastSyncTimestamp: number,
    currentDataSnapshot: {
      chatCount: number;
      messageCount: number;
      unsyncedEvents: number;
    }
  ): Promise<SyncDecision> {
    try {
      const timeSinceLastSync = Date.now() - lastSyncTimestamp;
      const networkConditions = this.retryManager.getNetworkConditions();
      const deviceStatus = await this.getDeviceStatus();
      
      // Get sync history for this user
      const history = this.syncHistory.get(userId) || [];
      const recentHistory = history.slice(-10); // Last 10 syncs

      // Analyze different factors
      const factors = {
        timeGap: timeSinceLastSync,
        dataSize: await this.estimateDataSize(userId, lastSyncTimestamp),
        networkSpeed: this.estimateNetworkSpeed(networkConditions),
        conflictProbability: this.estimateConflictProbability(recentHistory, timeSinceLastSync),
        devicePerformance: deviceStatus.performanceScore,
        batteryLevel: deviceStatus.batteryLevel,
        dataUsage: deviceStatus.dataUsageToday,
        userPreference: this.config.preferredStrategy
      };

      // Apply decision tree based on strategy
      switch (this.config.preferredStrategy) {
        case 'adaptive':
          return this.adaptiveDecision(factors, currentDataSnapshot);
        case 'incremental':
          return this.incrementalDecision(factors, currentDataSnapshot);
        case 'full':
          return this.fullSyncDecision(factors, currentDataSnapshot);
        case 'selective':
          return this.selectiveDecision(factors, currentDataSnapshot);
        default:
          return this.adaptiveDecision(factors, currentDataSnapshot);
      }
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'decideSyncStrategy', userId });
      
      // Fallback to incremental sync
      return {
        strategy: 'incremental',
        reason: 'Fallback due to decision error',
        estimatedDataSize: 0,
        estimatedTime: 30000,
        networkOptimal: false,
        backgroundSync: true
      };
    }
  }

  /**
   * Execute sync with chosen strategy
   */
  async executeSync(
    strategy: SyncStrategy,
    userId: string,
    cloudApi: any,
    localDb: any,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncResult> {
    const startTime = Date.now();
    this.onProgressCallback = onProgress;
    
    let result: SyncResult = {
      success: false,
      strategy,
      itemsSynced: 0,
      conflictsResolved: 0,
      duration: 0,
      dataTransferred: 0,
      errors: [],
      nextSyncRecommendation: {
        strategy: 'incremental',
        delayMs: 300000 // 5 minutes default
      }
    };

    try {
      this.updateProgress({
        stage: 'prepare',
        percentage: 0,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Preparing sync...',
        estimatedTimeRemaining: 0
      });

      switch (strategy) {
        case 'incremental':
          result = await this.executeIncrementalSync(userId, cloudApi, localDb);
          break;
        case 'full':
          result = await this.executeFullSync(userId, cloudApi, localDb);
          break;
        case 'selective':
          result = await this.executeSelectiveSync(userId, cloudApi, localDb);
          break;
        case 'adaptive':
          // Adaptive delegates to the best strategy
          const decision = await this.decideSyncStrategy(userId, 0, {
            chatCount: 0,
            messageCount: 0,
            unsyncedEvents: 0
          });
          return this.executeSync(decision.strategy, userId, cloudApi, localDb, onProgress);
      }

      result.duration = Date.now() - startTime;
      result.success = true;

      // Record sync result for future decisions
      this.recordSyncResult(userId, result);

      // Calculate next sync recommendation
      result.nextSyncRecommendation = this.recommendNextSync(result);

      this.updateProgress({
        stage: 'complete',
        percentage: 100,
        processedItems: result.itemsSynced,
        totalItems: result.itemsSynced,
        currentOperation: 'Sync complete',
        estimatedTimeRemaining: 0
      });

      return result;

    } catch (error) {
      result.duration = Date.now() - startTime;
      result.errors.push(error);
      this.errorHandler.handleError(error, { operation: 'executeSync', strategy, userId });
      return result;
    }
  }

  /**
   * Execute incremental sync
   */
  private async executeIncrementalSync(
    userId: string,
    cloudApi: any,
    localDb: any
  ): Promise<SyncResult> {
    const result: Partial<SyncResult> = {
      itemsSynced: 0,
      conflictsResolved: 0,
      dataTransferred: 0,
      errors: []
    };

    try {
      // Get last sync timestamp
      const lastSync = await localDb.getLastSyncTimestamp(userId);
      
      this.updateProgress({
        stage: 'pull',
        percentage: 10,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Fetching incremental changes...',
        estimatedTimeRemaining: 15000
      });

      // Pull incremental changes from cloud
      const cloudChanges = await this.performanceOptimizer.incrementalSync(
        lastSync,
        (since) => cloudApi.getSyncEvents(userId, since, localDb.getDeviceId())
      );

      result.dataTransferred = JSON.stringify(cloudChanges.events).length;

      this.updateProgress({
        stage: 'resolve',
        percentage: 40,
        processedItems: 0,
        totalItems: cloudChanges.events.length,
        currentOperation: 'Resolving conflicts...',
        estimatedTimeRemaining: 10000
      });

      // Apply changes with conflict resolution
      for (let i = 0; i < cloudChanges.events.length; i++) {
        const event = cloudChanges.events[i];
        
        try {
          await this.applyIncrementalChange(event, localDb);
          result.itemsSynced!++;
        } catch (error) {
          if (this.isConflictError(error)) {
            result.conflictsResolved!++;
            await this.resolveConflict(event, localDb);
            result.itemsSynced!++;
          } else {
            result.errors!.push(error);
          }
        }

        this.updateProgress({
          stage: 'resolve',
          percentage: 40 + (i / cloudChanges.events.length) * 30,
          processedItems: i + 1,
          totalItems: cloudChanges.events.length,
          currentOperation: `Processing ${event.entityType} ${event.operation}...`,
          estimatedTimeRemaining: ((cloudChanges.events.length - i) * 100)
        });
      }

      this.updateProgress({
        stage: 'push',
        percentage: 70,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Pushing local changes...',
        estimatedTimeRemaining: 5000
      });

      // Push local changes to cloud
      const localChanges = await localDb.getUnsyncedEvents(userId);
      const pushResult = await this.performanceOptimizer.batchProcess(
        localChanges,
        async (batch) => {
          const results = [];
          for (const event of batch) {
            try {
              await this.pushEventToCloud(event, cloudApi);
              await localDb.markEventAsSynced(event.id);
              results.push(event);
            } catch (error) {
              result.errors!.push(error);
            }
          }
          return results;
        }
      );

      result.itemsSynced! += pushResult.length;

      // Update sync timestamp
      await localDb.updateLastSync(userId);

      this.updateProgress({
        stage: 'complete',
        percentage: 90,
        processedItems: result.itemsSynced!,
        totalItems: result.itemsSynced!,
        currentOperation: 'Finalizing...',
        estimatedTimeRemaining: 1000
      });

    } catch (error) {
      result.errors!.push(error);
      throw error;
    }

    return result as SyncResult;
  }

  /**
   * Execute full sync
   */
  private async executeFullSync(
    userId: string,
    cloudApi: any,
    localDb: any
  ): Promise<SyncResult> {
    const result: Partial<SyncResult> = {
      itemsSynced: 0,
      conflictsResolved: 0,
      dataTransferred: 0,
      errors: []
    };

    try {
      this.updateProgress({
        stage: 'prepare',
        percentage: 5,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Preparing full sync...',
        estimatedTimeRemaining: 60000
      });

      // Clear local sync state
      await localDb.clearSyncState(userId);

      this.updateProgress({
        stage: 'pull',
        percentage: 10,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Downloading all data...',
        estimatedTimeRemaining: 45000
      });

      // Download all data from cloud
      const [chats, messages] = await Promise.all([
        cloudApi.getChats(userId),
        this.getAllMessages(userId, cloudApi)
      ]);

      const totalItems = chats.length + messages.length;
      result.dataTransferred = JSON.stringify({ chats, messages }).length;

      this.updateProgress({
        stage: 'resolve',
        percentage: 40,
        processedItems: 0,
        totalItems,
        currentOperation: 'Rebuilding local database...',
        estimatedTimeRemaining: 30000
      });

      // Rebuild local database
      let processed = 0;
      
      for (const chat of chats) {
        await localDb.createChat(chat, { skipSyncEvent: true });
        processed++;
        this.updateProgress({
          stage: 'resolve',
          percentage: 40 + (processed / totalItems) * 40,
          processedItems: processed,
          totalItems,
          currentOperation: `Syncing chat: ${chat.title}`,
          estimatedTimeRemaining: ((totalItems - processed) * 50)
        });
      }

      for (const message of messages) {
        await localDb.createMessage(message, { skipSyncEvent: true });
        processed++;
        this.updateProgress({
          stage: 'resolve',
          percentage: 40 + (processed / totalItems) * 40,
          processedItems: processed,
          totalItems,
          currentOperation: `Syncing message in chat`,
          estimatedTimeRemaining: ((totalItems - processed) * 50)
        });
      }

      result.itemsSynced = totalItems;

      this.updateProgress({
        stage: 'push',
        percentage: 80,
        processedItems: processed,
        totalItems,
        currentOperation: 'Updating sync timestamps...',
        estimatedTimeRemaining: 5000
      });

      // Update sync timestamp
      await localDb.updateLastSync(userId);

    } catch (error) {
      result.errors!.push(error);
      throw error;
    }

    return result as SyncResult;
  }

  /**
   * Execute selective sync (only priority data)
   */
  private async executeSelectiveSync(
    userId: string,
    cloudApi: any,
    localDb: any
  ): Promise<SyncResult> {
    const result: Partial<SyncResult> = {
      itemsSynced: 0,
      conflictsResolved: 0,
      dataTransferred: 0,
      errors: []
    };

    try {
      this.updateProgress({
        stage: 'prepare',
        percentage: 10,
        processedItems: 0,
        totalItems: 0,
        currentOperation: 'Selecting priority data...',
        estimatedTimeRemaining: 20000
      });

      // Identify priority data to sync
      const priorities = await this.identifyPriorityData(userId, localDb);
      
      this.updateProgress({
        stage: 'pull',
        percentage: 30,
        processedItems: 0,
        totalItems: priorities.totalItems,
        currentOperation: 'Syncing priority chats...',
        estimatedTimeRemaining: 15000
      });

      // Sync priority chats
      let processed = 0;
      for (const chatId of priorities.priorityChats) {
        try {
          const chat = await cloudApi.getChat(chatId);
          await localDb.updateChat(chatId, chat);
          processed++;
          result.itemsSynced!++;
        } catch (error) {
          result.errors!.push(error);
        }

        this.updateProgress({
          stage: 'pull',
          percentage: 30 + (processed / priorities.totalItems) * 40,
          processedItems: processed,
          totalItems: priorities.totalItems,
          currentOperation: `Syncing chat ${processed}/${priorities.priorityChats.length}`,
          estimatedTimeRemaining: ((priorities.totalItems - processed) * 200)
        });
      }

      // Sync recent messages
      for (const chatId of priorities.recentActivity) {
        try {
          const messages = await cloudApi.getMessages(chatId, Date.now() - 86400000); // Last 24h
          for (const message of messages) {
            await localDb.createMessage(message);
            processed++;
            result.itemsSynced!++;
          }
        } catch (error) {
          result.errors!.push(error);
        }

        this.updateProgress({
          stage: 'pull',
          percentage: 30 + (processed / priorities.totalItems) * 40,
          processedItems: processed,
          totalItems: priorities.totalItems,
          currentOperation: `Syncing recent messages...`,
          estimatedTimeRemaining: ((priorities.totalItems - processed) * 100)
        });
      }

      // Push critical local changes
      this.updateProgress({
        stage: 'push',
        percentage: 70,
        processedItems: processed,
        totalItems: priorities.totalItems,
        currentOperation: 'Pushing critical changes...',
        estimatedTimeRemaining: 5000
      });

      const criticalEvents = await localDb.getCriticalUnsyncedEvents(userId);
      for (const event of criticalEvents) {
        try {
          await this.pushEventToCloud(event, cloudApi);
          await localDb.markEventAsSynced(event.id);
          result.itemsSynced!++;
        } catch (error) {
          result.errors!.push(error);
        }
      }

    } catch (error) {
      result.errors!.push(error);
      throw error;
    }

    return result as SyncResult;
  }

  // Decision algorithms
  private adaptiveDecision(factors: any, snapshot: any): SyncDecision {
    const score = this.calculateAdaptiveScore(factors);
    
    if (score.full > score.incremental && score.full > score.selective) {
      return {
        strategy: 'full',
        reason: `Full sync optimal (score: ${score.full.toFixed(2)})`,
        estimatedDataSize: factors.dataSize,
        estimatedTime: this.estimateFullSyncTime(factors),
        networkOptimal: factors.networkSpeed > this.config.adaptiveThresholds.networkSpeedThreshold,
        backgroundSync: this.shouldUseBackgroundSync(factors)
      };
    } else if (score.selective > score.incremental) {
      return {
        strategy: 'selective',
        reason: `Selective sync optimal (score: ${score.selective.toFixed(2)})`,
        estimatedDataSize: factors.dataSize * 0.3, // Selective syncs ~30% of data
        estimatedTime: this.estimateSelectiveSyncTime(factors),
        networkOptimal: factors.networkSpeed > 0.5,
        backgroundSync: true
      };
    } else {
      return {
        strategy: 'incremental',
        reason: `Incremental sync optimal (score: ${score.incremental.toFixed(2)})`,
        estimatedDataSize: Math.min(factors.dataSize, this.config.maxDataSizeForIncremental),
        estimatedTime: this.estimateIncrementalSyncTime(factors),
        networkOptimal: true,
        backgroundSync: this.shouldUseBackgroundSync(factors)
      };
    }
  }

  private calculateAdaptiveScore(factors: any): { full: number; incremental: number; selective: number } {
    // Scoring algorithm that weighs different factors
    const weights = {
      timeGap: 0.2,
      dataSize: 0.3,
      networkSpeed: 0.2,
      batteryLevel: 0.1,
      conflictProbability: 0.2
    };

    // Normalize factors (0-1 scale)
    const normalized = {
      timeGap: Math.min(factors.timeGap / this.config.maxTimeGapForIncremental, 1),
      dataSize: Math.min(factors.dataSize / this.config.maxDataSizeForIncremental, 1),
      networkSpeed: Math.min(factors.networkSpeed / 10, 1), // Assume 10 Mbps is excellent
      batteryLevel: factors.batteryLevel / 100,
      conflictProbability: factors.conflictProbability
    };

    // Calculate scores for each strategy
    const scores = {
      incremental: 
        (1 - normalized.timeGap) * weights.timeGap +
        (1 - normalized.dataSize) * weights.dataSize +
        normalized.networkSpeed * weights.networkSpeed +
        normalized.batteryLevel * weights.batteryLevel +
        (1 - normalized.conflictProbability) * weights.conflictProbability,
      
      full:
        normalized.timeGap * weights.timeGap +
        (normalized.dataSize > 0.8 ? 1 : 0) * weights.dataSize +
        (normalized.networkSpeed > 0.5 ? 1 : 0) * weights.networkSpeed +
        (normalized.batteryLevel > 0.5 ? 1 : 0) * weights.batteryLevel +
        (normalized.conflictProbability > 0.3 ? 1 : 0) * weights.conflictProbability,
      
      selective:
        (normalized.timeGap * 0.5) * weights.timeGap +
        0.7 * weights.dataSize + // Always good for data efficiency
        (normalized.networkSpeed > 0.3 ? 0.8 : 0.4) * weights.networkSpeed +
        normalized.batteryLevel * weights.batteryLevel +
        0.8 * weights.conflictProbability // Good for avoiding conflicts
    };

    return scores;
  }

  // Helper methods
  private incrementalDecision(factors: any, snapshot: any): SyncDecision {
    return {
      strategy: 'incremental',
      reason: 'User preference: incremental',
      estimatedDataSize: Math.min(factors.dataSize, this.config.maxDataSizeForIncremental),
      estimatedTime: this.estimateIncrementalSyncTime(factors),
      networkOptimal: factors.networkSpeed > 1,
      backgroundSync: this.shouldUseBackgroundSync(factors)
    };
  }

  private fullSyncDecision(factors: any, snapshot: any): SyncDecision {
    return {
      strategy: 'full',
      reason: 'User preference: full sync',
      estimatedDataSize: factors.dataSize,
      estimatedTime: this.estimateFullSyncTime(factors),
      networkOptimal: factors.networkSpeed > this.config.adaptiveThresholds.networkSpeedThreshold,
      backgroundSync: false // Full sync usually requires foreground
    };
  }

  private selectiveDecision(factors: any, snapshot: any): SyncDecision {
    return {
      strategy: 'selective',
      reason: 'User preference: selective sync',
      estimatedDataSize: factors.dataSize * 0.3,
      estimatedTime: this.estimateSelectiveSyncTime(factors),
      networkOptimal: factors.networkSpeed > 0.5,
      backgroundSync: true
    };
  }

  private async estimateDataSize(userId: string, lastSyncTimestamp: number): Promise<number> {
    // Estimate based on historical data or API metadata
    // This is a simplified implementation
    const timeDiff = Date.now() - lastSyncTimestamp;
    const daysSinceSync = timeDiff / (24 * 60 * 60 * 1000);
    
    // Rough estimate: 1MB per day of active usage
    return Math.min(daysSinceSync * 1024 * 1024, 100 * 1024 * 1024); // Cap at 100MB
  }

  private estimateNetworkSpeed(conditions: any): number {
    // Estimate network speed in Mbps
    if (conditions.downlink) {
      return conditions.downlink;
    }
    
    // Fallback estimation based on connection type
    switch (conditions.effectiveType) {
      case '4g': return 10;
      case '3g': return 1.5;
      case '2g': return 0.1;
      default: return 1;
    }
  }

  private estimateConflictProbability(history: SyncResult[], timeSinceLastSync: number): number {
    if (history.length === 0) return 0.1; // Default assumption
    
    const recentConflicts = history.reduce((sum, result) => sum + result.conflictsResolved, 0);
    const totalItems = history.reduce((sum, result) => sum + result.itemsSynced, 0);
    
    const conflictRate = totalItems > 0 ? recentConflicts / totalItems : 0;
    
    // Increase probability with time gap
    const timeMultiplier = 1 + (timeSinceLastSync / (24 * 60 * 60 * 1000)); // Days
    
    return Math.min(conflictRate * timeMultiplier, 1);
  }

  private async getDeviceStatus(): Promise<{
    performanceScore: number;
    batteryLevel: number;
    dataUsageToday: number;
  }> {
    const battery = 'getBattery' in navigator ? await (navigator as any).getBattery() : null;
    
    return {
      performanceScore: 0.8, // Could be calculated based on device capabilities
      batteryLevel: battery ? battery.level * 100 : 100,
      dataUsageToday: 0 // Would need to track this
    };
  }

  private shouldUseBackgroundSync(factors: any): boolean {
    return this.config.backgroundSyncEnabled &&
           factors.batteryLevel > this.config.adaptiveThresholds.batteryLevelThreshold &&
           factors.dataUsage < this.config.adaptiveThresholds.dataUsageThreshold;
  }

  private estimateIncrementalSyncTime(factors: any): number {
    const baseTime = 5000; // 5 seconds base
    const sizeMultiplier = factors.dataSize / (1024 * 1024); // Per MB
    const networkMultiplier = Math.max(1, 5 / factors.networkSpeed); // Slower on bad networks
    
    return baseTime + (sizeMultiplier * 1000 * networkMultiplier);
  }

  private estimateFullSyncTime(factors: any): number {
    const baseTime = 30000; // 30 seconds base
    const sizeMultiplier = factors.dataSize / (1024 * 1024); // Per MB
    const networkMultiplier = Math.max(1, 10 / factors.networkSpeed);
    
    return baseTime + (sizeMultiplier * 2000 * networkMultiplier);
  }

  private estimateSelectiveSyncTime(factors: any): number {
    return this.estimateIncrementalSyncTime(factors) * 0.6; // 60% of incremental time
  }

  private updateProgress(progress: SyncProgress): void {
    this.onProgressCallback?.(progress);
  }

  private recordSyncResult(userId: string, result: SyncResult): void {
    if (!this.syncHistory.has(userId)) {
      this.syncHistory.set(userId, []);
    }
    
    const history = this.syncHistory.get(userId)!;
    history.push(result);
    
    // Keep only last 50 sync results
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  private recommendNextSync(result: SyncResult): { strategy: SyncStrategy; delayMs: number } {
    if (!result.success) {
      return { strategy: 'incremental', delayMs: 60000 }; // Retry in 1 minute
    }
    
    const conflictRate = result.conflictsResolved / Math.max(result.itemsSynced, 1);
    
    if (conflictRate > this.config.conflictThreshold) {
      return { strategy: 'full', delayMs: 300000 }; // Full sync in 5 minutes if many conflicts
    }
    
    if (result.strategy === 'full') {
      return { strategy: 'incremental', delayMs: 1800000 }; // 30 minutes after full sync
    }
    
    return { strategy: 'incremental', delayMs: 300000 }; // 5 minutes default
  }

  // Additional helper methods would go here...
  private async applyIncrementalChange(event: SyncEvent, localDb: any): Promise<void> {
    // Implementation would depend on the event type and operation
    // This is a simplified version
    switch (event.entityType) {
      case 'chat':
        if (event.operation === 'create') {
          await localDb.createChat(JSON.parse(event.data));
        } else if (event.operation === 'update') {
          await localDb.updateChat(event.entityId, JSON.parse(event.data));
        } else if (event.operation === 'delete') {
          await localDb.deleteChat(event.entityId);
        }
        break;
      case 'message':
        if (event.operation === 'create') {
          await localDb.createMessage(JSON.parse(event.data));
        } else if (event.operation === 'delete') {
          await localDb.deleteMessage(event.entityId);
        }
        break;
    }
  }

  private isConflictError(error: any): boolean {
    return error?.message?.includes('conflict') || error?.name === 'ConflictError';
  }

  private async resolveConflict(event: SyncEvent, localDb: any): Promise<void> {
    // Simplified conflict resolution - would use the conflict resolver
    console.warn('Conflict detected for event:', event.id);
    // Apply cloud version by default
    await this.applyIncrementalChange(event, localDb);
  }

  private async pushEventToCloud(event: SyncEvent, cloudApi: any): Promise<void> {
    const data = JSON.parse(event.data || '{}');
    
    switch (event.entityType) {
      case 'chat':
        if (event.operation === 'create') {
          await cloudApi.createChat(data);
        } else if (event.operation === 'update') {
          await cloudApi.updateChat(event.entityId, data);
        } else if (event.operation === 'delete') {
          await cloudApi.deleteChat(event.entityId);
        }
        break;
      case 'message':
        if (event.operation === 'create') {
          await cloudApi.createMessage(data);
        } else if (event.operation === 'delete') {
          await cloudApi.deleteMessage(event.entityId);
        }
        break;
    }
  }

  private async getAllMessages(userId: string, cloudApi: any): Promise<Message[]> {
    // This would typically paginate through all messages
    // Simplified implementation
    const chats = await cloudApi.getChats(userId);
    const allMessages: Message[] = [];
    
    for (const chat of chats) {
      const messages = await cloudApi.getMessages(chat.id);
      allMessages.push(...messages);
    }
    
    return allMessages;
  }

  private async identifyPriorityData(userId: string, localDb: any): Promise<{
    priorityChats: string[];
    recentActivity: string[];
    totalItems: number;
  }> {
    // Identify the most important data to sync
    const recentChats = await localDb.getRecentlyAccessedChats(userId, 5);
    const activeChats = await localDb.getChatsWithRecentMessages(userId, 24 * 60 * 60 * 1000);
    
    return {
      priorityChats: recentChats.map((c: Chat) => c.id),
      recentActivity: activeChats.map((c: Chat) => c.id),
      totalItems: recentChats.length + activeChats.length * 10 // Estimate 10 messages per active chat
    };
  }

  // Public API
  getSyncHistory(userId: string): SyncResult[] {
    return this.syncHistory.get(userId) || [];
  }

  updateConfig(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let syncStrategyManager: SyncStrategyManager | null = null;

export function getSyncStrategyManager(config?: Partial<SyncConfig>): SyncStrategyManager {
  if (!syncStrategyManager) {
    syncStrategyManager = new SyncStrategyManager(config);
  }
  return syncStrategyManager;
}