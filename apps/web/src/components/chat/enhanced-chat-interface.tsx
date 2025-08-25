/**
 * Enhanced Chat Interface with TanStack DB integration
 * Sync-aware React components with real-time updates, optimistic UI,
 * offline support, conflict resolution, and comprehensive error handling.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { 
  MessageSquare, 
  Send, 
  AlertTriangle, 
  Wifi, 
  WifiOff, 
  Clock, 
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { useChats, useMessages, useCreateMessage, useCreateChat } from '@/hooks/use-chat-db';
import { useInfiniteMessages } from '@/hooks/use-infinite-messages';
import { chatOperations } from '@/lib/chat-operations';
import { offlineManager } from '@/lib/offline-manager';
import { errorHandler } from '@/lib/error-handling';
import { conflictResolution } from '@/lib/conflict-resolution';
import { cn } from '@/lib/utils';

import type {
  ChatWithMetadata,
  MessageWithMetadata,
  GlobalSyncState,
  DatabaseConnectionStatus,
  SyncStatus
} from '@/lib/types/tanstack-db.types';

/**
 * Enhanced Chat Interface Props
 */
interface EnhancedChatInterfaceProps {
  /** Current user ID */
  userId: string;
  /** Currently selected chat ID */
  currentChatId?: string;
  /** Callback when chat selection changes */
  onChatChange?: (chatId: string) => void;
  /** Whether to show sidebar */
  showSidebar?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Sync Status Indicator Component
 */
interface SyncStatusIndicatorProps {
  syncState: GlobalSyncState;
  className?: string;
}

function SyncStatusIndicator({ syncState, className }: SyncStatusIndicatorProps) {
  const { status, isOffline, pendingOperations, connectionStatus, error } = syncState;

  const getStatusIcon = () => {
    if (isOffline) return <WifiOff className="h-4 w-4" />;
    
    switch (status) {
      case SyncStatus.SYNCING:
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case SyncStatus.SUCCESS:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case SyncStatus.ERROR:
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Wifi className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    if (isOffline) return 'Offline';
    if (pendingOperations > 0) return `Syncing ${pendingOperations} changes`;
    if (error) return 'Sync error';
    return 'Connected';
  };

  const getStatusColor = () => {
    if (isOffline) return 'bg-orange-500';
    if (error) return 'bg-red-500';
    if (status === SyncStatus.SYNCING) return 'bg-blue-500';
    return 'bg-green-500';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {getStatusIcon()}
      <Badge variant="outline" className={cn('text-xs', getStatusColor())}>
        {getStatusText()}
      </Badge>
    </div>
  );
}

/**
 * Message Component with optimistic updates and error states
 */
interface MessageItemProps {
  message: MessageWithMetadata;
  isOptimistic?: boolean;
  onRetry?: () => void;
  className?: string;
}

function MessageItem({ message, isOptimistic = false, onRetry, className }: MessageItemProps) {
  const { role, content, isEditing, error, retryCount } = message;
  
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const hasError = !!error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'flex gap-3 p-4 rounded-lg transition-all duration-200',
        isUser ? 'bg-blue-50 dark:bg-blue-950/30 ml-8' : 'bg-gray-50 dark:bg-gray-800/30 mr-8',
        isOptimistic && 'opacity-70',
        hasError && 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800',
        className
      )}
    >
      {/* Message Avatar */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
        isUser ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white'
      )}>
        {isUser ? 'U' : 'A'}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Assistant'}
          </span>
          
          {/* Status indicators */}
          {isOptimistic && (
            <Clock className="h-3 w-3 text-orange-500" title="Sending..." />
          )}
          {hasError && (
            <AlertTriangle className="h-3 w-3 text-red-500" title={error} />
          )}
          {retryCount > 0 && (
            <Badge variant="outline" className="text-xs">
              Retry {retryCount}
            </Badge>
          )}
        </div>
        
        <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
          {content}
        </div>

        {/* Error actions */}
        {hasError && onRetry && (
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="h-6 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Message List with infinite scroll
 */
interface MessageListProps {
  chatId: string;
  className?: string;
}

function MessageList({ chatId, className }: MessageListProps) {
  const {
    allData: messages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    scrollElementRef,
    virtualizer,
    scrollToLatest,
    totalCount
  } = useInfiniteMessages(chatId, {
    pageSize: 50,
    enableVirtualization: true,
    estimateMessageSize: 100,
  });

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      scrollToLatest();
    }
  }, [messages.length, scrollToLatest]);

  // Monitor scroll position for scroll-to-bottom button
  useEffect(() => {
    const scrollElement = scrollElementRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      setShowScrollToBottom(!isNearBottom);
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [scrollElementRef]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <MessageSquare className="h-8 w-8 mb-2" />
        <p>No messages yet. Start a conversation!</p>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 relative', className)}>
      <ScrollArea 
        ref={scrollElementRef}
        className="h-full"
      >
        <div className="p-4 space-y-4">
          {/* Virtual scrolling items */}
          {virtualizer ? (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const message = messages[virtualItem.index];
                if (!message) return null;

                return (
                  <div
                    key={message.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <MessageItem
                      message={message}
                      isOptimistic={message.isOptimistic}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            /* Regular rendering */
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOptimistic={message.isOptimistic}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Loading indicator */}
          {isFetchingNextPage && (
            <div className="flex justify-center p-4">
              <Skeleton className="h-20 w-full max-w-md" />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-4 right-4"
          >
            <Button
              size="sm"
              onClick={scrollToLatest}
              className="rounded-full shadow-lg"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Chat Input with optimistic message creation
 */
interface ChatInputProps {
  chatId: string;
  disabled?: boolean;
  className?: string;
}

function ChatInput({ chatId, disabled = false, className }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createMessageMutation = useCreateMessage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting || disabled) return;

    const messageContent = input.trim();
    setInput('');
    setIsSubmitting(true);

    try {
      await createMessageMutation.mutate({
        chatId,
        content: messageContent,
        role: 'user',
        messageType: 'text',
      });
    } catch (error) {
      // Error handling is managed by the mutation
      console.error('Failed to send message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('p-4 border-t', className)}>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled || isSubmitting}
          className="flex-1"
          autoFocus
        />
        <Button
          type="submit"
          disabled={!input.trim() || isSubmitting || disabled}
          size="sm"
        >
          {isSubmitting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * Chat List Sidebar
 */
interface ChatListProps {
  userId: string;
  currentChatId?: string;
  onChatSelect: (chatId: string) => void;
  className?: string;
}

function ChatList({ userId, currentChatId, onChatSelect, className }: ChatListProps) {
  const { data: chats, isLoading, error } = useChats(userId, {
    realTime: true,
    includeArchived: false,
  });

  const createChatMutation = useCreateChat();

  const handleCreateChat = async () => {
    try {
      const newChat = await createChatMutation.mutate({
        title: `New Chat ${new Date().toLocaleTimeString()}`,
        chatType: 'conversation',
      });
      
      if (newChat) {
        onChatSelect(newChat.id);
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('w-64 border-r p-4', className)}>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('w-64 border-r p-4', className)}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load chats. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={cn('w-64 border-r flex flex-col', className)}>
      <div className="p-4 border-b">
        <Button onClick={handleCreateChat} className="w-full" size="sm">
          New Chat
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {chats?.map((chat) => (
            <Button
              key={chat.id}
              variant={currentChatId === chat.id ? 'default' : 'ghost'}
              onClick={() => onChatSelect(chat.id)}
              className="w-full justify-start text-left truncate"
              size="sm"
            >
              <span className="truncate">{chat.title}</span>
              {chat.hasPendingSync && (
                <Clock className="h-3 w-3 ml-auto flex-shrink-0 text-orange-500" />
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Main Enhanced Chat Interface
 */
export function EnhancedChatInterface({
  userId,
  currentChatId,
  onChatChange,
  showSidebar = true,
  className
}: EnhancedChatInterfaceProps) {
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>(currentChatId);
  const [syncState, setSyncState] = useState<GlobalSyncState>({
    status: SyncStatus.IDLE,
    connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
    pendingOperations: 0,
    lastSyncAt: null,
    error: null,
    nextSyncIn: null,
    isOffline: false,
  });

  // Initialize offline manager and sync state
  useEffect(() => {
    const initializeOfflineManager = async () => {
      await offlineManager.initialize();
      
      // Subscribe to sync state updates
      const unsubscribe = offlineManager.getSyncStateManager().on('global-state-updated', (state) => {
        setSyncState(state);
      });

      return unsubscribe;
    };

    initializeOfflineManager();
  }, []);

  // Handle chat selection
  const handleChatSelect = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    onChatChange?.(chatId);
  }, [onChatChange]);

  return (
    <div className={cn('flex h-screen bg-background', className)}>
      {/* Sidebar */}
      {showSidebar && (
        <ChatList
          userId={userId}
          currentChatId={selectedChatId}
          onChatSelect={handleChatSelect}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with sync status */}
        <div className="p-4 border-b flex justify-between items-center">
          <h1 className="text-lg font-semibold">
            {selectedChatId ? 'Chat' : 'Select a chat'}
          </h1>
          <SyncStatusIndicator syncState={syncState} />
        </div>

        {selectedChatId ? (
          <>
            {/* Message List */}
            <MessageList chatId={selectedChatId} />
            
            {/* Chat Input */}
            <ChatInput 
              chatId={selectedChatId}
              disabled={syncState.isOffline}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-semibold mb-2">Welcome to OpenChat</h2>
              <p>Select a chat from the sidebar or create a new one to get started.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}