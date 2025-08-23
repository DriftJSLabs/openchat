'use client';

import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { createContext, useContext } from 'react';
import type { Message, Chat } from '@/lib/db/schema/shared';

/**
 * Chat container context that provides shared state and handlers
 * for all child components within the chat interface
 */
interface ChatContainerContextValue {
  /** Current chat being displayed */
  currentChat: Chat | null;
  /** Current user ID for the chat session */
  userId: string | null;
  /** Whether the chat is currently loading */
  isLoading: boolean;
  /** Error state for the chat interface */
  error: string | null;
  /** Whether streaming is currently active */
  isStreaming: boolean;
  /** Whether messages are being synced to database */
  isSyncing: boolean;
  /** Current streaming message content (if any) */
  streamingContent?: string;
  /** Handler for sending new messages */
  onSendMessage?: (content: string) => void;
  /** Handler for stopping current stream */
  onStopStream?: () => void;
  /** Handler for creating new chats */
  onCreateChat?: (title: string) => void;
  /** Handler for selecting a different chat */
  onSelectChat?: (chatId: string) => void;
  /** Handler for message actions (copy, regenerate, etc.) */
  onMessageAction?: (action: string, messageId: string) => void;
}

const ChatContainerContext = createContext<ChatContainerContextValue | null>(null);

/**
 * Hook to access the chat container context
 * Throws an error if used outside of a ChatContainer
 */
export function useChatContainer() {
  const context = useContext(ChatContainerContext);
  if (!context) {
    throw new Error('useChatContainer must be used within a ChatContainer');
  }
  return context;
}

export interface ChatContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Current chat being displayed */
  currentChat?: Chat | null;
  /** Current user ID for the chat session */
  userId?: string | null;
  /** Whether the chat is currently loading */
  isLoading?: boolean;
  /** Error state for the chat interface */
  error?: string | null;
  /** Whether streaming is currently active */
  isStreaming?: boolean;
  /** Whether messages are being synced to database */
  isSyncing?: boolean;
  /** Current streaming message content (if any) */
  streamingContent?: string;
  /** Handler for sending new messages */
  onSendMessage?: (content: string) => void;
  /** Handler for stopping current stream */
  onStopStream?: () => void;
  /** Handler for creating new chats */
  onCreateChat?: (title: string) => void;
  /** Handler for selecting a different chat */
  onSelectChat?: (chatId: string) => void;
  /** Handler for message actions (copy, regenerate, etc.) */
  onMessageAction?: (action: string, messageId: string) => void;
  /** Whether to show the sidebar on mobile */
  sidebarOpen?: boolean;
  /** Handler for toggling sidebar visibility on mobile */
  onSidebarToggle?: () => void;
}

/**
 * Main chat container component that provides the overall layout structure
 * for the chat interface. This component establishes the grid layout,
 * provides context for child components, and manages responsive behavior.
 * 
 * Features:
 * - Responsive layout that adapts to mobile and desktop viewports
 * - Context provider for shared chat state and handlers
 * - Flexible container that works with or without sidebar
 * - Proper error boundary and loading state management
 * - Follows existing design patterns from ai-elements components
 */
export function ChatContainer({
  className,
  children,
  currentChat = null,
  userId = null,
  isLoading = false,
  error = null,
  isStreaming = false,
  isSyncing = false,
  streamingContent,
  onSendMessage,
  onStopStream,
  onCreateChat,
  onSelectChat,
  onMessageAction,
  sidebarOpen = false,
  onSidebarToggle,
  ...props
}: ChatContainerProps) {
  const contextValue: ChatContainerContextValue = {
    currentChat,
    userId,
    isLoading,
    error,
    isStreaming,
    isSyncing,
    streamingContent,
    onSendMessage,
    onStopStream,
    onCreateChat,
    onSelectChat,
    onMessageAction,
  };

  return (
    <ChatContainerContext.Provider value={contextValue}>
      <div
        className={cn(
          // Base layout: full height, flex container
          'flex h-screen w-full',
          // Background matches the app theme
          'bg-background',
          // Ensure proper text color inheritance
          'text-foreground',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ChatContainerContext.Provider>
  );
}

/**
 * Chat content area component that contains the main chat interface
 * Provides proper spacing, flex layout, and responsive behavior
 */
export interface ChatContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether to show padding around the content */
  padded?: boolean;
}

export function ChatContent({
  className,
  children,
  padded = false,
  ...props
}: ChatContentProps) {
  return (
    <div
      className={cn(
        // Flex layout: take remaining space, column direction
        'flex flex-1 flex-col',
        // Ensure content doesn't overflow
        'min-w-0 min-h-0',
        // Background for the main content area
        'bg-background',
        // Add padding if requested
        padded && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Chat header component for displaying chat title and actions
 * Follows the existing header patterns in the application
 */
export interface ChatHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Chat title to display */
  title?: string;
  /** Whether to show a border at the bottom */
  bordered?: boolean;
}

export function ChatHeader({
  className,
  children,
  title,
  bordered = true,
  ...props
}: ChatHeaderProps) {
  const { currentChat } = useChatContainer();
  
  // Use the provided title or fall back to the current chat title
  const displayTitle = title || currentChat?.title || 'New Chat';

  return (
    <div
      className={cn(
        // Header layout: flex row with space between items
        'flex items-center justify-between',
        // Padding for proper spacing
        'px-4 py-3',
        // Background color
        'bg-background',
        // Border at bottom if requested
        bordered && 'border-b border-border',
        // Text styling
        'text-foreground',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <h1 className="font-semibold text-lg truncate">
          {displayTitle}
        </h1>
      </div>
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Chat main area component that contains the message list and input
 * Provides proper flex layout for the core chat interface
 */
export interface ChatMainProps extends HTMLAttributes<HTMLDivElement> {}

export function ChatMain({
  className,
  children,
  ...props
}: ChatMainProps) {
  return (
    <div
      className={cn(
        // Flex layout: take remaining space, column direction
        'flex flex-1 flex-col',
        // Ensure content doesn't overflow
        'min-w-0 min-h-0',
        // Background for the main area
        'bg-background',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Chat footer component for input and additional controls
 * Provides consistent spacing and layout for the bottom section
 */
export interface ChatFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether to show a border at the top */
  bordered?: boolean;
}

export function ChatFooter({
  className,
  children,
  bordered = true,
  ...props
}: ChatFooterProps) {
  return (
    <div
      className={cn(
        // Footer layout and spacing
        'px-4 py-3',
        // Background color
        'bg-background',
        // Border at top if requested
        bordered && 'border-t border-border',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}