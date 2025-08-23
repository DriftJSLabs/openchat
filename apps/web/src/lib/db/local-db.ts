import { nanoid } from 'nanoid';
import type { 
  Chat, 
  Message, 
  User, 
  SyncEvent, 
  Device, 
  SyncConfig,
  ChatAnalytics,
  UserPreferences,
  InsertChat,
  InsertMessage,
  InsertUser,
  InsertSyncEvent,
  InsertDevice,
  InsertSyncConfig,
  InsertChatAnalytics,
  InsertUserPreferences
} from './schema/shared';

interface DatabaseOperation {
  type: 'query' | 'run';
  sql: string;
  params: any[];
}

interface WorkerMessage {
  type: string;
  id: string;
  payload?: any;
}

interface WorkerResponse {
  type: string;
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

export class LocalDatabase {
  private worker: Worker | null = null;
  private pendingOperations = new Map<string, { resolve: Function; reject: Function }>();
  private initialized = false;
  private deviceId: string;

  constructor() {
    this.deviceId = this.generateDeviceFingerprint();
    this.initializeWorker();
  }

  private generateDeviceFingerprint(): string {
    // Create a device fingerprint based on available browser features
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx!.textBaseline = 'top';
    ctx!.font = '14px Arial';
    ctx!.fillText('Device fingerprint', 2, 2);
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private initializeWorker(): void {
    // @ts-ignore - Turbopack static analysis limitation
    // eslint-disable-next-line
    this.worker = new Worker('/db-worker.js');
    
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, id, success, result, error } = event.data;
      
      // Handle initialization response
      if (type === 'INITIALIZE_RESULT') {
        this.initialized = success;
        if (!success) {
          console.error('Failed to initialize database:', error);
        }
        const pending = this.pendingOperations.get(id);
        if (pending) {
          this.pendingOperations.delete(id);
          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error || 'Database initialization failed'));
          }
        }
        return;
      }

      const pending = this.pendingOperations.get(id);
      if (pending) {
        this.pendingOperations.delete(id);
        
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Database operation failed'));
        }
      }
    };

    this.worker.onerror = (error) => {
      console.error('Database worker error:', error);
    };

    // Initialize the database
    this.sendMessage({ type: 'INITIALIZE', id: nanoid() }).then(() => {
      console.log('Database initialized successfully');
    }).catch(err => {
      console.error('Database initialization failed:', err);
      this.initialized = false;
    });
  }

  private async sendMessage(message: WorkerMessage): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingOperations.delete(message.id);
        reject(new Error('Database operation timeout'));
      }, 10000); // 10 second timeout

      this.pendingOperations.set(message.id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.worker!.postMessage(message);
    });
  }

  private async query(sql: string, params: any[] = []): Promise<any[]> {
    return this.sendMessage({
      type: 'QUERY',
      id: nanoid(),
      payload: { sql, params }
    });
  }

  private async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    return this.sendMessage({
      type: 'RUN',
      id: nanoid(),
      payload: { sql, params }
    });
  }

  private convertBooleanFields(row: any, tableName: string): any {
    if (!row) return row;

    const booleanFields: { [table: string]: string[] } = {
      'user': ['emailVerified'],
      'chat': ['isPinned', 'isArchived', 'isDeleted'],
      'message': ['isDeleted'],
      'user_preferences': ['compactMode', 'enableNotifications', 'enableSounds', 'enableTypingIndicators', 'enableReadReceipts', 'enableOnlineStatus', 'enableSystemMessages', 'enableAutoSave', 'enableCloudSync', 'enableLocalBackup'],
      'sync_event': ['synced']
    };

    const fieldsToConvert = booleanFields[tableName] || [];
    const converted = { ...row };

    fieldsToConvert.forEach(field => {
      if (field in converted && typeof converted[field] === 'number') {
        converted[field] = Boolean(converted[field]);
      }
    });

    return converted;
  }

  private convertQueryResults(results: any[], tableName?: string): any[] {
    if (!tableName) return results;
    return results.map(row => this.convertBooleanFields(row, tableName));
  }

  private async transaction(operations: DatabaseOperation[]): Promise<void> {
    return this.sendMessage({
      type: 'TRANSACTION',
      id: nanoid(),
      payload: { operations }
    });
  }

  // Wait for initialization
  async waitForInitialization(): Promise<void> {
    const maxAttempts = 100; // 10 seconds total (100ms * 100)
    let attempts = 0;
    
    while (!this.initialized && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.initialized) {
      throw new Error('Database initialization timeout after 10 seconds');
    }
  }

  // User operations
  async createUser(user: InsertUser): Promise<User> {
    await this.waitForInitialization();
    
    const now = new Date();
    const userData = {
      id: user.id || nanoid(),
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified ? 1 : 0,
      image: user.image || null,
      createdAt: user.createdAt || Math.floor(now.getTime() / 1000),
      updatedAt: user.updatedAt || Math.floor(now.getTime() / 1000)
    };

    await this.run(
      `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userData.id, userData.name, userData.email, userData.emailVerified, userData.image, userData.createdAt, userData.updatedAt]
    );

    await this.createSyncEvent('user', userData.id, 'create', userData);
    
    // Return with converted boolean fields
    return this.convertBooleanFields(userData, 'user') as User;
  }

  async getUser(id: string): Promise<User | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM user WHERE id = ?', [id]);
    if (result.length > 0) {
      return this.convertBooleanFields(result[0], 'user') as User;
    }
    return null;
  }

  // Enhanced Chat operations with new fields
  async createChat(chat: InsertChat): Promise<Chat> {
    await this.waitForInitialization();
    
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    const chatData = {
      id: chat.id || nanoid(),
      title: chat.title,
      userId: chat.userId,
      // Enhanced chat fields
      chatType: chat.chatType || 'conversation',
      settings: chat.settings || null,
      tags: chat.tags || null,
      isPinned: chat.isPinned ? 1 : 0,
      isArchived: chat.isArchived ? 1 : 0,
      lastActivityAt: chat.lastActivityAt || timestamp,
      messageCount: chat.messageCount || 0,
      createdAt: chat.createdAt || timestamp,
      updatedAt: chat.updatedAt || timestamp,
      isDeleted: chat.isDeleted ? 1 : 0
    };

    await this.run(
      `INSERT INTO chat (
        id, title, user_id, chat_type, settings, tags, is_pinned, is_archived, 
        last_activity_at, message_count, created_at, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatData.id, chatData.title, chatData.userId, chatData.chatType,
        chatData.settings, chatData.tags, chatData.isPinned, chatData.isArchived,
        chatData.lastActivityAt, chatData.messageCount, chatData.createdAt,
        chatData.updatedAt, chatData.isDeleted
      ]
    );

    // Create initial analytics entry for the chat
    await this.createChatAnalytics({
      userId: chatData.userId,
      chatId: chatData.id,
      totalMessages: 0,
      totalTokens: 0,
      avgResponseTime: 0,
      totalCharacters: 0,
      sessionsCount: 1,
      lastUsedAt: timestamp,
      errorCount: 0,
      successfulResponses: 0,
      avgTokensPerMessage: 0
    });

    await this.createSyncEvent('chat', chatData.id, 'create', chatData);
    return this.convertBooleanFields(chatData, 'chat') as Chat;
  }

  async getUserChats(userId: string): Promise<Chat[]> {
    await this.waitForInitialization();
    const results = await this.query(
      'SELECT * FROM chat WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
      [userId]
    );
    return this.convertQueryResults(results, 'chat') as Chat[];
  }

  async getChat(id: string): Promise<Chat | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM chat WHERE id = ? AND is_deleted = 0', [id]);
    return result.length > 0 ? this.convertBooleanFields(result[0], 'chat') : null;
  }

  async updateChat(id: string, updates: Partial<Chat>): Promise<void> {
    await this.waitForInitialization();
    
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map(key => updates[key as keyof Chat]);
    const setClause = fields.map(key => `${key} = ?`).join(', ');

    if (fields.length === 0) return;

    await this.run(
      `UPDATE chat SET ${setClause}, updated_at = ? WHERE id = ?`,
      [...values, Math.floor(Date.now() / 1000), id]
    );

    await this.createSyncEvent('chat', id, 'update', updates);
  }

  async deleteChat(id: string): Promise<void> {
    await this.waitForInitialization();
    
    await this.run(
      'UPDATE chat SET is_deleted = 1, updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), id]
    );

    await this.createSyncEvent('chat', id, 'delete', { id });
  }

  // Enhanced Message operations with new fields
  async createMessage(message: InsertMessage): Promise<Message> {
    await this.waitForInitialization();
    
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    const messageData = {
      id: message.id || nanoid(),
      chatId: message.chatId,
      role: message.role,
      content: message.content,
      // Enhanced message fields
      messageType: message.messageType || 'text',
      metadata: message.metadata || null,
      parentMessageId: message.parentMessageId || null,
      editHistory: message.editHistory || null,
      tokenCount: message.tokenCount || 0,
      createdAt: message.createdAt || timestamp,
      isDeleted: message.isDeleted ? 1 : 0
    };

    // Start transaction for atomic operations
    const operations: any[] = [
      {
        type: 'run',
        sql: `INSERT INTO message (
          id, chat_id, role, content, message_type, metadata, parent_message_id, 
          edit_history, token_count, created_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          messageData.id, messageData.chatId, messageData.role, messageData.content,
          messageData.messageType, messageData.metadata, messageData.parentMessageId,
          messageData.editHistory, messageData.tokenCount, messageData.createdAt,
          messageData.isDeleted
        ]
      },
      // Update chat's message count and last activity
      {
        type: 'run',
        sql: `UPDATE chat SET 
          message_count = message_count + 1,
          last_activity_at = ?,
          updated_at = ?
        WHERE id = ?`,
        params: [timestamp, timestamp, messageData.chatId]
      }
    ];

    await this.transaction(operations);

    // Update chat analytics asynchronously
    await this.updateChatAnalyticsOnMessage(messageData.chatId, messageData.content.length, messageData.tokenCount);

    await this.createSyncEvent('message', messageData.id, 'create', messageData);
    return this.convertBooleanFields(messageData, 'message') as Message;
  }

  async getChatMessages(chatId: string): Promise<Message[]> {
    await this.waitForInitialization();
    const results = await this.query(
      'SELECT * FROM message WHERE chat_id = ? AND is_deleted = 0 ORDER BY created_at ASC',
      [chatId]
    );
    return this.convertQueryResults(results, 'message') as Message[];
  }

  async getMessage(id: string): Promise<Message | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM message WHERE id = ? AND is_deleted = 0', [id]);
    return result.length > 0 ? result[0] : null;
  }

  async deleteMessage(id: string): Promise<void> {
    await this.waitForInitialization();
    
    await this.run(
      'UPDATE message SET is_deleted = 1 WHERE id = ?',
      [id]
    );

    await this.createSyncEvent('message', id, 'delete', { id });
  }

  // Sync event operations
  private async createSyncEvent(entityType: string, entityId: string, operation: string, data: any): Promise<void> {
    const event: InsertSyncEvent = {
      id: nanoid(),
      entityType: entityType as any,
      entityId,
      operation: operation as any,
      data: JSON.stringify(data),
      timestamp: Math.floor(Date.now() / 1000),
      userId: data.userId || data.user_id || 'unknown',
      deviceId: this.deviceId,
      synced: false
    };

    await this.run(
      `INSERT INTO sync_event (id, entity_type, entity_id, operation, data, timestamp, user_id, device_id, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.entityType, event.entityId, event.operation, event.data, event.timestamp, event.userId, event.deviceId, event.synced ? 1 : 0]
    );
    
    // Emit custom event for real-time sync
    if (event.userId && event.userId !== 'unknown' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('local-db-change', { 
        detail: { userId: event.userId, entityType, operation } 
      }));
    }
  }

  async getUnsyncedEvents(userId?: string): Promise<SyncEvent[]> {
    await this.waitForInitialization();
    
    if (userId) {
      return this.query(
        'SELECT * FROM sync_event WHERE synced = 0 AND user_id = ? ORDER BY timestamp ASC',
        [userId]
      );
    }
    
    return this.query('SELECT * FROM sync_event WHERE synced = 0 ORDER BY timestamp ASC');
  }

  async markEventAsSynced(eventId: string): Promise<void> {
    await this.waitForInitialization();
    await this.run('UPDATE sync_event SET synced = 1 WHERE id = ?', [eventId]);
  }

  // Device and sync configuration
  async registerDevice(userId: string): Promise<Device> {
    await this.waitForInitialization();
    
    const device: InsertDevice = {
      id: nanoid(),
      userId,
      fingerprint: this.deviceId,
      lastSyncAt: null,
      createdAt: Math.floor(Date.now() / 1000)
    };

    try {
      await this.run(
        `INSERT INTO device (id, user_id, fingerprint, last_sync_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [device.id, device.userId, device.fingerprint, device.lastSyncAt, device.createdAt]
      );
    } catch (error) {
      // Device might already exist, update instead
      await this.run(
        'UPDATE device SET user_id = ?, created_at = ? WHERE fingerprint = ?',
        [userId, device.createdAt, this.deviceId]
      );
    }

    return device as Device;
  }

  async updateLastSync(userId: string): Promise<void> {
    await this.waitForInitialization();
    await this.run(
      'UPDATE device SET last_sync_at = ? WHERE user_id = ? AND fingerprint = ?',
      [Math.floor(Date.now() / 1000), userId, this.deviceId]
    );
  }

  async getSyncConfig(userId: string): Promise<SyncConfig | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM sync_config WHERE user_id = ?', [userId]);
    return result.length > 0 ? result[0] : null;
  }

  async updateSyncConfig(userId: string, config: Partial<SyncConfig>): Promise<void> {
    await this.waitForInitialization();
    
    const existing = await this.getSyncConfig(userId);
    
    if (existing) {
      const fields = Object.keys(config).filter(key => key !== 'id' && key !== 'userId');
      const values = fields.map(key => config[key as keyof SyncConfig]);
      const setClause = fields.map(key => `${key} = ?`).join(', ');

      if (fields.length > 0) {
        await this.run(
          `UPDATE sync_config SET ${setClause}, updated_at = ? WHERE user_id = ?`,
          [...values, Math.floor(Date.now() / 1000), userId]
        );
      }
    } else {
      const configData: InsertSyncConfig = {
        id: nanoid(),
        userId,
        mode: config.mode || 'hybrid',
        autoSync: config.autoSync !== undefined ? config.autoSync : true,
        syncInterval: config.syncInterval || 30000,
        updatedAt: Math.floor(Date.now() / 1000)
      };

      await this.run(
        `INSERT INTO sync_config (id, user_id, mode, auto_sync, sync_interval, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [configData.id, configData.userId, configData.mode, configData.autoSync ? 1 : 0, configData.syncInterval, configData.updatedAt]
      );
    }
  }

  // Cleanup and utility methods
  cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  // Expose query method for sync manager (public version of private query)
  async queryPublic(sql: string, params: any[] = []): Promise<any[]> {
    await this.waitForInitialization();
    return this.query(sql, params);
  }

  // Expose run method for sync manager (public version of private run)
  async runPublic(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    await this.waitForInitialization();
    return this.run(sql, params);
  }

  // ===============================
  // Chat Analytics Operations
  // ===============================

  /**
   * Creates a new chat analytics entry with comprehensive tracking metrics
   */
  async createChatAnalytics(analytics: InsertChatAnalytics): Promise<ChatAnalytics> {
    await this.waitForInitialization();
    
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    const analyticsData = {
      id: analytics.id || nanoid(),
      userId: analytics.userId,
      chatId: analytics.chatId || null,
      totalMessages: analytics.totalMessages || 0,
      totalTokens: analytics.totalTokens || 0,
      avgResponseTime: analytics.avgResponseTime || 0,
      totalCharacters: analytics.totalCharacters || 0,
      sessionsCount: analytics.sessionsCount || 0,
      lastUsedAt: analytics.lastUsedAt || timestamp,
      dailyUsage: analytics.dailyUsage || null,
      weeklyUsage: analytics.weeklyUsage || null,
      monthlyUsage: analytics.monthlyUsage || null,
      errorCount: analytics.errorCount || 0,
      successfulResponses: analytics.successfulResponses || 0,
      avgTokensPerMessage: analytics.avgTokensPerMessage || 0,
      createdAt: analytics.createdAt || timestamp,
      updatedAt: analytics.updatedAt || timestamp
    };

    await this.run(
      `INSERT INTO chat_analytics (
        id, user_id, chat_id, total_messages, total_tokens, avg_response_time,
        total_characters, sessions_count, last_used_at, daily_usage, weekly_usage,
        monthly_usage, error_count, successful_responses, avg_tokens_per_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        analyticsData.id, analyticsData.userId, analyticsData.chatId,
        analyticsData.totalMessages, analyticsData.totalTokens, analyticsData.avgResponseTime,
        analyticsData.totalCharacters, analyticsData.sessionsCount, analyticsData.lastUsedAt,
        analyticsData.dailyUsage, analyticsData.weeklyUsage, analyticsData.monthlyUsage,
        analyticsData.errorCount, analyticsData.successfulResponses, analyticsData.avgTokensPerMessage,
        analyticsData.createdAt, analyticsData.updatedAt
      ]
    );

    await this.createSyncEvent('analytics', analyticsData.id, 'create', analyticsData);
    return analyticsData as ChatAnalytics;
  }

  /**
   * Updates analytics data when a new message is created
   */
  async updateChatAnalyticsOnMessage(chatId: string, characterCount: number, tokenCount: number): Promise<void> {
    await this.waitForInitialization();
    
    const timestamp = Math.floor(Date.now() / 1000);
    
    // First try to find existing analytics for this chat
    const existingAnalytics = await this.query(
      'SELECT * FROM chat_analytics WHERE chat_id = ? LIMIT 1',
      [chatId]
    );

    if (existingAnalytics.length === 0) {
      // Create analytics if none exist
      const chat = await this.getChat(chatId);
      if (chat) {
        await this.createChatAnalytics({
          userId: chat.userId,
          chatId: chatId,
          totalMessages: 1,
          totalTokens: tokenCount,
          totalCharacters: characterCount,
          lastUsedAt: timestamp
        });
      }
      return;
    }

    const analytics = existingAnalytics[0];
    const newTotalMessages = analytics.total_messages + 1;
    const newTotalTokens = analytics.total_tokens + tokenCount;
    const newTotalCharacters = analytics.total_characters + characterCount;
    const newAvgTokensPerMessage = Math.round(newTotalTokens / newTotalMessages);

    await this.run(
      `UPDATE chat_analytics SET 
        total_messages = ?,
        total_tokens = ?,
        total_characters = ?,
        avg_tokens_per_message = ?,
        last_used_at = ?,
        updated_at = ?
      WHERE chat_id = ?`,
      [
        newTotalMessages, newTotalTokens, newTotalCharacters,
        newAvgTokensPerMessage, timestamp, timestamp, chatId
      ]
    );

    await this.createSyncEvent('analytics', analytics.id, 'update', {
      chatId,
      totalMessages: newTotalMessages,
      totalTokens: newTotalTokens,
      totalCharacters: newTotalCharacters,
      avgTokensPerMessage: newAvgTokensPerMessage
    });
  }

  /**
   * Gets analytics for a specific chat
   */
  async getChatAnalytics(chatId: string): Promise<ChatAnalytics | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM chat_analytics WHERE chat_id = ?', [chatId]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Gets all analytics for a user
   */
  async getUserAnalytics(userId: string): Promise<ChatAnalytics[]> {
    await this.waitForInitialization();
    return this.query(
      'SELECT * FROM chat_analytics WHERE user_id = ? ORDER BY last_used_at DESC',
      [userId]
    );
  }

  // ===============================
  // User Preferences Operations
  // ===============================

  /**
   * Creates or updates user preferences
   */
  async upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    await this.waitForInitialization();
    
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    
    // Check if preferences already exist
    const existing = await this.query(
      'SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1',
      [preferences.userId]
    );

    if (existing.length > 0) {
      // Update existing preferences
      const fields = Object.keys(preferences).filter(key => key !== 'id' && key !== 'userId' && key !== 'createdAt');
      const values = fields.map(key => preferences[key as keyof InsertUserPreferences]);
      const setClause = fields.map(key => `${key} = ?`).join(', ');

      if (fields.length > 0) {
        await this.run(
          `UPDATE user_preferences SET ${setClause}, updated_at = ? WHERE user_id = ?`,
          [...values, timestamp, preferences.userId]
        );
      }

      const updated = await this.query(
        'SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1',
        [preferences.userId]
      );

      await this.createSyncEvent('preference', existing[0].id, 'update', updated[0]);
      return updated[0];
    } else {
      // Create new preferences
      const preferencesData = {
        id: preferences.id || nanoid(),
        userId: preferences.userId,
        theme: preferences.theme || 'system',
        language: preferences.language || 'en',
        fontSize: preferences.fontSize || 'medium',
        compactMode: preferences.compactMode ? 1 : 0,
        defaultChatType: preferences.defaultChatType || 'conversation',
        autoSaveChats: preferences.autoSaveChats !== false ? 1 : 0,
        showTimestamps: preferences.showTimestamps !== false ? 1 : 0,
        enableNotifications: preferences.enableNotifications !== false ? 1 : 0,
        defaultModel: preferences.defaultModel || 'gpt-4',
        temperature: preferences.temperature || 70,
        maxTokens: preferences.maxTokens || 2048,
        contextWindow: preferences.contextWindow || 8192,
        allowAnalytics: preferences.allowAnalytics !== false ? 1 : 0,
        allowDataSharing: preferences.allowDataSharing ? 1 : 0,
        retentionPeriod: preferences.retentionPeriod || 365,
        exportFormat: preferences.exportFormat || 'json',
        includeMetadata: preferences.includeMetadata !== false ? 1 : 0,
        customSettings: preferences.customSettings || null,
        createdAt: preferences.createdAt || timestamp,
        updatedAt: preferences.updatedAt || timestamp
      };

      await this.run(
        `INSERT INTO user_preferences (
          id, user_id, theme, language, font_size, compact_mode, default_chat_type,
          auto_save_chats, show_timestamps, enable_notifications, default_model,
          temperature, max_tokens, context_window, allow_analytics, allow_data_sharing,
          retention_period, export_format, include_metadata, custom_settings,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          preferencesData.id, preferencesData.userId, preferencesData.theme,
          preferencesData.language, preferencesData.fontSize, preferencesData.compactMode,
          preferencesData.defaultChatType, preferencesData.autoSaveChats, preferencesData.showTimestamps,
          preferencesData.enableNotifications, preferencesData.defaultModel, preferencesData.temperature,
          preferencesData.maxTokens, preferencesData.contextWindow, preferencesData.allowAnalytics,
          preferencesData.allowDataSharing, preferencesData.retentionPeriod, preferencesData.exportFormat,
          preferencesData.includeMetadata, preferencesData.customSettings, preferencesData.createdAt,
          preferencesData.updatedAt
        ]
      );

      await this.createSyncEvent('preference', preferencesData.id, 'create', preferencesData);
      return preferencesData as UserPreferences;
    }
  }

  /**
   * Gets user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    await this.waitForInitialization();
    const result = await this.query('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    return result.length > 0 ? result[0] : null;
  }

  // ===============================
  // Batch Operations for Performance
  // ===============================

  /**
   * Creates multiple chats in a single transaction for better sync performance
   */
  async batchCreateChats(chats: InsertChat[]): Promise<Chat[]> {
    await this.waitForInitialization();
    
    if (chats.length === 0) return [];

    const operations: any[] = [];
    const createdChats: Chat[] = [];
    const timestamp = Math.floor(Date.now() / 1000);

    for (const chat of chats) {
      const chatData = {
        id: chat.id || nanoid(),
        title: chat.title,
        userId: chat.userId,
        chatType: chat.chatType || 'conversation',
        settings: chat.settings || null,
        tags: chat.tags || null,
        isPinned: chat.isPinned ? 1 : 0,
        isArchived: chat.isArchived ? 1 : 0,
        lastActivityAt: chat.lastActivityAt || timestamp,
        messageCount: chat.messageCount || 0,
        createdAt: chat.createdAt || timestamp,
        updatedAt: chat.updatedAt || timestamp,
        isDeleted: chat.isDeleted ? 1 : 0
      };

      operations.push({
        type: 'run',
        sql: `INSERT INTO chat (
          id, title, user_id, chat_type, settings, tags, is_pinned, is_archived, 
          last_activity_at, message_count, created_at, updated_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          chatData.id, chatData.title, chatData.userId, chatData.chatType,
          chatData.settings, chatData.tags, chatData.isPinned, chatData.isArchived,
          chatData.lastActivityAt, chatData.messageCount, chatData.createdAt,
          chatData.updatedAt, chatData.isDeleted
        ]
      });

      createdChats.push(chatData as Chat);
    }

    await this.transaction(operations);

    // Create batch sync event
    await this.createSyncEvent('chat', 'batch', 'batch_create', {
      chatIds: createdChats.map(c => c.id),
      count: createdChats.length,
      userId: chats[0].userId
    });

    return createdChats;
  }

  /**
   * Creates multiple messages in a single transaction for better sync performance
   */
  async batchCreateMessages(messages: InsertMessage[]): Promise<Message[]> {
    await this.waitForInitialization();
    
    if (messages.length === 0) return [];

    const operations: any[] = [];
    const createdMessages: Message[] = [];
    const timestamp = Math.floor(Date.now() / 1000);
    const chatUpdates = new Map<string, { messageCount: number, lastActivity: number }>();

    for (const message of messages) {
      const messageData = {
        id: message.id || nanoid(),
        chatId: message.chatId,
        role: message.role,
        content: message.content,
        messageType: message.messageType || 'text',
        metadata: message.metadata || null,
        parentMessageId: message.parentMessageId || null,
        editHistory: message.editHistory || null,
        tokenCount: message.tokenCount || 0,
        createdAt: message.createdAt || timestamp,
        isDeleted: message.isDeleted ? 1 : 0
      };

      operations.push({
        type: 'run',
        sql: `INSERT INTO message (
          id, chat_id, role, content, message_type, metadata, parent_message_id, 
          edit_history, token_count, created_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          messageData.id, messageData.chatId, messageData.role, messageData.content,
          messageData.messageType, messageData.metadata, messageData.parentMessageId,
          messageData.editHistory, messageData.tokenCount, messageData.createdAt,
          messageData.isDeleted
        ]
      });

      // Track chat updates
      const current = chatUpdates.get(messageData.chatId) || { messageCount: 0, lastActivity: 0 };
      chatUpdates.set(messageData.chatId, {
        messageCount: current.messageCount + 1,
        lastActivity: Math.max(current.lastActivity, messageData.createdAt)
      });

      createdMessages.push(messageData as Message);
    }

    // Add chat update operations
    for (const [chatId, updates] of chatUpdates) {
      operations.push({
        type: 'run',
        sql: `UPDATE chat SET 
          message_count = message_count + ?,
          last_activity_at = ?,
          updated_at = ?
        WHERE id = ?`,
        params: [updates.messageCount, updates.lastActivity, timestamp, chatId]
      });
    }

    await this.transaction(operations);

    // Create batch sync event
    await this.createSyncEvent('message', 'batch', 'batch_create', {
      messageIds: createdMessages.map(m => m.id),
      count: createdMessages.length,
      chatIds: Array.from(chatUpdates.keys())
    });

    return createdMessages;
  }

  /**
   * Enhanced search functionality for chats with filters
   */
  async searchChats(userId: string, options: {
    query?: string;
    chatType?: string;
    isPinned?: boolean;
    isArchived?: boolean;
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<Chat[]> {
    await this.waitForInitialization();
    
    let sql = 'SELECT * FROM chat WHERE user_id = ? AND is_deleted = 0';
    const params: any[] = [userId];

    if (options.query) {
      sql += ' AND title LIKE ?';
      params.push(`%${options.query}%`);
    }

    if (options.chatType) {
      sql += ' AND chat_type = ?';
      params.push(options.chatType);
    }

    if (options.isPinned !== undefined) {
      sql += ' AND is_pinned = ?';
      params.push(options.isPinned ? 1 : 0);
    }

    if (options.isArchived !== undefined) {
      sql += ' AND is_archived = ?';
      params.push(options.isArchived ? 1 : 0);
    }

    if (options.tags && options.tags.length > 0) {
      // Simple tag search - in production you might want more sophisticated JSON querying
      const tagConditions = options.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      params.push(...options.tags.map(tag => `%"${tag}"%`));
    }

    sql += ' ORDER BY last_activity_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    return this.query(sql, params);
  }

  /**
   * Gets comprehensive chat statistics for analytics
   */
  async getChatStatistics(userId: string): Promise<{
    totalChats: number;
    totalMessages: number;
    totalTokens: number;
    averageMessagesPerChat: number;
    mostActiveChat: { chatId: string; title: string; messageCount: number } | null;
    chatsByType: Record<string, number>;
  }> {
    await this.waitForInitialization();
    
    const [totalChats] = await this.query(
      'SELECT COUNT(*) as count FROM chat WHERE user_id = ? AND is_deleted = 0',
      [userId]
    );

    const [totalMessages] = await this.query(
      'SELECT COUNT(*) as count FROM message m JOIN chat c ON m.chat_id = c.id WHERE c.user_id = ? AND m.is_deleted = 0 AND c.is_deleted = 0',
      [userId]
    );

    const [totalTokens] = await this.query(
      'SELECT SUM(token_count) as total FROM message m JOIN chat c ON m.chat_id = c.id WHERE c.user_id = ? AND m.is_deleted = 0 AND c.is_deleted = 0',
      [userId]
    );

    const mostActiveChats = await this.query(
      'SELECT id, title, message_count FROM chat WHERE user_id = ? AND is_deleted = 0 ORDER BY message_count DESC LIMIT 1',
      [userId]
    );

    const chatsByType = await this.query(
      'SELECT chat_type, COUNT(*) as count FROM chat WHERE user_id = ? AND is_deleted = 0 GROUP BY chat_type',
      [userId]
    );

    const chatTypeMap: Record<string, number> = {};
    chatsByType.forEach((row: any) => {
      chatTypeMap[row.chat_type] = row.count;
    });

    return {
      totalChats: totalChats.count || 0,
      totalMessages: totalMessages.count || 0,
      totalTokens: totalTokens.total || 0,
      averageMessagesPerChat: totalChats.count > 0 ? Math.round((totalMessages.count || 0) / totalChats.count) : 0,
      mostActiveChat: mostActiveChats.length > 0 ? {
        chatId: mostActiveChats[0].id,
        title: mostActiveChats[0].title,
        messageCount: mostActiveChats[0].message_count
      } : null,
      chatsByType: chatTypeMap
    };
  }
}

// Singleton instance
let localDb: LocalDatabase | null = null;

export function getLocalDatabase(): LocalDatabase {
  if (!localDb) {
    localDb = new LocalDatabase();
  }
  return localDb;
}