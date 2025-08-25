/**
 * Advanced infinite scroll and pagination hooks for messages
 * Provides optimized message loading, virtual scrolling support,
 * and comprehensive pagination management for OpenChat.
 */

'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { messages } from '@/lib/tanstack-db';
import { errorHandler } from '@/lib/error-handling';

import type {
  Message,
  MessageWithMetadata,
  MessagePaginationParams,
  PaginatedResult,
  InfiniteScrollState
} from '@/lib/types/tanstack-db.types';

/**
 * Configuration for infinite message loading
 */
export interface InfiniteMessagesConfig {
  /** Number of messages to load per page */
  pageSize: number;
  /** Initial number of messages to load */
  initialPageSize: number;
  /** Direction to paginate (older or newer messages) */
  direction: 'before' | 'after';
  /** Order of messages (ascending/descending by timestamp) */
  order: 'asc' | 'desc';
  /** Whether to enable virtual scrolling */
  enableVirtualization: boolean;
  /** Estimated message height for virtualization */
  estimateMessageSize: number;
  /** Overscan count for virtual scrolling */
  overscan: number;
  /** Whether to include deleted messages */
  includeDeleted: boolean;
  /** Prefetch threshold (pages) */
  prefetchThreshold: number;
  /** Stale time for cached data */
  staleTime: number;
}

/**
 * Infinite scroll state with virtual scrolling support
 */
export interface VirtualInfiniteScrollState<T> extends InfiniteScrollState<T> {
  /** Virtual scrolling utilities */
  virtualizer?: {
    /** Total size of virtual content */
    getTotalSize: () => number;
    /** Get virtual items for rendering */
    getVirtualItems: () => Array<{
      index: number;
      start: number;
      size: number;
      end: number;
    }>;
    /** Measure element function */
    measureElement: (element: Element | null) => void;
    /** Scroll to offset */
    scrollToOffset: (offset: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;
    /** Scroll to index */
    scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;
  };
  /** Scroll container ref */
  scrollElementRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Total message count */
  totalCount: number;
  /** Whether scrolling to bottom */
  isScrollingToBottom: boolean;
  /** Function to scroll to latest message */
  scrollToLatest: () => void;
  /** Function to scroll to specific message */
  scrollToMessage: (messageId: string) => void;
}

/**
 * Hook for infinite message loading with virtual scrolling
 */
export function useInfiniteMessages(
  chatId: string | null,
  config: Partial<InfiniteMessagesConfig> = {}
): VirtualInfiniteScrollState<MessageWithMetadata> {
  const fullConfig: InfiniteMessagesConfig = {
    pageSize: 50,
    initialPageSize: 50,
    direction: 'before',
    order: 'desc',
    enableVirtualization: true,
    estimateMessageSize: 100,
    overscan: 5,
    includeDeleted: false,
    prefetchThreshold: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...config,
  };

  const queryClient = useQueryClient();
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const [isScrollingToBottom, setIsScrollingToBottom] = useState(false);

  // Infinite query for messages
  const {
    data,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['infinite-messages', chatId, fullConfig],
    queryFn: async ({ pageParam }) => {
      if (!chatId) {
        return {
          data: [],
          hasMore: false,
          nextCursor: null,
          prevCursor: null,
          totalCount: 0,
        } as PaginatedResult<MessageWithMetadata>;
      }

      const operationId = `load-messages-${chatId}-${Date.now()}`;
      
      try {
        return await errorHandler.executeWithErrorHandling(
          async () => {
            let query = messages.query().where('chat_id', '=', chatId);
            
            if (!fullConfig.includeDeleted) {
              query = query.where('is_deleted', '=', false);
            }

            // Apply cursor-based pagination
            if (pageParam) {
              const cursorDate = new Date(pageParam);
              if (fullConfig.direction === 'before') {
                query = query.where('created_at', '<', cursorDate);
              } else {
                query = query.where('created_at', '>', cursorDate);
              }
            }

            // Apply ordering and limit
            const orderedQuery = query
              .orderBy('created_at', fullConfig.order)
              .limit(fullConfig.pageSize);

            const result = await orderedQuery.execute();
            
            // Convert to MessageWithMetadata
            const messagesWithMetadata: MessageWithMetadata[] = result.map(msg => ({
              ...msg,
              isOptimistic: false,
              isEditing: false,
              error: undefined,
              retryCount: 0,
            }));

            // Determine if there are more pages
            const hasMore = result.length === fullConfig.pageSize;
            
            // Calculate cursors
            const nextCursor = hasMore && result.length > 0 
              ? result[result.length - 1].createdAt.toISOString()
              : null;
            const prevCursor = result.length > 0 
              ? result[0].createdAt.toISOString() 
              : null;

            // Get total count (expensive operation, use sparingly)
            const totalCount = await messages.query()
              .where('chat_id', '=', chatId)
              .where('is_deleted', '=', false)
              .count();

            return {
              data: messagesWithMetadata,
              hasMore,
              nextCursor,
              prevCursor,
              totalCount,
            } as PaginatedResult<MessageWithMetadata>;
          },
          {
            operationId,
            operation: 'load-messages',
            entityInfo: { entityType: 'message' as any, entityId: chatId },
            showLoading: false, // Don't show loading for pagination
          }
        );
      } catch (err) {
        throw err;
      }
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor || null,
    getPreviousPageParam: (firstPage) => firstPage?.prevCursor || null,
    enabled: !!chatId,
    staleTime: fullConfig.staleTime,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Flatten all messages from pages
  const allMessages = useMemo(() => {
    if (!data?.pages) return [];
    
    const messages = data.pages.flatMap(page => page?.data || []);
    
    // Sort messages by timestamp for consistent ordering
    return messages.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return fullConfig.order === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [data?.pages, fullConfig.order]);

  // Total count from the latest page
  const totalCount = data?.pages?.[0]?.totalCount || 0;

  // Virtual scrolling setup
  const virtualizer = useMemo(() => {
    if (!fullConfig.enableVirtualization || !scrollElementRef.current) {
      return undefined;
    }

    return useVirtualizer({
      count: allMessages.length,
      getScrollElement: () => scrollElementRef.current,
      estimateSize: () => fullConfig.estimateMessageSize,
      overscan: fullConfig.overscan,
      // Measure dynamic heights
      measureElement: (element) => {
        if (!element) return;
        
        // Get the actual height of rendered message
        const rect = element.getBoundingClientRect();
        return rect.height;
      },
    });
  }, [
    fullConfig.enableVirtualization,
    allMessages.length,
    fullConfig.estimateMessageSize,
    fullConfig.overscan
  ]);

  // Auto-pagination when scrolling near edges
  useEffect(() => {
    if (!scrollElementRef.current || !virtualizer) return;

    const scrollElement = scrollElementRef.current;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
      
      // Load more messages when scrolling near the top (for older messages)
      if (scrollPercentage < 0.1 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
      
      // Load newer messages when scrolling to bottom
      if (scrollPercentage > 0.9 && hasPreviousPage && !isFetchingPreviousPage) {
        fetchPreviousPage();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [hasNextPage, hasPreviousPage, isFetchingNextPage, isFetchingPreviousPage, fetchNextPage, fetchPreviousPage, virtualizer]);

  // Scroll to latest message
  const scrollToLatest = useCallback(() => {
    if (!scrollElementRef.current) return;
    
    setIsScrollingToBottom(true);
    
    if (virtualizer) {
      // Virtual scrolling - scroll to last item
      virtualizer.scrollToIndex(allMessages.length - 1, {
        align: 'end',
      });
    } else {
      // Regular scrolling
      scrollElementRef.current.scrollTop = scrollElementRef.current.scrollHeight;
    }
    
    setTimeout(() => setIsScrollingToBottom(false), 500);
  }, [virtualizer, allMessages.length]);

  // Scroll to specific message
  const scrollToMessage = useCallback((messageId: string) => {
    const messageIndex = allMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1 || !virtualizer) return;
    
    virtualizer.scrollToIndex(messageIndex, {
      align: 'center',
    });
  }, [allMessages, virtualizer]);

  // Prefetch next pages when approaching threshold
  useEffect(() => {
    if (!data?.pages || data.pages.length < fullConfig.prefetchThreshold) return;
    
    const shouldPrefetch = data.pages.length <= fullConfig.prefetchThreshold;
    if (shouldPrefetch && hasNextPage && !isFetchingNextPage) {
      queryClient.prefetchInfiniteQuery({
        queryKey: ['infinite-messages', chatId, fullConfig],
        // Use a shorter stale time for prefetched data
        staleTime: 60 * 1000, // 1 minute
      });
    }
  }, [data?.pages, fullConfig.prefetchThreshold, hasNextPage, isFetchingNextPage, queryClient, chatId, fullConfig]);

  // Refresh function that invalidates and refetches
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['infinite-messages', chatId],
    });
    await refetch();
  }, [queryClient, chatId, refetch]);

  return {
    pages: data?.pages || [],
    allData: allMessages,
    hasNextPage: hasNextPage || false,
    isFetchingNextPage,
    fetchNextPage,
    refresh,
    
    // Virtual scrolling specific
    virtualizer: virtualizer ? {
      getTotalSize: virtualizer.getTotalSize,
      getVirtualItems: virtualizer.getVirtualItems,
      measureElement: virtualizer.measureElement,
      scrollToOffset: virtualizer.scrollToOffset,
      scrollToIndex: virtualizer.scrollToIndex,
    } : undefined,
    
    scrollElementRef,
    totalCount,
    isScrollingToBottom,
    scrollToLatest,
    scrollToMessage,
  };
}

/**
 * Hook for bidirectional infinite scrolling (both directions)
 */
export function useBidirectionalMessages(
  chatId: string | null,
  config: Partial<InfiniteMessagesConfig> = {}
): {
  olderMessages: VirtualInfiniteScrollState<MessageWithMetadata>;
  newerMessages: VirtualInfiniteScrollState<MessageWithMetadata>;
  allMessages: MessageWithMetadata[];
  scrollToMessage: (messageId: string) => void;
  loadAroundMessage: (messageId: string) => Promise<void>;
} {
  // Load older messages (scrolling up)
  const olderMessages = useInfiniteMessages(chatId, {
    ...config,
    direction: 'before',
    order: 'desc',
  });

  // Load newer messages (scrolling down)
  const newerMessages = useInfiniteMessages(chatId, {
    ...config,
    direction: 'after',
    order: 'asc',
  });

  // Combine all messages and deduplicate
  const allMessages = useMemo(() => {
    const older = olderMessages.allData;
    const newer = newerMessages.allData;
    
    // Merge and deduplicate by message ID
    const messageMap = new Map<string, MessageWithMetadata>();
    
    [...older, ...newer].forEach(msg => {
      messageMap.set(msg.id, msg);
    });
    
    // Sort by timestamp
    return Array.from(messageMap.values()).sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [olderMessages.allData, newerMessages.allData]);

  // Scroll to specific message (uses older messages virtualizer by default)
  const scrollToMessage = useCallback((messageId: string) => {
    olderMessages.scrollToMessage(messageId);
  }, [olderMessages]);

  // Load messages around a specific message
  const loadAroundMessage = useCallback(async (messageId: string) => {
    // Implementation would need to:
    // 1. Find the message timestamp
    // 2. Load pages before and after that timestamp
    // 3. Update both infinite queries
    
    // This is a placeholder - full implementation would be more complex
    await Promise.all([
      olderMessages.refresh(),
      newerMessages.refresh(),
    ]);
  }, [olderMessages, newerMessages]);

  return {
    olderMessages,
    newerMessages,
    allMessages,
    scrollToMessage,
    loadAroundMessage,
  };
}

/**
 * Hook for message search with pagination
 */
export function useSearchMessages(
  chatId: string | null,
  searchQuery: string,
  config: Partial<InfiniteMessagesConfig> = {}
): VirtualInfiniteScrollState<MessageWithMetadata> & {
  searchQuery: string;
  resultCount: number;
  highlightTerms: string[];
} {
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);

  const searchConfig: InfiniteMessagesConfig = {
    pageSize: 20, // Smaller pages for search
    ...config,
  };

  const searchResults = useInfiniteMessages(chatId, {
    ...searchConfig,
    // Override the query key to include search terms
    ...{ searchQuery }, // This would need to be incorporated into the query logic
  });

  // Parse search terms for highlighting
  useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightTerms([]);
      return;
    }

    // Simple term extraction - could be enhanced with more sophisticated parsing
    const terms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2); // Only highlight terms longer than 2 chars
    
    setHighlightTerms(terms);
  }, [searchQuery]);

  const resultCount = searchResults.totalCount;

  return {
    ...searchResults,
    searchQuery,
    resultCount,
    highlightTerms,
  };
}