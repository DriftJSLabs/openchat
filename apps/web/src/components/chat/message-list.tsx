'use client';

import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useInfiniteMessages } from '@/hooks/queries/use-messages-infinite';
import { useRealtimeSubscriptions } from '@/hooks/use-realtime-subscriptions';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowDownIcon, ArrowUpIcon, Loader2 } from 'lucide-react';
import type { Message } from '@/lib/db/schema/shared';
import { useChatContainer } from './chat-container';
import { MessageItem } from './message-item';
import { StreamingMessage } from './streaming-message';
import { 
  MessageVirtualizationManager, 
  createMessageVirtualization,
  type VirtualizationConfig 
} from '@/lib/db/message-virtualization';

/**
 * Props for the MessageList component
 */
export interface MessageListProps extends Omit<ComponentProps<typeof StickToBottom>, 'children'> {
  /** Array of messages to display */
  messages: Message[];
  /** Current chat ID for message loading */
  chatId?: string;
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
  /** Virtualization configuration */
  virtualizationConfig?: Partial<VirtualizationConfig>;
  /** Function to load more messages for infinite scroll */
  onLoadMore?: (startIndex: number, count: number) => Promise<Message[]>;
  /** Whether there are more messages to load */
  hasMoreMessages?: boolean;
  /** Whether currently loading more messages */
  isLoadingMore?: boolean;
  /** Custom message renderer */
  renderMessage?: (message: Message, index: number) => React.ReactNode;
  /** Whether to enable infinite scroll */
  enableInfiniteScroll?: boolean;
  /** Number of messages to load per batch */
  batchSize?: number;
}

/**
 * Enhanced message list component with virtualization and infinite scroll support.
 * Built on top of the existing Conversation component patterns with StickToBottom
 * functionality for automatic scrolling behavior.
 * 
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Scroll-to-bottom button when not at bottom
 * - Loading states and error handling
 * - Virtualization for performance with large message lists
 * - Infinite scroll for loading historical messages
 * - Responsive design that works on mobile and desktop
 * - Memory-efficient rendering for thousands of messages
 * - Follows existing conversation component patterns
 * 
 * Performance Considerations:
 * - Uses StickToBottom for efficient scroll management
 * - Virtualization for lists with hundreds of messages
 * - Memoized scroll calculations to prevent excessive re-renders
 * - Memory cleanup to prevent memory leaks
 * - Lazy loading of message batches
 */
export function MessageList({
  className,
  messages,
  chatId,
  isLoading = false,
  error = null,
  showLoadingIndicator = true,
  loadingComponent,
  emptyComponent,
  virtualized = false,
  virtualizationConfig,
  onLoadMore,
  hasMoreMessages = false,
  isLoadingMore = false,
  renderMessage,
  enableInfiniteScroll = true,
  batchSize = 50,
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
  const virtualizationManagerRef = useRef<MessageVirtualizationManager | null>(null);
  const loadingTriggerRef = useRef<HTMLDivElement>(null);
  
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(messages.length - 1, 49) });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  /**
   * Initialize virtualization manager if needed
   */
  const virtualizationManager = useMemo(() => {
    if (!virtualized || !onLoadMore) return null;

    const config = {
      itemHeight: 120, // Estimated message height
      bufferSize: 5,
      preloadSize: batchSize,
      maxCacheSize: 1000,
      overscan: 3,
      ...virtualizationConfig
    };

    const messageLoader = async (start: number, count: number) => {
      if (onLoadMore) {
        return await onLoadMore(start, count);
      }
      return [];
    };

    const manager = createMessageVirtualization(config, messageLoader);
    virtualizationManagerRef.current = manager;
    return manager;
  }, [virtualized, onLoadMore, batchSize, virtualizationConfig]);

  /**
   * Handle user scroll events to detect manual scrolling and implement infinite scroll
   */
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = element;
    
    setIsUserScrolling(true);
    setScrollPosition(scrollTop);
    
    // Handle infinite scroll to load more messages at the top
    if (enableInfiniteScroll && hasMoreMessages && !isLoadingHistory && scrollTop < 100) {
      setIsLoadingHistory(true);
      onLoadMore?.(messages.length, batchSize)
        .then(() => {
          setIsLoadingHistory(false);
          // Maintain scroll position after loading new messages
          setTimeout(() => {
            if (element) {
              element.scrollTop = scrollTop + 500; // Adjust for new content
            }
          }, 100);
        })
        .catch(() => setIsLoadingHistory(false));
    }
    
    // Update virtualization manager if active
    if (virtualizationManager) {
      virtualizationManager.updateScrollPosition(scrollTop, clientHeight)
        .then(range => {
          setVisibleRange({ start: range.start, end: range.end });
        })
        .catch(console.error);
    }
    
    // Clear existing timeout
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    
    // Reset user scrolling flag after 2 seconds of no scrolling
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 2000);
  }, [enableInfiniteScroll, hasMoreMessages, isLoadingHistory, messages.length, batchSize, onLoadMore, virtualizationManager]);

  /**
   * Intersection observer for infinite scroll trigger
   */
  useEffect(() => {
    if (!enableInfiniteScroll || !loadingTriggerRef.current || !hasMoreMessages) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingHistory) {
          setIsLoadingHistory(true);
          onLoadMore?.(0, batchSize) // Load from the beginning for history
            .then(() => setIsLoadingHistory(false))
            .catch(() => setIsLoadingHistory(false));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingTriggerRef.current);
    return () => observer.disconnect();
  }, [enableInfiniteScroll, hasMoreMessages, isLoadingHistory, onLoadMore, batchSize]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
      virtualizationManagerRef.current?.dispose();
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

  /**
   * Determine which messages to render based on virtualization
   */
  const messagesToRender = virtualized 
    ? messages.slice(visibleRange.start, visibleRange.end + 1)
    : messages;

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
        {/* Infinite scroll loading trigger for history */}
        {enableInfiniteScroll && hasMoreMessages && (
          <div 
            ref={loadingTriggerRef}
            className="flex justify-center py-4"
          >
            {isLoadingHistory ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading more messages...</span>
              </div>
            ) : (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setIsLoadingHistory(true);
                  onLoadMore?.(0, batchSize)
                    .then(() => setIsLoadingHistory(false))
                    .catch(() => setIsLoadingHistory(false));
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowUpIcon className="h-4 w-4 mr-2" />
                Load earlier messages
              </Button>
            )}
          </div>
        )}

        {/* Spacer for virtualization */}
        {virtualized && visibleRange.start > 0 && (
          <div 
            style={{ height: visibleRange.start * 120 }}
            aria-hidden="true"
          />
        )}

        {/* Render messages */}
        {messagesToRender.map((message, index) => {
          const actualIndex = virtualized ? visibleRange.start + index : index;
          
          return (
            <div 
              key={message.id} 
              className="w-full"
              data-message-index={actualIndex}
              style={virtualized ? { minHeight: '120px' } : undefined}
            >
              {renderMessage ? (
                renderMessage(message, actualIndex)
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
          );
        })}

        {/* Spacer for virtualization */}
        {virtualized && visibleRange.end < messages.length - 1 && (
          <div 
            style={{ height: (messages.length - visibleRange.end - 1) * 120 }}
            aria-hidden="true"
          />
        )}

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

        {/* Loading more messages at bottom */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading more messages...</span>
            </div>
          </div>
        )}
      </StickToBottom.Content>

      {/* Scroll to bottom and scroll to top buttons */}
      <MessageListScrollButton />
      {scrollPosition > 500 && (
        <Button
          className="absolute top-4 left-[50%] translate-x-[-50%] rounded-full shadow-lg bg-background border border-border hover:bg-accent"
          onClick={() => {
            containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          size="icon"
          variant="outline"
          aria-label="Scroll to top"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      )}
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