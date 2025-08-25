/**
 * React hooks for TanStack DB chat functionality
 * Provides real-time data access, CRUD operations, and optimistic updates
 * for all chat-related entities using useLiveQuery and TanStack Query patterns.
 */

'use client';

import { useLiveQuery } from '@tanstack/db/client';
import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { nanoid } from 'nanoid';

import { 
  chats, 
  messages, 
  users, 
  syncEvents, 
  db, 
  DatabaseConnectionStatus,
  SyncStatus,
  MessageQueuePriority,
  SyncOperation,
  EntityType
} from '@/lib/tanstack-db';

import type {
  Chat,
  Message,
  User,
  ChatWithMetadata,
  MessageWithMetadata,
  CreateChatParams,
  CreateMessageParams,
  UpdateMessageParams,
  MessagePaginationParams,
  PaginatedResult,
  InfiniteScrollState,
  LiveQueryResult,
  MutationResult,
  OptimisticUpdate,
  DatabaseError,
  EntitySyncState,
  GlobalSyncState,
  ChatHookOptions,
  MessageHookOptions,
  SyncHookOptions
} from '@/lib/types/tanstack-db.types';

/**
 * Custom error class for database operations
 */
class ChatDatabaseError extends Error implements DatabaseError {
  constructor(
    message: string,
    public code: string,
    public category: DatabaseError['category'],
    public entityInfo?: DatabaseError['entityInfo'],
    public retryable: boolean = false,
    public retryDelay?: number,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ChatDatabaseError';
  }
}

/**
 * Hook for managing user chats with real-time updates
 * Provides live query results with comprehensive metadata and UI states
 */
export function useChats(
  userId: string | null,
  options: ChatHookOptions = {}
): LiveQueryResult<ChatWithMetadata[]> {
  const {
    realTime = true,
    includeArchived = false,
    includeDeleted = false,
    pollingInterval = 30000,
    optimistic = true
  } = options;

  // Track subscription state
  const [isSubscribed, setIsSubscribed] = useState(realTime);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<DatabaseConnectionStatus>(
    DatabaseConnectionStatus.DISCONNECTED
  );

  // Live query for chats with filtering
  const {
    data: rawChats,
    error,
    isLoading,
    isRefetching,
    refetch
  } = useLiveQuery({
    queryKey: ['chats', userId, { includeArchived, includeDeleted }],
    queryFn: async () => {
      if (!userId) return [];
      
      setConnectionStatus(DatabaseConnectionStatus.CONNECTING);
      
      try {
        const query = chats.query();
        let filteredQuery = query.where('user_id', '=', userId);
        
        if (!includeDeleted) {
          filteredQuery = filteredQuery.where('is_deleted', '=', false);
        }
        
        if (!includeArchived) {
          filteredQuery = filteredQuery.where('is_archived', '=', false);
        }
        
        const result = await filteredQuery
          .orderBy('last_activity_at', 'desc')
          .orderBy('created_at', 'desc')
          .execute();
        
        setConnectionStatus(DatabaseConnectionStatus.CONNECTED);
        setLastUpdate(new Date());
        
        return result;
      } catch (err) {
        setConnectionStatus(DatabaseConnectionStatus.ERROR);
        throw new ChatDatabaseError(
          'Failed to load chats',
          'CHAT_LOAD_ERROR',
          'network',
          { entityType: EntityType.CHAT },
          true,
          5000,
          { userId, includeArchived, includeDeleted }
        );
      }
    },
    enabled: !!userId && isSubscribed,
    refetchInterval: realTime ? undefined : pollingInterval,
    staleTime: realTime ? 0 : 5 * 60 * 1000, // 5 minutes for polling mode
  });

  // Enhance chats with metadata
  const chatsWithMetadata = useMemo((): ChatWithMetadata[] => {
    if (!rawChats) return [];
    
    return rawChats.map(chat => ({
      ...chat,
      isLoading: false,
      hasPendingSync: false, // TODO: Implement sync state tracking
      // Additional computed properties can be added here
    }));
  }, [rawChats]);

  const toggleSubscription = useCallback((subscribe: boolean) => {
    setIsSubscribed(subscribe);
    if (subscribe) {
      setConnectionStatus(DatabaseConnectionStatus.CONNECTING);
    } else {
      setConnectionStatus(DatabaseConnectionStatus.DISCONNECTED);
    }
  }, []);

  return {
    data: chatsWithMetadata,
    isLoading,
    error: error as Error | null,
    isRefetching,
    refetch,
    isSubscribed,
    toggleSubscription,
    lastUpdate,
    connectionStatus,
  };
}

/**
 * Hook for managing messages in a specific chat with real-time updates
 * Includes pagination, infinite scroll, and optimistic updates
 */
export function useMessages(
  chatId: string | null,
  options: MessageHookOptions = {}
): LiveQueryResult<MessageWithMetadata[]> {
  const {
    realTime = true,
    initialLimit = 50,
    infiniteScroll = false,
    order = 'desc',
    includeDeleted = false,
    includeMetadata = true,
    optimistic = true
  } = options;

  const [isSubscribed, setIsSubscribed] = useState(realTime);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<DatabaseConnectionStatus>(
    DatabaseConnectionStatus.DISCONNECTED
  );

  // Track optimistic updates
  const optimisticUpdatesRef = useRef<Map<string, OptimisticUpdate<Message>>>(new Map());

  const {
    data: rawMessages,
    error,
    isLoading,
    isRefetching,
    refetch
  } = useLiveQuery({
    queryKey: ['messages', chatId, { order, includeDeleted, initialLimit }],
    queryFn: async () => {
      if (!chatId) return [];
      
      setConnectionStatus(DatabaseConnectionStatus.CONNECTING);
      
      try {
        const query = messages.query();
        let filteredQuery = query.where('chat_id', '=', chatId);
        
        if (!includeDeleted) {
          filteredQuery = filteredQuery.where('is_deleted', '=', false);
        }
        
        const result = await filteredQuery
          .orderBy('created_at', order)
          .limit(initialLimit)
          .execute();
        
        setConnectionStatus(DatabaseConnectionStatus.CONNECTED);
        setLastUpdate(new Date());
        
        return result;
      } catch (err) {
        setConnectionStatus(DatabaseConnectionStatus.ERROR);
        throw new ChatDatabaseError(
          'Failed to load messages',
          'MESSAGE_LOAD_ERROR',
          'network',
          { entityType: EntityType.MESSAGE },
          true,
          3000,
          { chatId, order, includeDeleted }
        );
      }
    },
    enabled: !!chatId && isSubscribed,
    refetchInterval: realTime ? undefined : 10000,
    staleTime: realTime ? 0 : 2 * 60 * 1000, // 2 minutes
  });

  // Enhance messages with metadata and optimistic updates
  const messagesWithMetadata = useMemo((): MessageWithMetadata[] => {
    if (!rawMessages) return [];
    
    const optimisticMessages = Array.from(optimisticUpdatesRef.current.values())
      .map(update => ({
        ...update.optimisticData,
        isOptimistic: true,
        isEditing: false,
        error: undefined,
        retryCount: 0,
      }));
    
    const persistedMessages = rawMessages.map(message => ({
      ...message,
      isOptimistic: false,
      isEditing: false,
      error: undefined,
      retryCount: 0,
    }));
    
    // Merge optimistic and persisted messages, removing duplicates
    const allMessages = [...optimisticMessages, ...persistedMessages];
    const uniqueMessages = allMessages.reduce((acc, message) => {
      const existing = acc.find(m => m.id === message.id);
      if (!existing || (!existing.isOptimistic && message.isOptimistic)) {
        return acc.filter(m => m.id !== message.id).concat(message);
      }
      return acc;
    }, [] as MessageWithMetadata[]);
    
    // Sort by creation time
    return uniqueMessages.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return order === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [rawMessages, order]);

  const toggleSubscription = useCallback((subscribe: boolean) => {
    setIsSubscribed(subscribe);
    if (subscribe) {
      setConnectionStatus(DatabaseConnectionStatus.CONNECTING);
    } else {
      setConnectionStatus(DatabaseConnectionStatus.DISCONNECTED);
    }
  }, []);

  return {
    data: messagesWithMetadata,
    isLoading,
    error: error as Error | null,
    isRefetching,
    refetch,
    isSubscribed,
    toggleSubscription,
    lastUpdate,
    connectionStatus,
  };
}

/**
 * Hook for creating new chats with optimistic updates
 */
export function useCreateChat(): MutationResult<Chat, CreateChatParams> {
  const queryClient = useQueryClient();
  const optimisticUpdatesRef = useRef<Map<string, OptimisticUpdate<Chat>>>(new Map());

  const mutation = useMutation({
    mutationFn: async (params: CreateChatParams): Promise<Chat> => {
      const tempId = nanoid();
      const now = new Date();
      
      // Create optimistic chat data
      const optimisticChat: Chat = {
        id: tempId,
        title: params.title,
        userId: 'current-user', // TODO: Get from auth context
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
          optimisticUpdatesRef.current.delete(tempId);
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
        createdAt: now,
      };
      
      optimisticUpdatesRef.current.set(tempId, optimisticUpdate);

      try {
        // Optimistically update the UI
        queryClient.setQueryData(['chats'], (oldData: Chat[] = []) => [
          optimisticChat,
          ...oldData
        ]);

        // Perform actual database operation
        const result = await chats.create({
          id: nanoid(), // Generate actual ID
          title: params.title,
          userId: 'current-user', // TODO: Get from auth context
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
        });

        // Remove optimistic update and update with real data
        optimisticUpdatesRef.current.delete(tempId);
        queryClient.setQueryData(['chats'], (oldData: Chat[] = []) =>
          oldData.map(chat => chat.id === tempId ? result : chat)
        );

        return result;
      } catch (error) {
        // Rollback optimistic update on failure
        optimisticUpdate.rollback();
        throw new ChatDatabaseError(
          'Failed to create chat',
          'CHAT_CREATE_ERROR',
          'network',
          { entityType: EntityType.CHAT },
          true,
          5000,
          { params }
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });

  return {
    mutate: mutation.mutateAsync,
    data: mutation.data || null,
    error: mutation.error,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * Hook for creating new messages with optimistic updates
 */
export function useCreateMessage(): MutationResult<Message, CreateMessageParams> {
  const queryClient = useQueryClient();
  const optimisticUpdatesRef = useRef<Map<string, OptimisticUpdate<Message>>>(new Map());

  const mutation = useMutation({
    mutationFn: async (params: CreateMessageParams): Promise<Message> => {
      const tempId = nanoid();
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
          optimisticUpdatesRef.current.delete(tempId);
          queryClient.invalidateQueries({ queryKey: ['messages', params.chatId] });
        },
        createdAt: now,
      };
      
      optimisticUpdatesRef.current.set(tempId, optimisticUpdate);

      try {
        // Optimistically update the UI
        queryClient.setQueryData(['messages', params.chatId], (oldData: Message[] = []) => [
          ...oldData,
          optimisticMessage
        ]);

        // Perform actual database operation
        const result = await messages.create({
          id: nanoid(), // Generate actual ID
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
        });

        // Remove optimistic update and update with real data
        optimisticUpdatesRef.current.delete(tempId);
        queryClient.setQueryData(['messages', params.chatId], (oldData: Message[] = []) =>
          oldData.map(msg => msg.id === tempId ? result : msg)
        );

        return result;
      } catch (error) {
        // Rollback optimistic update on failure
        optimisticUpdate.rollback();
        throw new ChatDatabaseError(
          'Failed to create message',
          'MESSAGE_CREATE_ERROR',
          'network',
          { entityType: EntityType.MESSAGE, entityId: params.chatId },
          true,
          3000,
          { params }
        );
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] }); // Update chat's last activity
    },
  });

  return {
    mutate: mutation.mutateAsync,
    data: mutation.data || null,
    error: mutation.error,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * Hook for updating messages with optimistic updates
 */
export function useUpdateMessage(): MutationResult<Message, UpdateMessageParams> {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: UpdateMessageParams): Promise<Message> => {
      try {
        // Optimistically update the UI first
        const previousMessage = queryClient.getQueryData<Message[]>(['messages'])
          ?.find(msg => msg.id === params.messageId);
        
        if (previousMessage) {
          const optimisticMessage = {
            ...previousMessage,
            content: params.content,
            metadata: params.metadata || previousMessage.metadata,
            // Add to edit history if tracking is enabled
            editHistory: params.trackHistory 
              ? JSON.stringify([
                  ...(previousMessage.editHistory ? JSON.parse(previousMessage.editHistory) : []),
                  {
                    content: previousMessage.content,
                    editedAt: new Date().toISOString(),
                  }
                ])
              : previousMessage.editHistory,
          };
          
          queryClient.setQueryData(['messages'], (oldData: Message[] = []) =>
            oldData.map(msg => msg.id === params.messageId ? optimisticMessage : msg)
          );
        }

        // Perform actual database update
        const result = await messages.update(params.messageId, {
          content: params.content,
          metadata: params.metadata,
          // Handle edit history update in the database layer
        });

        return result;
      } catch (error) {
        // Rollback on failure
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        throw new ChatDatabaseError(
          'Failed to update message',
          'MESSAGE_UPDATE_ERROR',
          'network',
          { entityType: EntityType.MESSAGE, entityId: params.messageId },
          true,
          3000,
          { params }
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  return {
    mutate: mutation.mutateAsync,
    data: mutation.data || null,
    error: mutation.error,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * Hook for deleting messages with optimistic updates
 */
export function useDeleteMessage(): MutationResult<void, { messageId: string; chatId: string }> {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ messageId, chatId }): Promise<void> => {
      try {
        // Optimistically remove from UI
        queryClient.setQueryData(['messages', chatId], (oldData: Message[] = []) =>
          oldData.filter(msg => msg.id !== messageId)
        );

        // Soft delete in database
        await messages.update(messageId, {
          isDeleted: true,
        });
      } catch (error) {
        // Rollback on failure
        queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
        throw new ChatDatabaseError(
          'Failed to delete message',
          'MESSAGE_DELETE_ERROR',
          'network',
          { entityType: EntityType.MESSAGE, entityId: messageId },
          true,
          3000,
          { messageId, chatId }
        );
      }
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });

  return {
    mutate: mutation.mutateAsync,
    data: mutation.data || null,
    error: mutation.error,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * Hook for managing global sync state
 */
export function useSyncState(options: SyncHookOptions = {}): GlobalSyncState {
  const {
    autoConnect = true,
    syncInterval = 30000,
    backgroundSync = true,
    priority = MessageQueuePriority.NORMAL
  } = options;

  const [syncState, setSyncState] = useState<GlobalSyncState>({
    status: SyncStatus.IDLE,
    connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
    pendingOperations: 0,
    lastSyncAt: null,
    error: null,
    nextSyncIn: null,
    isOffline: !navigator.onLine,
  });

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setSyncState(prev => ({ ...prev, isOffline: false }));
    const handleOffline = () => setSyncState(prev => ({ ...prev, isOffline: true }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // TODO: Implement actual sync state monitoring
  // This would connect to the sync service and track real synchronization status
  
  return syncState;
}

/**
 * Hook for message pagination with infinite scroll support
 */
export function useMessagesPaginated(
  chatId: string | null,
  params: MessagePaginationParams
): InfiniteScrollState<Message> {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['messages-paginated', chatId, params],
    queryFn: async ({ pageParam }) => {
      if (!chatId) return { data: [], hasMore: false, nextCursor: null, prevCursor: null };
      
      const query = messages.query().where('chat_id', '=', chatId);
      
      // Apply cursor-based pagination
      if (pageParam) {
        if (params.direction === 'after') {
          query.where('created_at', '>', new Date(pageParam));
        } else {
          query.where('created_at', '<', new Date(pageParam));
        }
      }
      
      const result = await query
        .orderBy('created_at', params.direction === 'after' ? 'asc' : 'desc')
        .limit(params.limit)
        .execute();
      
      const hasMore = result.length === params.limit;
      const nextCursor = hasMore ? result[result.length - 1]?.createdAt?.toISOString() : null;
      const prevCursor = result.length > 0 ? result[0]?.createdAt?.toISOString() : null;
      
      return {
        data: result,
        hasMore,
        nextCursor,
        prevCursor,
      } as PaginatedResult<Message>;
    },
    initialPageParam: params.cursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!chatId,
  });

  const allData = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data);
  }, [data?.pages]);

  return {
    pages: data?.pages || [],
    allData,
    hasNextPage: hasNextPage || false,
    isFetchingNextPage,
    fetchNextPage,
    refresh: refetch,
  };
}