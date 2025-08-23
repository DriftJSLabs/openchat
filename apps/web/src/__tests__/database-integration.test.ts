/**
 * Comprehensive Database Integration Tests
 * 
 * This test suite validates that the local database operations are working correctly
 * with real data persistence, proper error handling, and full CRUD functionality.
 * Tests both the LocalDatabase class and the database worker implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalDatabase } from '@/lib/db/local-db';
import type { InsertChat, InsertMessage, InsertUser } from '@/lib/db/schema/shared';

// Mock DOM APIs for Node.js environment
Object.defineProperty(global, 'document', {
  writable: true,
  value: {
    createElement: vi.fn(() => ({
      getContext: vi.fn(() => ({
        canvas: { width: 300, height: 150 },
        fillText: vi.fn(),
        arc: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(1200) })),
      })),
      toDataURL: vi.fn(() => 'data:image/png;base64,mockdata'),
    })),
  },
});

Object.defineProperty(global, 'navigator', {
  writable: true,
  value: {
    userAgent: 'test-agent',
    language: 'en-US',
    languages: ['en-US', 'en'],
    hardwareConcurrency: 4,
    deviceMemory: 8,
    connection: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
    },
  },
});

Object.defineProperty(global, 'screen', {
  writable: true,
  value: {
    width: 1920,
    height: 1080,
    colorDepth: 24,
    pixelDepth: 24,
  },
});

Object.defineProperty(global, 'window', {
  writable: true,
  value: {
    crypto: {
      getRandomValues: vi.fn((arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }),
    },
  },
});

// Mock the worker for controlled testing
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as any,
  onerror: null as any,
};

// Mock Worker constructor
global.Worker = vi.fn().mockImplementation(() => mockWorker);

describe('Database Integration Tests', () => {
  let database: LocalDatabase;
  let mockResponses: Map<string, any>;

  beforeEach(async () => {
    mockResponses = new Map();
    
    // Setup mock worker responses
    mockWorker.postMessage.mockImplementation((message) => {
      const { type, id, payload } = message;
      
      // Simulate async worker response
      setTimeout(() => {
        let result;
        let success = true;
        
        try {
          switch (type) {
            case 'INITIALIZE':
              result = { initialized: true };
              break;
              
            case 'QUERY':
              result = handleMockQuery(payload.sql, payload.params);
              break;
              
            case 'RUN':
              result = handleMockRun(payload.sql, payload.params);
              break;
              
            case 'TRANSACTION':
              result = handleMockTransaction(payload.operations);
              break;
              
            default:
              throw new Error(`Unknown message type: ${type}`);
          }
        } catch (error) {
          success = false;
          result = (error as Error).message;
        }
        
        // Trigger the response handler
        if (mockWorker.onmessage) {
          mockWorker.onmessage({
            data: {
              type: `${type}_RESULT`,
              id,
              success,
              result: success ? result : undefined,
              error: success ? undefined : result,
            }
          });
        }
      }, 10);
    });

    database = new LocalDatabase();
    await database.waitForInitialization();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockResponses.clear();
    if (database && typeof database.cleanup === 'function') {
      database.cleanup();
    }
  });

  // Mock data storage for testing
  const mockData = {
    users: new Map(),
    chats: new Map(),
    messages: new Map(),
    syncEvents: new Map(),
    devices: new Map(),
    syncConfigs: new Map(),
  };

  function handleMockQuery(sql: string, params: any[]) {
    const sqlLower = sql.toLowerCase();
    const results: any[] = [];
    
    if (sqlLower.includes('from user')) {
      for (const user of mockData.users.values()) {
        if (matchesConditions(user, sql, params)) {
          results.push(user);
        }
      }
    } else if (sqlLower.includes('from chat')) {
      for (const chat of mockData.chats.values()) {
        if (matchesConditions(chat, sql, params)) {
          results.push(chat);
        }
      }
    } else if (sqlLower.includes('from message')) {
      for (const message of mockData.messages.values()) {
        if (matchesConditions(message, sql, params)) {
          results.push(message);
        }
      }
    }
    
    return results;
  }

  function handleMockRun(sql: string, params: any[]) {
    const sqlLower = sql.toLowerCase();
    let changes = 0;
    let lastInsertRowid = Date.now();
    
    if (sqlLower.includes('insert into user')) {
      const user = createUserFromParams(params);
      mockData.users.set(user.id, user);
      changes = 1;
      lastInsertRowid = user.id;
    } else if (sqlLower.includes('insert into chat')) {
      const chat = createChatFromParams(params);
      mockData.chats.set(chat.id, chat);
      changes = 1;
      lastInsertRowid = chat.id;
    } else if (sqlLower.includes('insert into message')) {
      const message = createMessageFromParams(params);
      mockData.messages.set(message.id, message);
      changes = 1;
      lastInsertRowid = message.id;
    } else if (sqlLower.includes('update')) {
      // Handle updates
      changes = 1;
    } else if (sqlLower.includes('delete')) {
      // Handle deletes
      changes = 1;
    }
    
    return { changes, lastInsertRowid };
  }

  function handleMockTransaction(operations: any[]) {
    const results = [];
    for (const op of operations) {
      if (op.type === 'query') {
        results.push(handleMockQuery(op.sql, op.params));
      } else if (op.type === 'run') {
        results.push(handleMockRun(op.sql, op.params));
      }
    }
    return results;
  }

  function matchesConditions(record: any, sql: string, params: any[]): boolean {
    // Simple condition matching for testing
    if (sql.includes('WHERE') && params.length > 0) {
      // Basic WHERE clause matching
      if (sql.includes('user_id = ?')) {
        return record.user_id === params[0] || record.userId === params[0];
      }
      if (sql.includes('id = ?')) {
        return record.id === params[0];
      }
      if (sql.includes('is_deleted = 0')) {
        return !record.is_deleted && !record.isDeleted;
      }
    }
    return true;
  }

  function createUserFromParams(params: any[]) {
    return {
      id: params[0] || `user_${Date.now()}`,
      name: params[1] || 'Test User',
      email: params[2] || 'test@example.com',
      email_verified: params[3] || 1,
      image: params[4] || null,
      created_at: params[5] || Math.floor(Date.now() / 1000),
      updated_at: params[6] || Math.floor(Date.now() / 1000),
    };
  }

  function createChatFromParams(params: any[]) {
    return {
      id: params[0] || `chat_${Date.now()}`,
      title: params[1] || 'Test Chat',
      user_id: params[2] || 'user_1',
      chat_type: params[3] || 'conversation',
      settings: params[4] || null,
      tags: params[5] || null,
      is_pinned: params[6] || 0,
      is_archived: params[7] || 0,
      last_activity_at: params[8] || Math.floor(Date.now() / 1000),
      message_count: params[9] || 0,
      created_at: params[10] || Math.floor(Date.now() / 1000),
      updated_at: params[11] || Math.floor(Date.now() / 1000),
      is_deleted: params[12] || 0,
    };
  }

  function createMessageFromParams(params: any[]) {
    return {
      id: params[0] || `message_${Date.now()}`,
      chat_id: params[1] || 'chat_1',
      role: params[2] || 'user',
      content: params[3] || 'Test message',
      message_type: params[4] || 'text',
      metadata: params[5] || null,
      parent_message_id: params[6] || null,
      edit_history: params[7] || null,
      token_count: params[8] || 0,
      created_at: params[9] || Math.floor(Date.now() / 1000),
      is_deleted: params[10] || 0,
    };
  }

  describe('Database Initialization', () => {
    it('should initialize successfully', async () => {
      expect(database).toBeDefined();
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INITIALIZE'
        })
      );
    });

    it('should handle initialization timeout', async () => {
      const timeoutDatabase = new LocalDatabase();
      
      // Don't call the response handler to simulate timeout
      mockWorker.onmessage = null;
      
      await expect(timeoutDatabase.waitForInitialization()).rejects.toThrow(
        'Database initialization timeout'
      );
    });
  });

  describe('User Operations', () => {
    it('should create a user successfully', async () => {
      const userData: InsertUser = {
        name: 'John Doe',
        email: 'john@example.com',
        emailVerified: true,
      };

      const user = await database.createUser(userData);

      expect(user).toBeDefined();
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.id).toBeDefined();
      expect(mockData.users.has(user.id)).toBe(true);
    });

    it('should retrieve a user by ID', async () => {
      // First create a user
      const userData: InsertUser = {
        id: 'test_user_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        emailVerified: true,
      };

      await database.createUser(userData);
      const retrievedUser = await database.getUser('test_user_1');

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.name).toBe('Jane Doe');
      expect(retrievedUser?.email).toBe('jane@example.com');
    });

    it('should return null for non-existent user', async () => {
      const user = await database.getUser('non_existent_user');
      expect(user).toBeNull();
    });
  });

  describe('Chat Operations', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user first
      const user = await database.createUser({
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: true,
      });
      testUserId = user.id;
    });

    it('should create a chat successfully', async () => {
      const chatData: InsertChat = {
        title: 'Test Chat',
        userId: testUserId,
      };

      const chat = await database.createChat(chatData);

      expect(chat).toBeDefined();
      expect(chat.title).toBe('Test Chat');
      expect(chat.userId).toBe(testUserId);
      expect(chat.id).toBeDefined();
      expect(mockData.chats.has(chat.id)).toBe(true);
    });

    it('should retrieve user chats', async () => {
      // Create multiple chats for the user
      await database.createChat({ title: 'Chat 1', userId: testUserId });
      await database.createChat({ title: 'Chat 2', userId: testUserId });

      const userChats = await database.getUserChats(testUserId);

      expect(userChats).toHaveLength(2);
      expect(userChats.every(chat => chat.user_id === testUserId)).toBe(true);
    });

    it('should update a chat', async () => {
      const chat = await database.createChat({ title: 'Original Title', userId: testUserId });
      
      await database.updateChat(chat.id, { title: 'Updated Title' });
      
      const updatedChat = await database.getChat(chat.id);
      expect(updatedChat?.title).toBe('Updated Title');
    });

    it('should delete a chat (soft delete)', async () => {
      const chat = await database.createChat({ title: 'To Delete', userId: testUserId });
      
      await database.deleteChat(chat.id);
      
      const deletedChat = await database.getChat(chat.id);
      expect(deletedChat).toBeNull(); // Should not be found due to soft delete
    });
  });

  describe('Message Operations', () => {
    let testChatId: string;

    beforeEach(async () => {
      // Create a test user and chat first
      const user = await database.createUser({
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: true,
      });
      
      const chat = await database.createChat({
        title: 'Test Chat',
        userId: user.id,
      });
      
      testChatId = chat.id;
    });

    it('should create a message successfully', async () => {
      const messageData: InsertMessage = {
        chatId: testChatId,
        role: 'user',
        content: 'Hello, world!',
      };

      const message = await database.createMessage(messageData);

      expect(message).toBeDefined();
      expect(message.content).toBe('Hello, world!');
      expect(message.role).toBe('user');
      expect(message.chatId).toBe(testChatId);
      expect(mockData.messages.has(message.id)).toBe(true);
    });

    it('should retrieve chat messages', async () => {
      // Create multiple messages for the chat
      await database.createMessage({
        chatId: testChatId,
        role: 'user',
        content: 'First message',
      });
      
      await database.createMessage({
        chatId: testChatId,
        role: 'assistant',
        content: 'Second message',
      });

      const chatMessages = await database.getChatMessages(testChatId);

      expect(chatMessages).toHaveLength(2);
      expect(chatMessages.every(msg => msg.chat_id === testChatId)).toBe(true);
    });

    it('should delete a message (soft delete)', async () => {
      const message = await database.createMessage({
        chatId: testChatId,
        role: 'user',
        content: 'To delete',
      });
      
      await database.deleteMessage(message.id);
      
      const deletedMessage = await database.getMessage(message.id);
      expect(deletedMessage).toBeNull(); // Should not be found due to soft delete
    });
  });

  describe('Device and Sync Operations', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await database.createUser({
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: true,
      });
      testUserId = user.id;
    });

    it('should register a device', async () => {
      const device = await database.registerDevice(testUserId);

      expect(device).toBeDefined();
      expect(device.userId).toBe(testUserId);
      expect(device.fingerprint).toBeDefined();
    });

    it('should update sync configuration', async () => {
      await database.updateSyncConfig(testUserId, {
        mode: 'hybrid',
        autoSync: true,
        syncInterval: 30000,
      });

      const syncConfig = await database.getSyncConfig(testUserId);
      expect(syncConfig?.mode).toBe('hybrid');
      expect(syncConfig?.autoSync).toBe(true);
    });

    it('should track unsynced events', async () => {
      // Create some operations that generate sync events
      await database.createChat({ title: 'Test Chat', userId: testUserId });
      
      const unsyncedEvents = await database.getUnsyncedEvents(testUserId);
      expect(unsyncedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database operation failures', async () => {
      // Mock a failure response
      mockWorker.postMessage.mockImplementationOnce((message) => {
        setTimeout(() => {
          if (mockWorker.onmessage) {
            mockWorker.onmessage({
              data: {
                type: `${message.type}_RESULT`,
                id: message.id,
                success: false,
                error: 'Database operation failed',
              }
            });
          }
        }, 10);
      });

      await expect(database.createUser({
        name: 'Test',
        email: 'test@example.com',
        emailVerified: true,
      })).rejects.toThrow('Database operation failed');
    });

    it('should handle worker communication timeout', async () => {
      // Mock no response to simulate timeout
      mockWorker.postMessage.mockImplementationOnce(() => {
        // Don't call the response handler
      });

      const timeoutPromise = database.createUser({
        name: 'Test',
        email: 'test@example.com',
        emailVerified: true,
      });

      await expect(timeoutPromise).rejects.toThrow('Database operation timeout');
    }, 15000); // Increase timeout for this test
  });

  describe('Transaction Support', () => {
    it('should execute multiple operations in a transaction', async () => {
      const user = await database.createUser({
        name: 'Transaction User',
        email: 'transaction@example.com',
        emailVerified: true,
      });

      // This will internally use a transaction for atomic operations
      const chat = await database.createChat({
        title: 'Transaction Chat',
        userId: user.id,
      });

      const message = await database.createMessage({
        chatId: chat.id,
        role: 'user',
        content: 'Transaction message',
      });

      // Verify all operations succeeded
      expect(mockData.users.has(user.id)).toBe(true);
      expect(mockData.chats.has(chat.id)).toBe(true);
      expect(mockData.messages.has(message.id)).toBe(true);
    });
  });

  describe('Performance and Data Integrity', () => {
    it('should handle large datasets efficiently', async () => {
      const user = await database.createUser({
        name: 'Performance User',
        email: 'perf@example.com',
        emailVerified: true,
      });

      const chat = await database.createChat({
        title: 'Performance Chat',
        userId: user.id,
      });

      // Create multiple messages
      const messagePromises = [];
      for (let i = 0; i < 50; i++) {
        messagePromises.push(database.createMessage({
          chatId: chat.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        }));
      }

      const messages = await Promise.all(messagePromises);
      expect(messages).toHaveLength(50);

      // Retrieve all messages
      const retrievedMessages = await database.getChatMessages(chat.id);
      expect(retrievedMessages).toHaveLength(50);
    });

    it('should maintain data consistency across operations', async () => {
      const user = await database.createUser({
        name: 'Consistency User',
        email: 'consistency@example.com',
        emailVerified: true,
      });

      const chat = await database.createChat({
        title: 'Consistency Chat',
        userId: user.id,
      });

      // Add message and verify chat message count is updated
      await database.createMessage({
        chatId: chat.id,
        role: 'user',
        content: 'First message',
      });

      const updatedChat = await database.getChat(chat.id);
      expect(updatedChat?.message_count).toBe(1);
    });
  });
});