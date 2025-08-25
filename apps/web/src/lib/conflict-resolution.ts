/**
 * Comprehensive conflict resolution system for TanStack DB operations
 * Handles concurrent updates, data conflicts, and provides multiple resolution strategies
 * for maintaining data consistency in OpenChat's distributed environment.
 */

'use client';

import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { 
  EntityType, 
  SyncOperation, 
  SyncStatus 
} from '@/lib/tanstack-db';

import type {
  DataConflict,
  ConflictResolution,
  ConflictResolutionStrategy,
  Chat,
  Message,
  User,
  UserPreferences
} from '@/lib/types/tanstack-db.types';

/**
 * Conflict detection result with detailed information
 */
export interface ConflictDetectionResult<T = unknown> {
  /** Whether a conflict was detected */
  hasConflict: boolean;
  /** The conflict details if one exists */
  conflict?: DataConflict<T>;
  /** Fields that are in conflict */
  conflictingFields: string[];
  /** Confidence level of conflict detection (0-1) */
  confidence: number;
}

/**
 * Merge operation result for field-level conflict resolution
 */
export interface MergeResult<T = unknown> {
  /** The merged data */
  mergedData: T;
  /** Fields that were merged automatically */
  autoMergedFields: string[];
  /** Fields that require manual resolution */
  manualResolutionRequired: string[];
  /** Merge strategy used */
  strategy: ConflictResolutionStrategy;
  /** Additional metadata about the merge */
  metadata?: Record<string, unknown>;
}

/**
 * Conflict resolution configuration
 */
export interface ConflictResolutionConfig {
  /** Default strategy to use */
  defaultStrategy: ConflictResolutionStrategy;
  /** Field-specific strategies */
  fieldStrategies: Record<string, ConflictResolutionStrategy>;
  /** Whether to automatically resolve simple conflicts */
  autoResolveSimple: boolean;
  /** Maximum time to wait for manual resolution (ms) */
  manualResolutionTimeout: number;
  /** Whether to preserve conflict history */
  preserveHistory: boolean;
}

/**
 * Abstract base class for conflict detectors
 */
abstract class ConflictDetector<T = unknown> {
  /**
   * Detect conflicts between local and remote versions
   */
  abstract detectConflict(
    localVersion: T, 
    remoteVersion: T, 
    baseVersion?: T
  ): ConflictDetectionResult<T>;

  /**
   * Get the fields that should be compared for conflicts
   */
  abstract getComparableFields(): string[];

  /**
   * Determine if a field should be ignored for conflict detection
   */
  protected shouldIgnoreField(fieldName: string): boolean {
    const ignoredFields = [
      'id', 
      'createdAt', 
      'updatedAt', 
      'lastSyncAt',
      'syncVersion',
      'deviceId'
    ];
    
    return ignoredFields.includes(fieldName);
  }

  /**
   * Compare field values for conflicts
   */
  protected compareFields(
    localValue: unknown, 
    remoteValue: unknown, 
    baseValue?: unknown
  ): boolean {
    // If we have base version, use three-way comparison
    if (baseValue !== undefined) {
      // No conflict if both local and remote changed to same value
      if (this.deepEquals(localValue, remoteValue)) {
        return false;
      }
      
      // Conflict if both changed from base to different values
      if (!this.deepEquals(localValue, baseValue) && !this.deepEquals(remoteValue, baseValue)) {
        return true;
      }
    }
    
    // Simple two-way comparison
    return !this.deepEquals(localValue, remoteValue);
  }

  /**
   * Deep equality comparison
   */
  protected deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);
      
      if (aKeys.length !== bKeys.length) return false;
      
      for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        if (!this.deepEquals(aObj[key], bObj[key])) return false;
      }
      
      return true;
    }
    
    return false;
  }
}

/**
 * Chat conflict detector
 */
class ChatConflictDetector extends ConflictDetector<Chat> {
  detectConflict(
    localVersion: Chat, 
    remoteVersion: Chat, 
    baseVersion?: Chat
  ): ConflictDetectionResult<Chat> {
    const conflictingFields: string[] = [];
    const comparableFields = this.getComparableFields();
    
    for (const field of comparableFields) {
      if (this.shouldIgnoreField(field)) continue;
      
      const localValue = (localVersion as any)[field];
      const remoteValue = (remoteVersion as any)[field];
      const baseValue = baseVersion ? (baseVersion as any)[field] : undefined;
      
      if (this.compareFields(localValue, remoteValue, baseValue)) {
        conflictingFields.push(field);
      }
    }
    
    const hasConflict = conflictingFields.length > 0;
    let conflict: DataConflict<Chat> | undefined;
    
    if (hasConflict) {
      conflict = {
        conflictId: nanoid(),
        entityType: EntityType.CHAT,
        entityId: localVersion.id,
        localVersion,
        remoteVersion,
        conflictingFields,
        detectedAt: new Date(),
      };
    }
    
    return {
      hasConflict,
      conflict,
      conflictingFields,
      confidence: this.calculateConfidence(conflictingFields),
    };
  }

  getComparableFields(): string[] {
    return [
      'title',
      'chatType',
      'settings',
      'tags',
      'isPinned',
      'isArchived',
      'isDeleted',
      'messageCount',
    ];
  }

  private calculateConfidence(conflictingFields: string[]): number {
    const criticalFields = ['title', 'isDeleted'];
    const hasCriticalConflicts = conflictingFields.some(field => 
      criticalFields.includes(field)
    );
    
    return hasCriticalConflicts ? 0.9 : 0.7;
  }
}

/**
 * Message conflict detector
 */
class MessageConflictDetector extends ConflictDetector<Message> {
  detectConflict(
    localVersion: Message, 
    remoteVersion: Message, 
    baseVersion?: Message
  ): ConflictDetectionResult<Message> {
    const conflictingFields: string[] = [];
    const comparableFields = this.getComparableFields();
    
    for (const field of comparableFields) {
      if (this.shouldIgnoreField(field)) continue;
      
      const localValue = (localVersion as any)[field];
      const remoteValue = (remoteVersion as any)[field];
      const baseValue = baseVersion ? (baseVersion as any)[field] : undefined;
      
      if (this.compareFields(localValue, remoteValue, baseValue)) {
        conflictingFields.push(field);
      }
    }
    
    const hasConflict = conflictingFields.length > 0;
    let conflict: DataConflict<Message> | undefined;
    
    if (hasConflict) {
      conflict = {
        conflictId: nanoid(),
        entityType: EntityType.MESSAGE,
        entityId: localVersion.id,
        localVersion,
        remoteVersion,
        conflictingFields,
        detectedAt: new Date(),
      };
    }
    
    return {
      hasConflict,
      conflict,
      conflictingFields,
      confidence: this.calculateConfidence(conflictingFields),
    };
  }

  getComparableFields(): string[] {
    return [
      'content',
      'role',
      'messageType',
      'metadata',
      'parentMessageId',
      'editHistory',
      'tokenCount',
      'isDeleted',
    ];
  }

  private calculateConfidence(conflictingFields: string[]): number {
    const criticalFields = ['content', 'role', 'isDeleted'];
    const hasCriticalConflicts = conflictingFields.some(field => 
      criticalFields.includes(field)
    );
    
    return hasCriticalConflicts ? 0.95 : 0.8;
  }
}

/**
 * Abstract base class for conflict resolvers
 */
abstract class ConflictResolver<T = unknown> {
  /**
   * Resolve a conflict using the specified strategy
   */
  abstract resolveConflict(
    conflict: DataConflict<T>, 
    strategy: ConflictResolutionStrategy,
    options?: Record<string, unknown>
  ): ConflictResolution<T>;

  /**
   * Merge two versions of data
   */
  abstract mergeData(
    localVersion: T, 
    remoteVersion: T, 
    strategy: ConflictResolutionStrategy
  ): MergeResult<T>;

  /**
   * Validate a resolution result
   */
  abstract validateResolution(resolution: ConflictResolution<T>): boolean;
}

/**
 * Chat conflict resolver
 */
class ChatConflictResolver extends ConflictResolver<Chat> {
  resolveConflict(
    conflict: DataConflict<Chat>, 
    strategy: ConflictResolutionStrategy,
    options: Record<string, unknown> = {}
  ): ConflictResolution<Chat> {
    const { localVersion, remoteVersion } = conflict;
    
    switch (strategy) {
      case ConflictResolutionStrategy.LOCAL_WINS:
        return {
          resolvedData: localVersion,
          strategy,
          metadata: { reason: 'Local version preserved' },
        };
        
      case ConflictResolutionStrategy.REMOTE_WINS:
        return {
          resolvedData: remoteVersion,
          strategy,
          metadata: { reason: 'Remote version adopted' },
        };
        
      case ConflictResolutionStrategy.LAST_WRITE_WINS:
        const localTime = new Date(localVersion.updatedAt).getTime();
        const remoteTime = new Date(remoteVersion.updatedAt).getTime();
        
        return {
          resolvedData: localTime > remoteTime ? localVersion : remoteVersion,
          strategy,
          metadata: { 
            reason: `${localTime > remoteTime ? 'Local' : 'Remote'} version is newer`,
            localTime,
            remoteTime,
          },
        };
        
      case ConflictResolutionStrategy.MERGE:
        const mergeResult = this.mergeData(localVersion, remoteVersion, strategy);
        return {
          resolvedData: mergeResult.mergedData,
          strategy,
          metadata: {
            reason: 'Field-level merge performed',
            autoMergedFields: mergeResult.autoMergedFields,
            manualResolutionRequired: mergeResult.manualResolutionRequired,
          },
        };
        
      case ConflictResolutionStrategy.MANUAL:
      default:
        // Return unresolved for manual handling
        return {
          resolvedData: localVersion, // Temporary fallback
          strategy,
          metadata: { reason: 'Manual resolution required' },
        };
    }
  }

  mergeData(
    localVersion: Chat, 
    remoteVersion: Chat, 
    strategy: ConflictResolutionStrategy
  ): MergeResult<Chat> {
    const mergedData = { ...localVersion };
    const autoMergedFields: string[] = [];
    const manualResolutionRequired: string[] = [];
    
    // Field-specific merge logic
    const mergeRules: Record<string, (local: unknown, remote: unknown) => unknown> = {
      // For titles, prefer non-empty, more recent one
      title: (local, remote) => {
        if (!local && remote) return remote;
        if (local && !remote) return local;
        // Both have values, prefer newer (would need timestamp comparison)
        return local; // Fallback to local
      },
      
      // For message count, use maximum
      messageCount: (local, remote) => Math.max(
        (local as number) || 0, 
        (remote as number) || 0
      ),
      
      // For boolean flags, prefer true values for some fields
      isPinned: (local, remote) => (local as boolean) || (remote as boolean),
      
      // For timestamps, use most recent
      lastActivityAt: (local, remote) => {
        const localTime = local ? new Date(local as string).getTime() : 0;
        const remoteTime = remote ? new Date(remote as string).getTime() : 0;
        return localTime > remoteTime ? local : remote;
      },
      
      // For JSON fields, attempt merge or prefer non-null
      settings: (local, remote) => {
        if (!local) return remote;
        if (!remote) return local;
        
        try {
          const localObj = JSON.parse(local as string);
          const remoteObj = JSON.parse(remote as string);
          return JSON.stringify({ ...localObj, ...remoteObj });
        } catch {
          return local; // Fallback to local if parsing fails
        }
      },
      
      tags: (local, remote) => {
        if (!local) return remote;
        if (!remote) return local;
        
        try {
          const localTags = JSON.parse(local as string) as string[];
          const remoteTags = JSON.parse(remote as string) as string[];
          const mergedTags = [...new Set([...localTags, ...remoteTags])];
          return JSON.stringify(mergedTags);
        } catch {
          return local;
        }
      },
    };
    
    // Apply merge rules
    for (const [field, mergeFunction] of Object.entries(mergeRules)) {
      const localValue = (localVersion as any)[field];
      const remoteValue = (remoteVersion as any)[field];
      
      if (localValue !== remoteValue) {
        try {
          (mergedData as any)[field] = mergeFunction(localValue, remoteValue);
          autoMergedFields.push(field);
        } catch (error) {
          manualResolutionRequired.push(field);
        }
      }
    }
    
    // Update timestamps
    mergedData.updatedAt = new Date();
    
    return {
      mergedData,
      autoMergedFields,
      manualResolutionRequired,
      strategy,
      metadata: {
        mergeTimestamp: new Date().toISOString(),
        fieldsProcessed: Object.keys(mergeRules).length,
      },
    };
  }

  validateResolution(resolution: ConflictResolution<Chat>): boolean {
    const { resolvedData } = resolution;
    
    // Basic validation
    if (!resolvedData.id || !resolvedData.title || !resolvedData.userId) {
      return false;
    }
    
    // Validate JSON fields
    try {
      if (resolvedData.settings) {
        JSON.parse(resolvedData.settings);
      }
      if (resolvedData.tags) {
        JSON.parse(resolvedData.tags);
      }
    } catch {
      return false;
    }
    
    return true;
  }
}

/**
 * Message conflict resolver
 */
class MessageConflictResolver extends ConflictResolver<Message> {
  resolveConflict(
    conflict: DataConflict<Message>, 
    strategy: ConflictResolutionStrategy,
    options: Record<string, unknown> = {}
  ): ConflictResolution<Message> {
    const { localVersion, remoteVersion } = conflict;
    
    switch (strategy) {
      case ConflictResolutionStrategy.LOCAL_WINS:
        return {
          resolvedData: localVersion,
          strategy,
          metadata: { reason: 'Local version preserved' },
        };
        
      case ConflictResolutionStrategy.REMOTE_WINS:
        return {
          resolvedData: remoteVersion,
          strategy,
          metadata: { reason: 'Remote version adopted' },
        };
        
      case ConflictResolutionStrategy.LAST_WRITE_WINS:
        const localTime = new Date(localVersion.createdAt).getTime();
        const remoteTime = new Date(remoteVersion.createdAt).getTime();
        
        return {
          resolvedData: localTime > remoteTime ? localVersion : remoteVersion,
          strategy,
          metadata: { 
            reason: `${localTime > remoteTime ? 'Local' : 'Remote'} version is newer`,
            localTime,
            remoteTime,
          },
        };
        
      case ConflictResolutionStrategy.MERGE:
        const mergeResult = this.mergeData(localVersion, remoteVersion, strategy);
        return {
          resolvedData: mergeResult.mergedData,
          strategy,
          metadata: {
            reason: 'Field-level merge performed',
            autoMergedFields: mergeResult.autoMergedFields,
            manualResolutionRequired: mergeResult.manualResolutionRequired,
          },
        };
        
      case ConflictResolutionStrategy.MANUAL:
      default:
        return {
          resolvedData: localVersion,
          strategy,
          metadata: { reason: 'Manual resolution required' },
        };
    }
  }

  mergeData(
    localVersion: Message, 
    remoteVersion: Message, 
    strategy: ConflictResolutionStrategy
  ): MergeResult<Message> {
    const mergedData = { ...localVersion };
    const autoMergedFields: string[] = [];
    const manualResolutionRequired: string[] = [];
    
    // Content conflicts usually require manual resolution
    if (localVersion.content !== remoteVersion.content) {
      // For messages, content conflicts are critical and usually need manual resolution
      manualResolutionRequired.push('content');
      
      // However, we can try some heuristics
      if (!localVersion.content && remoteVersion.content) {
        mergedData.content = remoteVersion.content;
        autoMergedFields.push('content');
        manualResolutionRequired.pop(); // Remove from manual list
      } else if (localVersion.content && !remoteVersion.content) {
        mergedData.content = localVersion.content;
        autoMergedFields.push('content');
        manualResolutionRequired.pop();
      }
    }
    
    // Handle edit history merge
    if (localVersion.editHistory !== remoteVersion.editHistory) {
      try {
        const localHistory = localVersion.editHistory ? 
          JSON.parse(localVersion.editHistory) : [];
        const remoteHistory = remoteVersion.editHistory ? 
          JSON.parse(remoteVersion.editHistory) : [];
        
        // Merge edit histories by timestamp
        const combinedHistory = [...localHistory, ...remoteHistory]
          .sort((a, b) => new Date(a.editedAt).getTime() - new Date(b.editedAt).getTime())
          .filter((edit, index, array) => 
            // Remove duplicates based on content and timestamp
            index === array.findIndex(e => 
              e.content === edit.content && e.editedAt === edit.editedAt
            )
          );
        
        mergedData.editHistory = JSON.stringify(combinedHistory);
        autoMergedFields.push('editHistory');
      } catch {
        manualResolutionRequired.push('editHistory');
      }
    }
    
    // Handle metadata merge
    if (localVersion.metadata !== remoteVersion.metadata) {
      try {
        const localMeta = localVersion.metadata ? 
          JSON.parse(localVersion.metadata) : {};
        const remoteMeta = remoteVersion.metadata ? 
          JSON.parse(remoteVersion.metadata) : {};
        
        // Merge metadata objects
        const mergedMeta = { ...localMeta, ...remoteMeta };
        mergedData.metadata = JSON.stringify(mergedMeta);
        autoMergedFields.push('metadata');
      } catch {
        manualResolutionRequired.push('metadata');
      }
    }
    
    // Token count - use maximum
    if (localVersion.tokenCount !== remoteVersion.tokenCount) {
      mergedData.tokenCount = Math.max(
        localVersion.tokenCount || 0, 
        remoteVersion.tokenCount || 0
      );
      autoMergedFields.push('tokenCount');
    }
    
    return {
      mergedData,
      autoMergedFields,
      manualResolutionRequired,
      strategy,
      metadata: {
        mergeTimestamp: new Date().toISOString(),
        contentConflict: manualResolutionRequired.includes('content'),
      },
    };
  }

  validateResolution(resolution: ConflictResolution<Message>): boolean {
    const { resolvedData } = resolution;
    
    // Basic validation
    if (!resolvedData.id || !resolvedData.chatId || !resolvedData.content) {
      return false;
    }
    
    // Validate role
    const validRoles = ['user', 'assistant', 'system'];
    if (!validRoles.includes(resolvedData.role)) {
      return false;
    }
    
    // Validate JSON fields
    try {
      if (resolvedData.metadata) {
        JSON.parse(resolvedData.metadata);
      }
      if (resolvedData.editHistory) {
        JSON.parse(resolvedData.editHistory);
      }
    } catch {
      return false;
    }
    
    return true;
  }
}

/**
 * Main conflict resolution manager
 */
export class ConflictResolutionManager extends EventEmitter {
  private detectors = new Map<EntityType, ConflictDetector>();
  private resolvers = new Map<EntityType, ConflictResolver>();
  private activeConflicts = new Map<string, DataConflict>();
  private resolutionHistory = new Array<{
    conflictId: string;
    resolution: ConflictResolution;
    resolvedAt: Date;
  }>();
  
  private config: ConflictResolutionConfig = {
    defaultStrategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
    fieldStrategies: {},
    autoResolveSimple: true,
    manualResolutionTimeout: 300000, // 5 minutes
    preserveHistory: true,
  };

  constructor(config?: Partial<ConflictResolutionConfig>) {
    super();
    
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    this.initializeDetectors();
    this.initializeResolvers();
  }

  /**
   * Detect conflicts between local and remote versions
   */
  detectConflict<T>(
    entityType: EntityType,
    localVersion: T,
    remoteVersion: T,
    baseVersion?: T
  ): ConflictDetectionResult<T> {
    const detector = this.detectors.get(entityType);
    if (!detector) {
      throw new Error(`No conflict detector available for entity type: ${entityType}`);
    }

    const result = detector.detectConflict(localVersion, remoteVersion, baseVersion);
    
    // Store active conflicts
    if (result.hasConflict && result.conflict) {
      this.activeConflicts.set(result.conflict.conflictId, result.conflict);
      this.emit('conflict-detected', result.conflict);
    }
    
    return result;
  }

  /**
   * Resolve a conflict using the specified strategy
   */
  resolveConflict<T>(
    conflictId: string,
    strategy?: ConflictResolutionStrategy,
    options?: Record<string, unknown>
  ): ConflictResolution<T> {
    const conflict = this.activeConflicts.get(conflictId) as DataConflict<T>;
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    const resolver = this.resolvers.get(conflict.entityType) as ConflictResolver<T>;
    if (!resolver) {
      throw new Error(`No conflict resolver available for entity type: ${conflict.entityType}`);
    }

    const resolutionStrategy = strategy || 
      this.config.fieldStrategies[conflict.entityType] || 
      this.config.defaultStrategy;

    const resolution = resolver.resolveConflict(conflict, resolutionStrategy, options);
    
    // Validate resolution
    if (!resolver.validateResolution(resolution)) {
      throw new Error('Invalid conflict resolution generated');
    }

    // Store resolution history
    if (this.config.preserveHistory) {
      this.resolutionHistory.push({
        conflictId,
        resolution,
        resolvedAt: new Date(),
      });
    }

    // Remove from active conflicts
    this.activeConflicts.delete(conflictId);
    
    this.emit('conflict-resolved', {
      conflictId,
      resolution,
      conflict,
    });

    return resolution;
  }

  /**
   * Automatically resolve conflicts based on configuration
   */
  autoResolveConflicts(): Array<{
    conflictId: string;
    resolution: ConflictResolution;
    success: boolean;
    error?: string;
  }> {
    const results: Array<any> = [];
    
    for (const [conflictId, conflict] of this.activeConflicts.entries()) {
      try {
        // Check if auto-resolution is enabled and conflict is simple enough
        if (this.config.autoResolveSimple && this.isSimpleConflict(conflict)) {
          const resolution = this.resolveConflict(conflictId);
          results.push({
            conflictId,
            resolution,
            success: true,
          });
        }
      } catch (error) {
        results.push({
          conflictId,
          resolution: null,
          success: false,
          error: (error as Error).message,
        });
      }
    }
    
    return results;
  }

  /**
   * Get all active conflicts
   */
  getActiveConflicts(): DataConflict[] {
    return Array.from(this.activeConflicts.values());
  }

  /**
   * Get conflict resolution history
   */
  getResolutionHistory(): Array<{
    conflictId: string;
    resolution: ConflictResolution;
    resolvedAt: Date;
  }> {
    return [...this.resolutionHistory];
  }

  /**
   * Clear resolved conflicts from history
   */
  clearHistory(): void {
    this.resolutionHistory.length = 0;
    this.emit('history-cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConflictResolutionConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config-updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ConflictResolutionConfig {
    return { ...this.config };
  }

  private initializeDetectors(): void {
    this.detectors.set(EntityType.CHAT, new ChatConflictDetector());
    this.detectors.set(EntityType.MESSAGE, new MessageConflictDetector());
  }

  private initializeResolvers(): void {
    this.resolvers.set(EntityType.CHAT, new ChatConflictResolver());
    this.resolvers.set(EntityType.MESSAGE, new MessageConflictResolver());
  }

  private isSimpleConflict(conflict: DataConflict): boolean {
    // Consider a conflict simple if:
    // 1. It has few conflicting fields
    // 2. No critical fields are involved
    // 3. Confidence level is high
    
    const criticalFields = ['content', 'role', 'title', 'isDeleted'];
    const hasCriticalConflicts = conflict.conflictingFields.some(field => 
      criticalFields.includes(field)
    );
    
    return !hasCriticalConflicts && 
           conflict.conflictingFields.length <= 2;
  }
}

/**
 * Global conflict resolution manager instance
 */
export const conflictResolution = new ConflictResolutionManager();