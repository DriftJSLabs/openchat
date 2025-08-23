/**
 * Chat Interface Component
 * 
 * This is the main chat interface component that provides a complete chat experience
 * including message display, input handling, real-time streaming responses, and state management.
 * It integrates with the local database and provides real AI streaming functionality.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedAIChat } from './animated-ai-chat';
import { ChatMessage, createMessage, generateChatId } from '@/lib/chat-utils';
import { MessageLoading, ConnectionLoading } from './chat-loading';
import { MessageSendError } from './chat-error';
import { useChatStream } from '@/hooks/use-chat-stream';
import { ChatContainer, ChatContent, ChatHeader, ChatMain, ChatFooter } from './chat/chat-container';
import { ChatInput } from './chat/chat-input';
import { MessageList } from './chat/message-list';
import { useLocalDatabase } from '@/hooks/use-local-database';
import type { Message } from '@/lib/db/schema/shared';

interface ChatInterfaceProps {
  chatId?: string;
  userId?: string;
  className?: string;
  mode?: 'conversation' | 'standalone';
  initialMessages?: Message[];
  onMessageSent?: (message: Message) => void;
  onMessageReceived?: (message: Message) => void;
  onChatCreated?: (chatId: string) => void;
  showSidebar?: boolean;
  autoCreateChat?: boolean;
}

/**
 * Main chat interface component with real AI streaming integration
 * 
 * @param chatId - Unique identifier for the chat conversation
 * @param userId - Current user ID for database operations
 * @param className - Additional CSS classes
 * @param mode - Interface mode (conversation or standalone)
 * @param initialMessages - Pre-existing messages to display
 * @param onMessageSent - Callback when user sends a message
 * @param onMessageReceived - Callback when AI responds
 * @param onChatCreated - Callback when a new chat is created
 * @param showSidebar - Whether to show the chat sidebar
 * @param autoCreateChat - Whether to automatically create a chat if none exists
 */
export function ChatInterface({
  chatId,
  userId,
  className,
  mode = 'standalone',
  initialMessages = [],
  onMessageSent,
  onMessageReceived,
  onChatCreated,
  showSidebar = false,
  autoCreateChat = true,
}: ChatInterfaceProps) {
  const [currentChatId, setCurrentChatId] = useState(chatId);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize database connection
  const { isInitialized: dbInitialized, error: dbError } = useLocalDatabase({ 
    userId,
    autoSync: true 
  });

  // Initialize chat streaming with database integration
  const {
    messages: aiMessages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading: isStreaming,
    error: streamError,
    stop,
    persistedMessages,
    currentChat,
    isDatabaseLoading,
    databaseError,
    isSyncing,
    createChat,
    clearChat,
  } = useChatStream({
    chatId: currentChatId,
    userId,
    api: '/api/chat',
    persistMessages: true,
    autoCreateChat,
    defaultChatTitle: 'New Chat',
    onChatCreated: (chat) => {
      setCurrentChatId(chat.id);
      onChatCreated?.(chat.id);
    },
    onMessagePersisted: (message) => {
      onMessageReceived?.(message);
    },
    onDatabaseError: (err) => {
      console.error('Database error in chat interface:', err);
      setError(`Database error: ${err.message}`);
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, persistedMessages]);

  // Update current chat ID when prop changes
  useEffect(() => {
    if (chatId !== currentChatId) {
      setCurrentChatId(chatId);
    }
  }, [chatId, currentChatId]);

  // Handle message submission with enhanced error handling
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    try {
      setError(null);
      
      // Create a synthetic event for the AI SDK
      const syntheticEvent = new Event('submit') as React.FormEvent<HTMLFormElement>;
      
      // Update input value and submit
      handleInputChange({ target: { value: content } } as React.ChangeEvent<HTMLTextAreaElement>);
      
      // Small delay to ensure input is updated
      setTimeout(() => {
        handleSubmit(syntheticEvent);
      }, 10);

      // Call the message sent callback with the user message
      if (onMessageSent) {
        const userMessage: Message = {
          id: generateChatId(),
          chatId: currentChatId || 'temp',
          role: 'user',
          content,
          messageType: 'text',
          metadata: null,
          parentMessageId: null,
          editHistory: null,
          tokenCount: Math.ceil(content.length / 4), // Rough token estimate
          createdAt: Math.floor(Date.now() / 1000),
          isDeleted: false,
        };
        onMessageSent(userMessage);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    }
  }, [handleInputChange, handleSubmit, currentChatId, onMessageSent]);

  /**
   * Handle stopping the current stream
   */
  const handleStopStream = useCallback(() => {
    try {
      stop();
    } catch (err) {
      console.error('Error stopping stream:', err);
    }
  }, [stop]);

  /**
   * Handle creating a new chat
   */
  const handleCreateChat = useCallback(async (title?: string) => {
    try {
      setError(null);
      const newChat = await createChat(title);
      if (newChat) {
        setCurrentChatId(newChat.id);
        clearChat(); // Clear AI SDK messages
        onChatCreated?.(newChat.id);
      }
    } catch (err) {
      console.error('Error creating chat:', err);
      setError('Failed to create new chat. Please try again.');
    }
  }, [createChat, clearChat, onChatCreated]);

  /**
   * Retry handler for errors
   */
  const handleRetry = useCallback(() => {
    setError(null);
  }, []);

  // For standalone mode, use the existing AnimatedAIChat component
  if (mode === 'standalone') {
    return (
      <div className={cn("h-full w-full", className)}>
        <AnimatedAIChat />
      </div>
    );
  }

  // Show loading state while database is initializing
  if (!dbInitialized && isDatabaseLoading) {
    return (
      <div className={cn("h-full w-full flex items-center justify-center", className)}>
        <ConnectionLoading />
      </div>
    );
  }

  // Get the effective messages to display (prefer persisted for consistency)
  const displayMessages = persistedMessages.length > 0 ? persistedMessages : aiMessages.map(msg => ({
    id: msg.id,
    chatId: currentChatId || 'temp',
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    messageType: 'text' as const,
    metadata: null,
    parentMessageId: null,
    editHistory: null,
    tokenCount: Math.ceil(msg.content.length / 4),
    createdAt: Math.floor(Date.now() / 1000),
    isDeleted: false,
  }));

  // Determine the overall error state
  const overallError = error || streamError?.message || databaseError || dbError?.message;

  return (
    <ChatContainer
      className={className}
      currentChat={currentChat}
      userId={userId}
      isLoading={isDatabaseLoading}
      error={overallError}
      isStreaming={isStreaming}
      isSyncing={isSyncing}
      onSendMessage={handleSendMessage}
      onStopStream={handleStopStream}
      onCreateChat={handleCreateChat}
    >
      <ChatContent>
        {/* Chat Header */}
        <ChatHeader title={currentChat?.title || 'New Chat'} />

        {/* Main Chat Area */}
        <ChatMain>
          {/* Error Display */}
          {overallError && (
            <div className="px-4 py-2">
              <MessageSendError 
                message={overallError}
                onRetry={handleRetry}
              />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4">
            {displayMessages.length > 0 ? (
              <MessageList 
                messages={displayMessages}
                isStreaming={isStreaming}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-sm text-muted-foreground">
                    Start a conversation by typing a message below
                  </p>
                </div>
              </div>
            )}
            
            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </ChatMain>

        {/* Chat Input */}
        <ChatFooter>
          <ChatInput
            value={input}
            onChange={handleInputChange}
            onSubmit={(content) => handleSendMessage(content)}
            onStop={handleStopStream}
            status={isStreaming ? 'streaming' : isSyncing ? 'submitted' : undefined}
            disabled={!dbInitialized}
            placeholder={
              !dbInitialized 
                ? 'Initializing database...' 
                : 'Type your message...'
            }
          />
        </ChatFooter>
      </ChatContent>
    </ChatContainer>
  );
}

/**
 * Enhanced Chat Interface Component Export
 * 
 * This component provides a complete chat experience with:
 * - Real AI streaming integration via @ai-sdk/react and OpenRouter
 * - Local database persistence with SQLite via wa-sqlite
 * - Comprehensive error handling and recovery mechanisms
 * - Auto-chat creation and management
 * - Responsive design for all screen sizes
 * - Context-aware message handling
 * - Performance optimized rendering with virtualization
 * - Real-time sync status indicators
 * - Offline-first architecture with cloud sync
 */