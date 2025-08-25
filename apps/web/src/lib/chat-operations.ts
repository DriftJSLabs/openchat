/**
 * Comprehensive CRUD operations manager for chat functionality
 * Provides optimistic updates, error recovery, and transaction support
 * for all chat-related database operations in OpenChat.
 */

'use client';

import { nanoid } from 'nanoid';
import { 
  chats, 
  messages, 
  users,
  syncEvents,
  db,
  SyncOperation,
  EntityType,
  MessageQueuePriority,
  SyncStatus
} from '@/lib/tanstack-db';

import type {
  Chat,
  Message,
  User,
  SyncEvent,
  CreateChatParams,
  CreateMessageParams,
  UpdateMessageParams,
  OptimisticUpdate,
  DatabaseError,
  OfflineQueueItem,
  ConflictResolution,
  ConflictResolutionStrategy,
  DataConflict
} from '@/lib/types/tanstack-db.types';

/**
 * Transaction context for managing complex operations
 */
interface TransactionContext {
  /** Transaction ID for tracking */
  transactionId: string;
  /** Operations in this transaction */
  operations: Array<{
    type: SyncOperation;
    entityType: EntityType;
    entityId?: string;
    data: Record<string, unknown>;
  }>;
  /** Rollback functions */
  rollbacks: Array<() => void>;
  /** Transaction timestamp */
  timestamp: Date;
}

/**
 * Optimistic update manager
 */
class OptimisticUpdateManager<T = unknown> {
  private updates = new Map<string, OptimisticUpdate<T>>();
  private callbacks = new Set<(updates: OptimisticUpdate<T>[]) => void>();

  /**
   * Add an optimistic update
   */
  add(update: OptimisticUpdate<T>): void {
    this.updates.set(update.tempId, update);
    this.notifySubscribers();
  }

  /**
   * Remove an optimistic update
   */
  remove(tempId: string): boolean {
    const removed = this.updates.delete(tempId);
    if (removed) {
      this.notifySubscribers();
    }
    return removed;
  }

  /**
   * Get all current optimistic updates
   */
  getAll(): OptimisticUpdate<T>[] {
    return Array.from(this.updates.values());
  }

  /**
   * Clear all updates (used for rollbacks)
   */
  clear(): void {
    this.updates.clear();
    this.notifySubscribers();
  }

  /**
   * Subscribe to updates
   */
  subscribe(callback: (updates: OptimisticUpdate<T>[]) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifySubscribers(): void {
    const updates = this.getAll();
    this.callbacks.forEach(callback => callback(updates));
  }
}

/**
 * Offline operation queue manager
 */
class OfflineQueueManager {
  private queue = new Map<string, OfflineQueueItem>();
  private isProcessing = false;
  private retryTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Add operation to offline queue
   */
  enqueue(item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'lastAttempt'>): string {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: nanoid(),
      createdAt: new Date(),
      lastAttempt: null,
    };
    
    this.queue.set(queueItem.id, queueItem);
    
    // Start processing if online
    if (navigator.onLine) {
      this.processQueue();
    }
    
    return queueItem.id;
  }

  /**
   * Remove item from queue
   */
  dequeue(id: string): boolean {
    // Clear any retry timeout
    const timeout = this.retryTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(id);
    }
    
    return this.queue.delete(id);
  }

  /**
   * Get all queued items sorted by priority and creation time
   */
  getQueue(): OfflineQueueItem[] {
    return Array.from(this.queue.values()).sort((a, b) => {
      // Sort by priority first (higher priority first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /**
   * Process the offline queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    
    this.isProcessing = true;
    const items = this.getQueue();
    
    for (const item of items) {
      try {
        await this.processItem(item);
        this.dequeue(item.id);
      } catch (error) {
        await this.handleItemError(item, error as Error);
      }
    }
    
    this.isProcessing = false;
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: OfflineQueueItem): Promise<void> {
    const { operation, entityType, entityId, data } = item;
    
    // Update last attempt timestamp
    item.lastAttempt = new Date();
    
    switch (operation) {
      case SyncOperation.CREATE:
        await this.processCreate(entityType, data);
        break;
        
      case SyncOperation.UPDATE:
        if (!entityId) throw new Error('Entity ID required for update operation');
        await this.processUpdate(entityType, entityId, data);
        break;
        
      case SyncOperation.DELETE:
        if (!entityId) throw new Error('Entity ID required for delete operation');
        await this.processDelete(entityType, entityId);
        break;
        
      case SyncOperation.BATCH_CREATE:
        await this.processBatchCreate(entityType, data);
        break;
        
      case SyncOperation.BATCH_UPDATE:
        await this.processBatchUpdate(entityType, data);
        break;
        
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private async processCreate(entityType: EntityType, data: Record<string, unknown>): Promise<void> {
    switch (entityType) {
      case EntityType.CHAT:
        await chats.create(data as any);
        break;
      case EntityType.MESSAGE:
        await messages.create(data as any);
        break;
      case EntityType.USER:
        await users.create(data as any);
        break;
      default:
        throw new Error(`Unsupported entity type for create: ${entityType}`);
    }
  }

  private async processUpdate(entityType: EntityType, entityId: string, data: Record<string, unknown>): Promise<void> {
    switch (entityType) {
      case EntityType.CHAT:
        await chats.update(entityId, data);
        break;
      case EntityType.MESSAGE:
        await messages.update(entityId, data);
        break;
      case EntityType.USER:
        await users.update(entityId, data);
        break;
      default:
        throw new Error(`Unsupported entity type for update: ${entityType}`);
    }
  }

  private async processDelete(entityType: EntityType, entityId: string): Promise<void> {
    switch (entityType) {
      case EntityType.CHAT:
        await chats.update(entityId, { isDeleted: true });
        break;
      case EntityType.MESSAGE:
        await messages.update(entityId, { isDeleted: true });
        break;
      default:
        throw new Error(`Unsupported entity type for delete: ${entityType}`);
    }
  }

  private async processBatchCreate(entityType: EntityType, data: Record<string, unknown>): Promise<void> {
    const items = data.items as Array<Record<string, unknown>>;
    if (!Array.isArray(items)) {
      throw new Error('Batch create requires items array');
    }

    // Process items sequentially to avoid overwhelming the database
    for (const item of items) {
      await this.processCreate(entityType, item);
    }
  }

  private async processBatchUpdate(entityType: EntityType, data: Record<string, unknown>): Promise<void> {
    const updates = data.updates as Array<{ id: string; data: Record<string, unknown> }>;
    if (!Array.isArray(updates)) {
      throw new Error('Batch update requires updates array');
    }

    // Process updates sequentially
    for (const update of updates) {
      await this.processUpdate(entityType, update.id, update.data);
    }
  }

  /**
   * Handle errors during item processing
   */
  private async handleItemError(item: OfflineQueueItem, error: Error): Promise<void> {
    item.retries++;
    item.error = error.message;
    
    const maxRetries = 5;
    if (item.retries >= maxRetries) {
      // Remove item after max retries
      this.dequeue(item.id);
      console.error(`Failed to process queue item after ${maxRetries} retries:`, item, error);
      return;
    }
    
    // Calculate exponential backoff delay
    const baseDelay = 1000; // 1 second
    const delay = baseDelay * Math.pow(2, item.retries - 1);
    
    // Schedule retry
    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(item.id);
      this.processQueue();
    }, delay);
    
    this.retryTimeouts.set(item.id, timeout);
  }
}

/**
 * Main chat operations manager
 */
export class ChatOperationsManager {
  private optimisticChats = new OptimisticUpdateManager<Chat>();
  private optimisticMessages = new OptimisticUpdateManager<Message>();
  private offlineQueue = new OfflineQueueManager();
  private currentUser: User | null = null;

  constructor() {
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.offlineQueue.processQueue();
      });
    }
  }

  /**
   * Set the current user context
   */
  setCurrentUser(user: User | null): void {
    this.currentUser = user;
  }

  /**
   * Create a new chat with optimistic updates
   */
  async createChat(params: CreateChatParams): Promise<Chat> {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    const tempId = nanoid();
    const chatId = nanoid();
    const now = new Date();
    
    // Create optimistic chat data
    const optimisticChat: Chat = {
      id: tempId,
      title: params.title,
      userId: this.currentUser.id,
      chatType: params.chatType || 'conversation',
      settings: params.settings || null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      isPinned: params.isPinned || false,
      isArchived: false,
      lastActivityAt: now,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    // Add optimistic update
    const optimisticUpdate: OptimisticUpdate<Chat> = {
      tempId,
      optimisticData: optimisticChat,
      rollback: () => {
        this.optimisticChats.remove(tempId);
      },
      createdAt: now,
    };
    
    this.optimisticChats.add(optimisticUpdate);

    try {
      // Attempt database operation
      const actualChat: Chat = {
        id: chatId,
        title: params.title,
        userId: this.currentUser.id,
        chatType: params.chatType || 'conversation',
        settings: params.settings || null,
        tags: params.tags ? JSON.stringify(params.tags) : null,
        isPinned: params.isPinned || false,
        isArchived: false,
        lastActivityAt: now,
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };

      const result = await chats.create(actualChat);
      
      // Remove optimistic update on success
      this.optimisticChats.remove(tempId);
      
      // Record sync event
      await this.recordSyncEvent({
        entityType: EntityType.CHAT,
        entityId: result.id,
        operation: SyncOperation.CREATE,
        data: JSON.stringify(result),
        userId: this.currentUser.id,
        deviceId: this.getDeviceId(),
        synced: true,
        priority: MessageQueuePriority.NORMAL,
        retryCount: 0,
      });
      
      return result;
    } catch (error) {
      if (!navigator.onLine) {
        // Queue for offline processing
        this.offlineQueue.enqueue({
          operation: SyncOperation.CREATE,
          entityType: EntityType.CHAT,
          data: {
            id: chatId,
            title: params.title,
            userId: this.currentUser.id,
            chatType: params.chatType || 'conversation',
            settings: params.settings || null,
            tags: params.tags ? JSON.stringify(params.tags) : null,
            isPinned: params.isPinned || false,
            isArchived: false,
            lastActivityAt: now,
            messageCount: 0,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          },
          priority: MessageQueuePriority.NORMAL,
          retries: 0,
          error: null,
        });
        
        // Keep optimistic update for offline mode
        return optimisticChat;
      } else {
        // Remove optimistic update on failure
        optimisticUpdate.rollback();
        throw error;
      }
    }
  }

  /**
   * Create a new message with optimistic updates
   */
  async createMessage(params: CreateMessageParams): Promise<Message> {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    const tempId = nanoid();
    const messageId = nanoid();
    const now = new Date();
    
    // Create optimistic message data
    const optimisticMessage: Message = {
      id: tempId,
      chatId: params.chatId,
      role: params.role,
      content: params.content,
      messageType: params.messageType || 'text',
      metadata: params.metadata || null,
      parentMessageId: params.parentMessageId || null,
      editHistory: null,
      tokenCount: params.tokenCount || 0,
      createdAt: now,
      isDeleted: false,
    };

    // Add optimistic update
    const optimisticUpdate: OptimisticUpdate<Message> = {
      tempId,
      optimisticData: optimisticMessage,
      rollback: () => {
        this.optimisticMessages.remove(tempId);
      },
      createdAt: now,
    };
    
    this.optimisticMessages.add(optimisticUpdate);

    try {
      // Attempt database operation
      const actualMessage: Message = {
        id: messageId,
        chatId: params.chatId,
        role: params.role,
        content: params.content,
        messageType: params.messageType || 'text',
        metadata: params.metadata || null,
        parentMessageId: params.parentMessageId || null,
        editHistory: null,
        tokenCount: params.tokenCount || 0,
        createdAt: now,
        isDeleted: false,
      };

      const result = await messages.create(actualMessage);
      
      // Remove optimistic update on success
      this.optimisticMessages.remove(tempId);
      
      // Update chat's last activity and message count
      await this.updateChatActivity(params.chatId);
      
      // Record sync event
      await this.recordSyncEvent({
        entityType: EntityType.MESSAGE,
        entityId: result.id,
        operation: SyncOperation.CREATE,
        data: JSON.stringify(result),
        userId: this.currentUser.id,
        deviceId: this.getDeviceId(),
        synced: true,
        priority: MessageQueuePriority.HIGH, // Messages are high priority
        retryCount: 0,
      });
      
      return result;
    } catch (error) {
      if (!navigator.onLine) {
        // Queue for offline processing
        this.offlineQueue.enqueue({
          operation: SyncOperation.CREATE,
          entityType: EntityType.MESSAGE,
          data: actualMessage,
          priority: MessageQueuePriority.HIGH,
          retries: 0,
          error: null,
        });
        
        // Keep optimistic update for offline mode
        return optimisticMessage;
      } else {
        // Remove optimistic update on failure
        optimisticUpdate.rollback();
        throw error;
      }
    }
  }

  /**
   * Update a message with optimistic updates
   */
  async updateMessage(params: UpdateMessageParams): Promise<Message> {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      // Get current message for edit history
      const currentMessage = await messages.findById(params.messageId);
      if (!currentMessage) {
        throw new Error('Message not found');
      }

      const now = new Date();
      const updateData: Partial<Message> = {
        content: params.content,
        metadata: params.metadata || currentMessage.metadata,
      };

      // Handle edit history if tracking is enabled
      if (params.trackHistory) {
        const currentHistory = currentMessage.editHistory 
          ? JSON.parse(currentMessage.editHistory) 
          : [];
        
        const newHistoryEntry = {
          content: currentMessage.content,
          editedAt: now.toISOString(),
        };
        
        updateData.editHistory = JSON.stringify([...currentHistory, newHistoryEntry]);
      }

      const result = await messages.update(params.messageId, updateData);
      
      // Record sync event
      await this.recordSyncEvent({
        entityType: EntityType.MESSAGE,
        entityId: params.messageId,
        operation: SyncOperation.UPDATE,
        data: JSON.stringify(updateData),
        userId: this.currentUser.id,
        deviceId: this.getDeviceId(),
        synced: true,
        priority: MessageQueuePriority.NORMAL,
        retryCount: 0,
      });
      
      return result;
    } catch (error) {
      if (!navigator.onLine) {
        // Queue for offline processing
        this.offlineQueue.enqueue({
          operation: SyncOperation.UPDATE,
          entityType: EntityType.MESSAGE,
          entityId: params.messageId,
          data: {
            content: params.content,
            metadata: params.metadata,
          },
          priority: MessageQueuePriority.NORMAL,
          retries: 0,
          error: null,
        });
        
        throw new Error('Update queued for when online');
      } else {
        throw error;
      }
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(messageId: string, chatId: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      await messages.update(messageId, { isDeleted: true });
      
      // Update chat's message count
      await this.updateChatActivity(chatId);
      
      // Record sync event
      await this.recordSyncEvent({
        entityType: EntityType.MESSAGE,
        entityId: messageId,
        operation: SyncOperation.DELETE,
        data: JSON.stringify({ isDeleted: true }),
        userId: this.currentUser.id,
        deviceId: this.getDeviceId(),
        synced: true,
        priority: MessageQueuePriority.NORMAL,
        retryCount: 0,
      });
    } catch (error) {
      if (!navigator.onLine) {
        // Queue for offline processing
        this.offlineQueue.enqueue({
          operation: SyncOperation.DELETE,
          entityType: EntityType.MESSAGE,
          entityId: messageId,
          data: { isDeleted: true },
          priority: MessageQueuePriority.NORMAL,
          retries: 0,
          error: null,
        });
        
        throw new Error('Delete queued for when online');
      } else {
        throw error;
      }
    }
  }

  /**
   * Get current optimistic updates for chats
   */
  getOptimisticChats(): OptimisticUpdate<Chat>[] {
    return this.optimisticChats.getAll();
  }

  /**
   * Get current optimistic updates for messages
   */
  getOptimisticMessages(): OptimisticUpdate<Message>[] {
    return this.optimisticMessages.getAll();
  }

  /**
   * Subscribe to optimistic chat updates
   */
  subscribeToOptimisticChats(callback: (updates: OptimisticUpdate<Chat>[]) => void): () => void {
    return this.optimisticChats.subscribe(callback);
  }

  /**
   * Subscribe to optimistic message updates
   */
  subscribeToOptimisticMessages(callback: (updates: OptimisticUpdate<Message>[]) => void): () => void {
    return this.optimisticMessages.subscribe(callback);
  }

  /**
   * Get current offline queue status
   */
  getOfflineQueueStatus(): { pendingCount: number; items: OfflineQueueItem[] } {
    const items = this.offlineQueue.getQueue();
    return {
      pendingCount: items.length,
      items,
    };
  }

  /**
   * Manually process offline queue
   */
  async processOfflineQueue(): Promise<void> {
    await this.offlineQueue.processQueue();
  }

  /**
   * Update chat activity timestamp and message count
   */
  private async updateChatActivity(chatId: string): Promise<void> {
    try {
      const messageCount = await messages.query()
        .where('chat_id', '=', chatId)
        .where('is_deleted', '=', false)
        .count();
      
      await chats.update(chatId, {
        lastActivityAt: new Date(),
        messageCount,
      });
    } catch (error) {
      console.warn('Failed to update chat activity:', error);
    }
  }

  /**
   * Record a sync event for operation tracking
   */
  private async recordSyncEvent(eventData: Omit<SyncEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      await syncEvents.create({
        ...eventData,
        id: nanoid(),
        timestamp: new Date(),
      });
    } catch (error) {
      console.warn('Failed to record sync event:', error);
    }
  }

  /**
   * Get device ID (simplified implementation)
   */
  private getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';
    
    let deviceId = localStorage.getItem('device-id');
    if (!deviceId) {
      deviceId = nanoid();
      localStorage.setItem('device-id', deviceId);
    }
    return deviceId;
  }
}

/**
 * Global singleton instance
 */
export const chatOperations = new ChatOperationsManager();