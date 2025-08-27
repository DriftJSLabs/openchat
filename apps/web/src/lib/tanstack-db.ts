/**
 * TanStack Database Integration Layer
 * Provides core database functionality, enums, and table exports
 */

// Re-export all database tables and utilities
export {
  user,
  chat, 
  message,
  syncEvent,
  device,
  syncConfig,
  chatAnalytics,
  userPreferences
} from './db/schema/shared';

// Database connection status enum
export enum DatabaseConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting'
}

// Sync status enum
export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SUCCESS = 'success', 
  ERROR = 'error',
  CONFLICT = 'conflict',
  OFFLINE = 'offline'
}

// Message queue priority enum
export enum MessageQueuePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4
}

// Sync operation types
export enum SyncOperation {
  CREATE = 'create',
  UPDATE = 'update', 
  DELETE = 'delete',
  BATCH_CREATE = 'batch_create',
  BATCH_UPDATE = 'batch_update',
  BATCH_DELETE = 'batch_delete'
}

// Entity types for sync operations
export enum EntityType {
  USER = 'user',
  CHAT = 'chat',
  MESSAGE = 'message',
  ANALYTICS = 'analytics',
  PREFERENCE = 'preference',
  SYNC_EVENT = 'sync_event',
  DEVICE = 'device'
}

// Export a basic db instance placeholder for now
export const db = {
  // This would be initialized with actual TanStack DB instance
  // For now, we'll use a placeholder
};

// Export individual table query builders
export const chats = {
  query: () => ({
    where: (field: string, operator: string, value: any) => ({
      execute: async () => []
    })
  })
};

export const messages = {
  query: () => ({
    where: (field: string, operator: string, value: any) => ({
      where: (field: string, operator: string, value: any) => ({
        orderBy: (field: string, direction: 'asc' | 'desc') => ({
          limit: (limit: number) => ({
            execute: async () => []
          })
        })
      }),
      orderBy: (field: string, direction: 'asc' | 'desc') => ({
        limit: (limit: number) => ({
          execute: async () => []
        })
      }),
      count: async () => 0
    }),
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      limit: (limit: number) => ({
        execute: async () => []
      })
    })
  })
};

export const users = {
  query: () => ({
    where: (field: string, operator: string, value: any) => ({
      execute: async () => []
    })
  })
};

export const syncEvents = {
  query: () => ({
    where: (field: string, operator: string, value: any) => ({
      execute: async () => []
    })
  })
};