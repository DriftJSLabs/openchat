import { getLocalDatabase } from './local-db';
import type { 
  SyncEvent, 
  SyncConfig, 
  Chat, 
  Message, 
  User, 
  ChatAnalytics, 
  UserPreferences 
} from './schema/shared';

interface CloudAPI {
  // Enhanced cloud API interface with new entities and batch operations
  // Chat operations
  getChats(userId: string, lastSyncTimestamp?: number): Promise<Chat[]>;
  getMessages(chatId: string, lastSyncTimestamp?: number): Promise<Message[]>;
  createChat(chat: Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chat>;
  createMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  updateChat(id: string, updates: Partial<Chat>): Promise<Chat>;
  deleteChat(id: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  
  // Batch operations for performance
  batchCreateChats(chats: Omit<Chat, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Chat[]>;
  batchCreateMessages(messages: Omit<Message, 'id' | 'createdAt'>[]): Promise<Message[]>;
  batchUpdateChats(updates: { id: string; updates: Partial<Chat> }[]): Promise<Chat[]>;
  
  // Analytics operations
  getChatAnalytics(userId: string, chatId?: string): Promise<ChatAnalytics[]>;
  updateChatAnalytics(id: string, updates: Partial<ChatAnalytics>): Promise<ChatAnalytics>;
  
  // User preferences operations
  getUserPreferences(userId: string): Promise<UserPreferences | null>;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences>;
  
  // Enhanced sync operations
  getSyncEvents(userId: string, since: number): Promise<SyncEvent[]>;
  markSyncEventProcessed(eventId: string): Promise<void>;
  getConflictResolution?(entityType: string, entityId: string, localData: any, cloudData: any): Promise<'local' | 'cloud' | 'merge'>;
}

type SyncMode = 'local-only' | 'cloud-only' | 'hybrid';

interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  pendingChanges: number;
  syncing: boolean;
  error: string | null;
  // Enhanced status tracking
  syncProgress: {
    total: number;
    completed: number;
    failed: number;
    currentOperation: string;
  };
  conflictsDetected: number;
  batchOperations: {
    pending: number;
    processing: boolean;
  };
  analytics: {
    syncSpeed: number; // events per second
    avgSyncTime: number; // milliseconds
    lastSyncDuration: number; // milliseconds
  };
}

export class SyncManager {
  private localDb = getLocalDatabase();
  private cloudApi: CloudAPI | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncDebounceTimer: NodeJS.Timeout | null = null;
  private batchProcessingTimer: NodeJS.Timeout | null = null;
  private syncMetrics = {
    startTime: 0,
    syncTimes: [] as number[],
    eventsCounts: [] as number[]
  };
  private syncStatus: SyncStatus = {
    isOnline: navigator.onLine,
    lastSync: null,
    pendingChanges: 0,
    syncing: false,
    error: null,
    syncProgress: {
      total: 0,
      completed: 0,
      failed: 0,
      currentOperation: ''
    },
    conflictsDetected: 0,
    batchOperations: {
      pending: 0,
      processing: false
    },
    analytics: {
      syncSpeed: 0,
      avgSyncTime: 0,
      lastSyncDuration: 0
    }
  };
  private statusCallbacks = new Set<(status: SyncStatus) => void>();
  private conflictQueue = new Map<string, { entityType: string; entityId: string; localData: any; cloudData: any }>();

  constructor(cloudApi?: CloudAPI) {
    this.cloudApi = cloudApi || null;
    this.setupNetworkListeners();
    this.updatePendingChangesCount();
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.syncStatus.isOnline = true;
      this.notifyStatusChange();
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.syncStatus.isOnline = false;
      this.notifyStatusChange();
    });
    
    // Listen for local database changes for real-time sync
    window.addEventListener('local-db-change', (event: any) => {
      const { userId } = event.detail;
      if (userId && this.syncStatus.isOnline) {
        this.triggerSync(userId);
      }
    });
  }

  private async updatePendingChangesCount(): Promise<void> {
    try {
      const events = await this.localDb.getUnsyncedEvents();
      this.syncStatus.pendingChanges = events.length;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Failed to update pending changes count:', error);
    }
  }

  private notifyStatusChange(): void {
    this.statusCallbacks.forEach(callback => callback({ ...this.syncStatus }));
  }

  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async startAutoSync(userId: string): Promise<void> {
    const config = await this.localDb.getSyncConfig(userId);
    
    if (!config || !config.autoSync || config.mode === 'local-only') {
      return;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (this.syncStatus.isOnline && !this.syncStatus.syncing) {
        this.triggerSync(userId);
      }
    }, config.syncInterval);
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async triggerSync(userId?: string): Promise<void> {
    if (!this.cloudApi) {
      return;
    }

    if (!userId) {
      // If no userId provided, we can't sync
      return;
    }

    // Debounce rapid sync attempts (wait 500ms)
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    
    this.syncDebounceTimer = setTimeout(async () => {
      // Check if already syncing
      if (this.syncStatus.syncing) {
        return;
      }

      const config = await this.localDb.getSyncConfig(userId);
      if (!config || config.mode === 'local-only') {
        return;
      }

      this.syncStatus.syncing = true;
      this.syncStatus.error = null;
      this.notifyStatusChange();

      try {
        // First push local changes to cloud
        await this.pushLocalChanges(userId);
        
        // Then pull cloud changes to local
        await this.pullCloudChanges(userId);
        
        this.syncStatus.lastSync = new Date();
        await this.localDb.updateLastSync(userId);
        await this.updatePendingChangesCount();
        
      } catch (error) {
        this.syncStatus.error = error instanceof Error ? error.message : 'Sync failed';
        console.error('Sync failed:', error);
      } finally {
        this.syncStatus.syncing = false;
        this.notifyStatusChange();
      }
    }, 500); // 500ms debounce
  }

  private async pushLocalChanges(userId: string): Promise<void> {
    if (!this.cloudApi) return;

    const unsyncedEvents = await this.localDb.getUnsyncedEvents(userId);
    
    for (const event of unsyncedEvents) {
      try {
        await this.pushEventToCloud(event);
        await this.localDb.markEventAsSynced(event.id);
      } catch (error) {
        console.error(`Failed to sync event ${event.id}:`, error);
        // Continue with other events even if one fails
      }
    }
  }

  /**
   * Enhanced push method that handles new entity types and batch operations
   */
  private async pushEventToCloud(event: SyncEvent): Promise<void> {
    if (!this.cloudApi) return;

    const data = JSON.parse(event.data || '{}');

    // Update sync progress
    this.syncStatus.syncProgress.currentOperation = `Pushing ${event.entityType} ${event.operation}`;
    this.notifyStatusChange();

    try {
      switch (event.entityType) {
        case 'chat':
          await this.handleChatSync(event, data);
          break;

        case 'message':
          await this.handleMessageSync(event, data);
          break;

        case 'analytics':
          await this.handleAnalyticsSync(event, data);
          break;

        case 'preference':
          await this.handlePreferenceSync(event, data);
          break;

        case 'user':
          // User changes might be handled differently depending on your auth system
          break;
      }

      this.syncStatus.syncProgress.completed++;
    } catch (error) {
      this.syncStatus.syncProgress.failed++;
      throw error;
    }
  }

  /**
   * Handles chat entity synchronization with enhanced operations
   */
  private async handleChatSync(event: SyncEvent, data: any): Promise<void> {
    if (!this.cloudApi) return;

    switch (event.operation) {
      case 'create':
        await this.cloudApi.createChat(data);
        break;
      case 'update':
        await this.cloudApi.updateChat(event.entityId, data);
        break;
      case 'delete':
        await this.cloudApi.deleteChat(event.entityId);
        break;
      case 'batch_create':
        if (this.cloudApi.batchCreateChats && data.chatIds) {
          // For batch operations, we need to fetch the actual chat data
          const chats = [];
          for (const chatId of data.chatIds) {
            const chat = await this.localDb.getChat(chatId);
            if (chat) chats.push(chat);
          }
          await this.cloudApi.batchCreateChats(chats);
        }
        break;
      case 'batch_update':
        if (this.cloudApi.batchUpdateChats && data.updates) {
          await this.cloudApi.batchUpdateChats(data.updates);
        }
        break;
    }
  }

  /**
   * Handles message entity synchronization with enhanced operations
   */
  private async handleMessageSync(event: SyncEvent, data: any): Promise<void> {
    if (!this.cloudApi) return;

    switch (event.operation) {
      case 'create':
        await this.cloudApi.createMessage(data);
        break;
      case 'delete':
        await this.cloudApi.deleteMessage(event.entityId);
        break;
      case 'batch_create':
        if (this.cloudApi.batchCreateMessages && data.messageIds) {
          // For batch operations, we need to fetch the actual message data
          const messages = [];
          for (const messageId of data.messageIds) {
            const message = await this.localDb.getMessage(messageId);
            if (message) messages.push(message);
          }
          await this.cloudApi.batchCreateMessages(messages);
        }
        break;
      // Messages typically aren't updated, only created or deleted
    }
  }

  /**
   * Handles analytics entity synchronization
   */
  private async handleAnalyticsSync(event: SyncEvent, data: any): Promise<void> {
    if (!this.cloudApi?.updateChatAnalytics) return;

    switch (event.operation) {
      case 'create':
        // For analytics creation, we might need to use update with upsert logic
        await this.cloudApi.updateChatAnalytics(event.entityId, data);
        break;
      case 'update':
        await this.cloudApi.updateChatAnalytics(event.entityId, data);
        break;
      // Analytics are rarely deleted, usually just updated
    }
  }

  /**
   * Handles user preferences synchronization
   */
  private async handlePreferenceSync(event: SyncEvent, data: any): Promise<void> {
    if (!this.cloudApi?.updateUserPreferences) return;

    switch (event.operation) {
      case 'create':
      case 'update':
        await this.cloudApi.updateUserPreferences(data.userId, data);
        break;
      // Preferences are rarely deleted, usually just updated
    }
  }

  /**
   * Enhanced pull method that handles all entity types with conflict detection
   */
  private async pullCloudChanges(userId: string): Promise<void> {
    if (!this.cloudApi) return;

    // Get the last sync timestamp for this user
    const device = await this.localDb.queryPublic(
      'SELECT last_sync_at FROM device WHERE user_id = ? AND fingerprint = ?',
      [userId, this.localDb.getDeviceId()]
    );

    const lastSyncTimestamp = device.length > 0 ? device[0].last_sync_at : 0;

    try {
      this.syncStatus.syncProgress.currentOperation = 'Pulling chats from cloud';
      this.notifyStatusChange();

      // Pull chats with enhanced conflict detection
      const cloudChats = await this.cloudApi.getChats(userId, lastSyncTimestamp);
      for (const chat of cloudChats) {
        await this.applyCloudChangeWithConflictDetection('chat', chat);
      }

      this.syncStatus.syncProgress.currentOperation = 'Pulling messages from cloud';
      this.notifyStatusChange();

      // Pull messages for each chat
      const localChats = await this.localDb.getUserChats(userId);
      for (const chat of localChats) {
        const cloudMessages = await this.cloudApi.getMessages(chat.id, lastSyncTimestamp);
        for (const message of cloudMessages) {
          await this.applyCloudChangeWithConflictDetection('message', message);
        }
      }

      // Pull analytics if available
      if (this.cloudApi.getChatAnalytics) {
        this.syncStatus.syncProgress.currentOperation = 'Pulling analytics from cloud';
        this.notifyStatusChange();

        const cloudAnalytics = await this.cloudApi.getChatAnalytics(userId);
        for (const analytics of cloudAnalytics) {
          await this.applyCloudChangeWithConflictDetection('analytics', analytics);
        }
      }

      // Pull user preferences if available
      if (this.cloudApi.getUserPreferences) {
        this.syncStatus.syncProgress.currentOperation = 'Pulling preferences from cloud';
        this.notifyStatusChange();

        const cloudPreferences = await this.cloudApi.getUserPreferences(userId);
        if (cloudPreferences) {
          await this.applyCloudChangeWithConflictDetection('preferences', cloudPreferences);
        }
      }

    } catch (error) {
      console.error('Failed to pull cloud changes:', error);
      throw error;
    }
  }

  /**
   * Enhanced cloud change application with conflict detection and resolution
   */
  private async applyCloudChangeWithConflictDetection(
    entityType: 'chat' | 'message' | 'analytics' | 'preferences', 
    data: any
  ): Promise<void> {
    switch (entityType) {
      case 'chat':
        await this.applyChatCloudChange(data);
        break;
      case 'message':
        await this.applyMessageCloudChange(data);
        break;
      case 'analytics':
        await this.applyAnalyticsCloudChange(data);
        break;
      case 'preferences':
        await this.applyPreferencesCloudChange(data);
        break;
    }
  }

  /**
   * Applies chat changes from cloud with enhanced conflict detection
   */
  private async applyChatCloudChange(cloudChat: any): Promise<void> {
    const existingChat = await this.localDb.getChat(cloudChat.id);
    
    if (existingChat) {
      // Enhanced conflict detection for chats
      const hasLocalChanges = await this.hasUnsyncedChanges('chat', cloudChat.id);
      
      if (hasLocalChanges && cloudChat.updatedAt > existingChat.updatedAt) {
        // Conflict detected - different update times and unsynced local changes
        await this.handleConflict('chat', cloudChat.id, existingChat, cloudChat);
        return;
      }
      
      // Apply cloud changes if cloud version is newer
      if (cloudChat.updatedAt > existingChat.updatedAt) {
        await this.localDb.updateChat(cloudChat.id, {
          title: cloudChat.title,
          chatType: cloudChat.chatType,
          settings: cloudChat.settings,
          tags: cloudChat.tags,
          isPinned: cloudChat.isPinned,
          isArchived: cloudChat.isArchived,
          lastActivityAt: cloudChat.lastActivityAt,
          messageCount: cloudChat.messageCount,
          updatedAt: cloudChat.updatedAt,
          isDeleted: cloudChat.isDeleted
        });
      }
    } else {
      // Create new chat from cloud
      await this.localDb.createChat(cloudChat);
    }
  }

  /**
   * Applies message changes from cloud
   */
  private async applyMessageCloudChange(cloudMessage: any): Promise<void> {
    const existingMessage = await this.localDb.getMessage(cloudMessage.id);
    
    if (!existingMessage) {
      // Create new message from cloud
      await this.localDb.createMessage(cloudMessage);
    }
    // Messages typically aren't updated after creation, only created or deleted
  }

  /**
   * Applies analytics changes from cloud
   */
  private async applyAnalyticsCloudChange(cloudAnalytics: any): Promise<void> {
    const existingAnalytics = await this.localDb.getChatAnalytics(cloudAnalytics.chatId);
    
    if (existingAnalytics) {
      // For analytics, we typically want to merge data rather than replace
      const mergedAnalytics = {
        ...existingAnalytics,
        ...cloudAnalytics,
        // Take the maximum values for counters to avoid data loss
        totalMessages: Math.max(existingAnalytics.totalMessages || 0, cloudAnalytics.totalMessages || 0),
        totalTokens: Math.max(existingAnalytics.totalTokens || 0, cloudAnalytics.totalTokens || 0),
        totalCharacters: Math.max(existingAnalytics.totalCharacters || 0, cloudAnalytics.totalCharacters || 0),
        errorCount: Math.max(existingAnalytics.errorCount || 0, cloudAnalytics.errorCount || 0),
        successfulResponses: Math.max(existingAnalytics.successfulResponses || 0, cloudAnalytics.successfulResponses || 0),
        lastUsedAt: Math.max(existingAnalytics.lastUsedAt || 0, cloudAnalytics.lastUsedAt || 0)
      };
      
      // Update with merged data
      await this.localDb.updateChatAnalyticsOnMessage(
        cloudAnalytics.chatId,
        0, // No new characters
        0  // No new tokens
      );
    } else {
      // Create new analytics from cloud
      await this.localDb.createChatAnalytics(cloudAnalytics);
    }
  }

  /**
   * Applies user preferences changes from cloud
   */
  private async applyPreferencesCloudChange(cloudPreferences: any): Promise<void> {
    const existingPreferences = await this.localDb.getUserPreferences(cloudPreferences.userId);
    
    if (existingPreferences) {
      // Check for conflicts in preferences
      const hasLocalChanges = await this.hasUnsyncedChanges('preference', existingPreferences.id);
      
      if (hasLocalChanges && cloudPreferences.updatedAt > existingPreferences.updatedAt) {
        // Conflict detected - handle with merge strategy for preferences
        const mergedPreferences = {
          ...existingPreferences,
          ...cloudPreferences,
          // Keep local UI preferences but sync cloud AI preferences
          theme: existingPreferences.theme, // Keep local UI preference
          language: existingPreferences.language, // Keep local UI preference
          defaultModel: cloudPreferences.defaultModel, // Sync AI preference
          temperature: cloudPreferences.temperature, // Sync AI preference
          maxTokens: cloudPreferences.maxTokens, // Sync AI preference
          updatedAt: Math.max(existingPreferences.updatedAt || 0, cloudPreferences.updatedAt || 0)
        };
        
        await this.localDb.upsertUserPreferences(mergedPreferences);
        return;
      }
      
      // Apply cloud changes if cloud version is newer
      if (cloudPreferences.updatedAt > existingPreferences.updatedAt) {
        await this.localDb.upsertUserPreferences(cloudPreferences);
      }
    } else {
      // Create new preferences from cloud
      await this.localDb.upsertUserPreferences(cloudPreferences);
    }
  }

  /**
   * Checks if there are unsynced changes for a specific entity
   */
  private async hasUnsyncedChanges(entityType: string, entityId: string): Promise<boolean> {
    const unsyncedEvents = await this.localDb.queryPublic(
      'SELECT COUNT(*) as count FROM sync_event WHERE entity_type = ? AND entity_id = ? AND synced = 0',
      [entityType, entityId]
    );
    
    return unsyncedEvents.length > 0 && unsyncedEvents[0].count > 0;
  }

  /**
   * Handles conflicts between local and cloud data
   */
  private async handleConflict(
    entityType: string,
    entityId: string,
    localData: any,
    cloudData: any
  ): Promise<void> {
    this.syncStatus.conflictsDetected++;
    
    // Store conflict for resolution
    this.conflictQueue.set(`${entityType}:${entityId}`, {
      entityType,
      entityId,
      localData,
      cloudData
    });
    
    // If cloud API provides conflict resolution strategy
    if (this.cloudApi?.getConflictResolution) {
      try {
        const resolution = await this.cloudApi.getConflictResolution(entityType, entityId, localData, cloudData);
        await this.resolveConflict(entityType, entityId, resolution);
      } catch (error) {
        console.error('Auto conflict resolution failed:', error);
        // Fall back to manual resolution
      }
    }
    
    this.notifyStatusChange();
  }

  /**
   * Gets all pending conflicts for manual resolution
   */
  getPendingConflicts(): Array<{
    entityType: string;
    entityId: string;
    localData: any;
    cloudData: any;
  }> {
    return Array.from(this.conflictQueue.values());
  }

  /**
   * Manually resolve a specific conflict
   */
  async resolveConflictManually(
    entityType: string,
    entityId: string,
    resolution: 'local' | 'cloud' | 'merge',
    mergedData?: any
  ): Promise<void> {
    const conflictKey = `${entityType}:${entityId}`;
    const conflict = this.conflictQueue.get(conflictKey);
    
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictKey}`);
    }
    
    await this.resolveConflict(entityType, entityId, resolution, mergedData);
    this.conflictQueue.delete(conflictKey);
    this.syncStatus.conflictsDetected--;
    this.notifyStatusChange();
  }

  // Legacy method kept for backward compatibility
  private async applyCloudChange(entityType: 'chat' | 'message', data: any): Promise<void> {
    await this.applyCloudChangeWithConflictDetection(entityType, data);
  }

  async forcePullFromCloud(userId: string): Promise<void> {
    if (!this.cloudApi || !this.syncStatus.isOnline) {
      throw new Error('Cannot pull from cloud: offline or no cloud API');
    }

    this.syncStatus.syncing = true;
    this.notifyStatusChange();

    try {
      await this.pullCloudChanges(userId);
      this.syncStatus.lastSync = new Date();
      await this.localDb.updateLastSync(userId);
    } finally {
      this.syncStatus.syncing = false;
      this.notifyStatusChange();
    }
  }

  async forcePushToCloud(userId: string): Promise<void> {
    if (!this.cloudApi || !this.syncStatus.isOnline) {
      throw new Error('Cannot push to cloud: offline or no cloud API');
    }

    this.syncStatus.syncing = true;
    this.notifyStatusChange();

    try {
      await this.pushLocalChanges(userId);
      await this.updatePendingChangesCount();
    } finally {
      this.syncStatus.syncing = false;
      this.notifyStatusChange();
    }
  }

  async setSyncMode(userId: string, mode: SyncMode): Promise<void> {
    await this.localDb.updateSyncConfig(userId, { mode });
    
    if (mode === 'local-only') {
      this.stopAutoSync();
    } else if (mode === 'hybrid') {
      await this.startAutoSync(userId);
    }
  }

  async resolveConflict(
    entityType: 'chat' | 'message',
    entityId: string,
    resolution: 'local' | 'cloud' | 'merge'
  ): Promise<void> {
    // Basic conflict resolution implementation
    // In a production app, you'd want more sophisticated conflict resolution
    
    switch (resolution) {
      case 'local':
        // Keep local version, push to cloud
        const localData = entityType === 'chat' 
          ? await this.localDb.getChat(entityId)
          : await this.localDb.getMessage(entityId);
        
        if (localData) {
          await this.createSyncEventForEntity(entityType, entityId, 'update', localData);
        }
        break;

      case 'cloud':
        // Pull cloud version, overwrite local
        if (this.cloudApi) {
          // This would require additional API methods to get specific entities
          // Implementation depends on your cloud API structure
        }
        break;

      case 'merge':
        // Implement merge logic based on your business rules
        // This is highly application-specific
        break;
    }
  }

  private async createSyncEventForEntity(
    entityType: 'chat' | 'message',
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    data: any
  ): Promise<void> {
    await this.localDb.runPublic(
      `INSERT INTO sync_event (id, entity_type, entity_id, operation, data, timestamp, user_id, device_id, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.generateId(),
        entityType,
        entityId,
        operation,
        JSON.stringify(data),
        Math.floor(Date.now() / 1000),
        data.userId || data.user_id || 'unknown',
        this.localDb.getDeviceId(),
        0
      ]
    );
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Enhanced data export with analytics and preferences
   */
  async exportLocalData(): Promise<{
    chats: Chat[];
    messages: Message[];
    syncEvents: SyncEvent[];
    analytics: ChatAnalytics[];
    preferences: UserPreferences[];
  }> {
    const chats = await this.localDb.queryPublic('SELECT * FROM chat WHERE is_deleted = 0');
    const messages = await this.localDb.queryPublic('SELECT * FROM message WHERE is_deleted = 0');
    const syncEvents = await this.localDb.queryPublic('SELECT * FROM sync_event');
    const analytics = await this.localDb.queryPublic('SELECT * FROM chat_analytics');
    const preferences = await this.localDb.queryPublic('SELECT * FROM user_preferences');

    return { chats, messages, syncEvents, analytics, preferences };
  }

  /**
   * Batch sync optimization - processes multiple sync events efficiently
   */
  async optimizedBatchSync(userId: string): Promise<void> {
    if (!this.cloudApi || !this.syncStatus.isOnline) {
      return;
    }

    this.syncStatus.batchOperations.processing = true;
    this.notifyStatusChange();

    try {
      const unsyncedEvents = await this.localDb.getUnsyncedEvents(userId);
      
      if (unsyncedEvents.length === 0) {
        return;
      }

      // Group events by entity type and operation for batch processing
      const batchGroups = this.groupEventsByBatch(unsyncedEvents);
      
      // Process each batch group
      for (const [groupKey, events] of Object.entries(batchGroups)) {
        const [entityType, operation] = groupKey.split(':');
        
        if (operation === 'batch_create' && events.length > 1) {
          await this.processBatchCreate(entityType, events);
        } else {
          // Process individual events
          for (const event of events) {
            await this.pushEventToCloud(event);
            await this.localDb.markEventAsSynced(event.id);
          }
        }
      }

      await this.updatePendingChangesCount();
    } finally {
      this.syncStatus.batchOperations.processing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * Groups sync events for efficient batch processing
   */
  private groupEventsByBatch(events: SyncEvent[]): Record<string, SyncEvent[]> {
    const groups: Record<string, SyncEvent[]> = {};
    
    for (const event of events) {
      const key = `${event.entityType}:${event.operation}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    }
    
    return groups;
  }

  /**
   * Processes batch create operations efficiently
   */
  private async processBatchCreate(entityType: string, events: SyncEvent[]): Promise<void> {
    if (!this.cloudApi) return;

    const data = events.map(event => JSON.parse(event.data || '{}'));
    
    try {
      switch (entityType) {
        case 'chat':
          if (this.cloudApi.batchCreateChats) {
            await this.cloudApi.batchCreateChats(data);
          }
          break;
        case 'message':
          if (this.cloudApi.batchCreateMessages) {
            await this.cloudApi.batchCreateMessages(data);
          }
          break;
        default:
          // Fall back to individual processing for other entity types
          for (const event of events) {
            await this.pushEventToCloud(event);
          }
          return;
      }

      // Mark all events as synced
      for (const event of events) {
        await this.localDb.markEventAsSynced(event.id);
      }
    } catch (error) {
      console.error(`Batch create failed for ${entityType}:`, error);
      // Fall back to individual processing
      for (const event of events) {
        try {
          await this.pushEventToCloud(event);
          await this.localDb.markEventAsSynced(event.id);
        } catch (individualError) {
          console.error(`Individual sync failed for event ${event.id}:`, individualError);
        }
      }
    }
  }

  /**
   * Gets detailed sync analytics
   */
  getSyncAnalytics(): {
    totalSyncEvents: number;
    avgSyncTime: number;
    syncSpeed: number;
    successRate: number;
    conflictsResolved: number;
    lastSyncPerformance: {
      duration: number;
      eventsProcessed: number;
      errors: number;
    };
  } {
    const syncTimes = this.syncMetrics.syncTimes;
    const eventsCounts = this.syncMetrics.eventsCounts;
    
    const avgSyncTime = syncTimes.length > 0 
      ? syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length 
      : 0;
    
    const totalEvents = eventsCounts.reduce((a, b) => a + b, 0);
    const totalTime = syncTimes.reduce((a, b) => a + b, 0);
    const syncSpeed = totalTime > 0 ? (totalEvents / (totalTime / 1000)) : 0; // events per second
    
    const successfulSyncs = syncTimes.length;
    const totalAttempts = successfulSyncs + this.syncStatus.syncProgress.failed;
    const successRate = totalAttempts > 0 ? (successfulSyncs / totalAttempts) * 100 : 0;

    return {
      totalSyncEvents: totalEvents,
      avgSyncTime,
      syncSpeed,
      successRate,
      conflictsResolved: this.syncStatus.conflictsDetected,
      lastSyncPerformance: {
        duration: this.syncStatus.analytics.lastSyncDuration,
        eventsProcessed: eventsCounts[eventsCounts.length - 1] || 0,
        errors: this.syncStatus.syncProgress.failed
      }
    };
  }

  /**
   * Optimizes local database by cleaning up old sync events and compacting data
   */
  async optimizeLocalStorage(retentionDays: number = 30): Promise<{
    deletedSyncEvents: number;
    compactedAnalytics: number;
    freedSpace: number;
  }> {
    const cutoffDate = Math.floor((Date.now() - (retentionDays * 24 * 60 * 60 * 1000)) / 1000);
    
    // Clean up old synced events
    const deletedEvents = await this.localDb.runPublic(
      'DELETE FROM sync_event WHERE synced = 1 AND timestamp < ?',
      [cutoffDate]
    );

    // Compact analytics by merging old daily data into weekly/monthly summaries
    const analyticsCompacted = await this.compactAnalyticsData();

    // Calculate approximate space freed (this is an estimate)
    const freedSpace = deletedEvents.changes * 500; // Rough estimate of bytes per sync event

    return {
      deletedSyncEvents: deletedEvents.changes,
      compactedAnalytics: analyticsCompacted,
      freedSpace
    };
  }

  /**
   * Compacts analytics data for better storage efficiency
   */
  private async compactAnalyticsData(): Promise<number> {
    // This is a simplified version - in production you'd implement more sophisticated
    // data compaction based on your analytics requirements
    
    const oldAnalytics = await this.localDb.queryPublic(
      'SELECT * FROM chat_analytics WHERE updated_at < ?',
      [Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)] // 7 days ago
    );

    let compacted = 0;
    
    for (const analytics of oldAnalytics) {
      // Compact daily usage data if it exists
      if (analytics.daily_usage) {
        try {
          const dailyData = JSON.parse(analytics.daily_usage);
          // Keep only the last 30 days of daily data
          const compactedDaily = Object.fromEntries(
            Object.entries(dailyData).slice(-30)
          );
          
          await this.localDb.runPublic(
            'UPDATE chat_analytics SET daily_usage = ? WHERE id = ?',
            [JSON.stringify(compactedDaily), analytics.id]
          );
          
          compacted++;
        } catch (error) {
          console.warn('Failed to compact analytics data:', error);
        }
      }
    }

    return compacted;
  }

  async importData(data: {
    chats?: Chat[];
    messages?: Message[];
  }, userId: string): Promise<void> {
    this.syncStatus.syncing = true;
    this.notifyStatusChange();

    try {
      if (data.chats) {
        for (const chat of data.chats) {
          await this.localDb.createChat(chat);
        }
      }

      if (data.messages) {
        for (const message of data.messages) {
          await this.localDb.createMessage(message);
        }
      }

      await this.updatePendingChangesCount();
    } finally {
      this.syncStatus.syncing = false;
      this.notifyStatusChange();
    }
  }

  cleanup(): void {
    this.stopAutoSync();
    this.statusCallbacks.clear();
  }
}

// Singleton instance
let syncManager: SyncManager | null = null;

export function getSyncManager(cloudApi?: CloudAPI): SyncManager {
  if (!syncManager) {
    syncManager = new SyncManager(cloudApi);
  }
  return syncManager;
}