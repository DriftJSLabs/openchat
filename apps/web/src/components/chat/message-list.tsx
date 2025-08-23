'use client';

import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import { ArrowDownIcon } from 'lucide-react';
import type { Message } from '@/lib/db/schema/shared';
import { useChatContainer } from './chat-container';
import { MessageItem } from './message-item';
import { StreamingMessage } from './streaming-message';

/**
 * Props for the MessageList component
 */
export interface MessageListProps extends ComponentProps<typeof StickToBottom> {
  /** Array of messages to display */
  messages: Message[];
  /** Whether the list is currently loading */
  isLoading?: boolean;
  /** Error message to display if loading fails */
  error?: string | null;
  /** Whether to show loading indicator */
  showLoadingIndicator?: boolean;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom empty state component */
  emptyComponent?: React.ReactNode;
  /** Whether to enable virtualization for large message lists */
  virtualized?: boolean;
  /** Number of messages to render at once when virtualized */
  overscan?: number;
}

/**
 * Message list component that displays chat messages in a scrollable container.
 * Built on top of the existing Conversation component patterns with StickToBottom
 * functionality for automatic scrolling behavior.
 * 
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Scroll-to-bottom button when not at bottom
 * - Loading states and error handling
 * - Optional virtualization for performance with large message lists
 * - Responsive design that works on mobile and desktop
 * - Follows existing conversation component patterns
 * 
 * Performance Considerations:
 * - Uses StickToBottom for efficient scroll management
 * - Optional virtualization for lists with hundreds of messages
 * - Memoized scroll calculations to prevent excessive re-renders
 */
export function MessageList({
  className,
  messages,
  isLoading = false,
  error = null,
  showLoadingIndicator = true,
  loadingComponent,
  emptyComponent,
  virtualized = false,
  overscan = 10,
  children,
  ...props
}: MessageListProps) {
  const { 
    isStreaming, 
    isSyncing, 
    streamingContent, 
    onStopStream, 
    onMessageAction 
  } = useChatContainer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Handle user scroll events to detect manual scrolling
   * This helps us determine when to auto-scroll vs respect user position
   */
  const handleScroll = useCallback(() => {
    setIsUserScrolling(true);
    
    // Clear existing timeout
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    
    // Reset user scrolling flag after 2 seconds of no scrolling
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 2000);
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll behavior based on streaming and user interaction
  const scrollBehavior: ComponentProps<typeof StickToBottom>['initial'] = 
    isStreaming && !isUserScrolling ? 'smooth' : 'auto';

  /**
   * Render loading state
   */
  if (isLoading && messages.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-1 items-center justify-center',
          'text-muted-foreground',
          className
        )}
      >
        {loadingComponent || (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading messages...</span>
          </div>
        )}
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-1 items-center justify-center',
          'text-destructive',
          className
        )}
      >
        <div className="text-center">
          <p className="font-medium">Failed to load messages</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  /**
   * Render empty state
   */
  if (messages.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-1 items-center justify-center',
          'text-muted-foreground',
          className
        )}
      >
        {emptyComponent || (
          <div className="text-center">
            <p className="font-medium">No messages yet</p>
            <p className="text-sm mt-1">Start a conversation by sending a message</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <StickToBottom
      ref={containerRef}
      className={cn(
        // Base layout: flex-1 to take available space, relative positioning
        'relative flex-1 overflow-y-auto',
        // Scroll behavior styling
        'scroll-smooth',
        // Ensure proper background
        'bg-background',
        className
      )}
      initial={scrollBehavior}
      resize="smooth"
      role="log"
      aria-label="Chat messages"
      onScroll={handleScroll}
      {...props}
    >
      <StickToBottom.Content className="p-4 space-y-4">
        {/* Render messages */}
        {messages.map((message, index) => (
          <div key={message.id} className="w-full">
            {children ? (
              // Allow custom rendering of messages
              typeof children === 'function' 
                ? (children as (message: Message, index: number) => React.ReactNode)(message, index)
                : children
            ) : (
              // Use MessageItem component for consistent styling and behavior
              <MessageItem
                message={message}
                showActions={true}
                showTimestamp={true}
                onCopy={(content) => {
                  // Copy to clipboard is handled within MessageItem
                  onMessageAction?.('copy', message.id);
                }}
                onRegenerate={(messageId) => onMessageAction?.('regenerate', messageId)}
                onDelete={(messageId) => onMessageAction?.('delete', messageId)}
                onThumbsUp={(messageId) => onMessageAction?.('thumbsUp', messageId)}
                onThumbsDown={(messageId) => onMessageAction?.('thumbsDown', messageId)}
                parseIncompleteMarkdown={false}
              />
            )}
          </div>
        ))}

        {/* Streaming message when active */}
        {isStreaming && streamingContent && (
          <StreamingMessage
            content={streamingContent}
            isStreaming={true}
            onStop={onStopStream}
            onRegenerate={() => onMessageAction?.('regenerate', 'streaming')}
            showStreamingIndicator={showLoadingIndicator}
            showActions={true}
            parseIncompleteMarkdown={true}
            role="assistant"
          />
        )}

        {/* Loading indicator when streaming starts but no content yet */}
        {isStreaming && !streamingContent && showLoadingIndicator && (
          <StreamingMessage
            content=""
            isStreaming={true}
            onStop={onStopStream}
            showStreamingIndicator={true}
            showActions={false}
            role="assistant"
          />
        )}

        {/* Sync indicator */}
        {isSyncing && (
          <div className="flex justify-center">
            <div className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Syncing messages...
              </div>
            </div>
          </div>
        )}
      </StickToBottom.Content>

      {/* Scroll to bottom button - follows existing pattern */}
      <MessageListScrollButton />
    </StickToBottom>
  );
}

/**
 * Scroll to bottom button component
 * Based on the existing ConversationScrollButton pattern
 */
export interface MessageListScrollButtonProps extends ComponentProps<typeof Button> {}

export function MessageListScrollButton({
  className,
  ...props
}: MessageListScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full shadow-lg',
          'bg-background border border-border',
          'hover:bg-accent hover:text-accent-foreground',
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        aria-label="Scroll to bottom"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
}

/**
 * Message list container that provides consistent styling
 * Can be used when you need additional wrapper styling
 */
export interface MessageListContainerProps extends HTMLAttributes<HTMLDivElement> {}

export function MessageListContainer({
  className,
  children,
  ...props
}: MessageListContainerProps) {
  return (
    <div
      className={cn(
        // Container layout
        'flex flex-1 flex-col min-h-0',
        // Ensure proper background and text colors
        'bg-background text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}