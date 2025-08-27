/**
 * TanStack Query infinite messages hook - replaces useEffect patterns
 */

'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useEffect } from 'react';

// Define simplified types for now until we fix the import issues
type Message = {
  id: string;
  content: string;
  createdAt: Date;
  userId: string;
  chatId: string;
};

type MessagePage = {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
};

export const MESSAGES_QUERY_KEYS = {
  messages: (chatId: string) => ['messages', chatId] as const,
  infiniteMessages: (chatId: string) => ['messages', 'infinite', chatId] as const,
} as const;

/**
 * Improved infinite messages hook without useEffect dependencies
 */
export function useInfiniteMessages(chatId: string | null) {
  const queryClient = useQueryClient();
  const scrollElementRef = useRef<HTMLDivElement | null>(null);

  const query = useInfiniteQuery({
    queryKey: chatId ? MESSAGES_QUERY_KEYS.infiniteMessages(chatId) : ['messages', 'infinite', 'null'],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!chatId) return { messages: [], nextCursor: null, hasMore: false };
      
      // TODO: Replace with actual API call
      const mockMessages: Message[] = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${pageParam || 'initial'}-${i}`,
        content: `Message ${i} on page ${pageParam || 'initial'}`,
        createdAt: new Date(Date.now() - i * 60000),
        userId: 'user1',
        chatId,
      }));

      return {
        messages: mockMessages,
        nextCursor: `page-${Date.now()}`,
        hasMore: Math.random() > 0.3, // Simulate some pages having no more
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!chatId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Optimized scroll handler using IntersectionObserver instead of useEffect
  const setupInfiniteScroll = useCallback((element: HTMLDivElement | null) => {
    if (!element || !query.hasNextPage || query.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    // Observe the top element for loading older messages
    const firstChild = element.firstElementChild;
    if (firstChild) {
      observer.observe(firstChild);
    }

    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  // Auto-scroll to bottom for new messages (without useEffect)
  const scrollToBottom = useCallback(() => {
    if (scrollElementRef.current) {
      scrollElementRef.current.scrollTop = scrollElementRef.current.scrollHeight;
    }
  }, []);

  // Prefetch next page when approaching end
  const prefetchNext = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      queryClient.prefetchInfiniteQuery({
        queryKey: chatId ? MESSAGES_QUERY_KEYS.infiniteMessages(chatId) : ['messages', 'infinite', 'null'],
        queryFn: async ({ pageParam }: { pageParam: string | null }) => {
          if (!chatId) return { messages: [], nextCursor: null, hasMore: false };
          
          // Same query function as main query
          const mockMessages: Message[] = Array.from({ length: 20 }, (_, i) => ({
            id: `msg-${pageParam || 'prefetch'}-${i}`,
            content: `Prefetched message ${i}`,
            createdAt: new Date(Date.now() - i * 60000),
            userId: 'user1',
            chatId,
          }));

          return {
            messages: mockMessages,
            nextCursor: `prefetch-${Date.now()}`,
            hasMore: Math.random() > 0.3,
          };
        },
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
        staleTime: 60 * 1000,
      });
    }
  }, [query.hasNextPage, query.isFetchingNextPage, queryClient, chatId]);

  // Flatten all pages into a single array
  const allMessages = query.data?.pages.flatMap(page => page.messages) ?? [];

  return {
    // Data
    messages: allMessages,
    totalCount: allMessages.length,
    
    // Loading states
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    
    // Pagination
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    
    // Error handling
    error: query.error,
    isError: query.isError,
    
    // Utilities
    scrollElementRef,
    setupInfiniteScroll,
    scrollToBottom,
    prefetchNext,
    
    // Query invalidation
    invalidate: () => queryClient.invalidateQueries({ 
      queryKey: chatId ? MESSAGES_QUERY_KEYS.infiniteMessages(chatId) : ['messages', 'infinite', 'null']
    }),
  };
}

/**
 * Hook for real-time message subscriptions that invalidate queries
 */
export function useMessageSubscription(chatId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId) return;

    // TODO: Replace with actual WebSocket/SSE subscription
    const handleNewMessage = () => {
      queryClient.invalidateQueries({ 
        queryKey: MESSAGES_QUERY_KEYS.infiniteMessages(chatId)
      });
    };

    const handleMessageUpdate = () => {
      queryClient.invalidateQueries({ 
        queryKey: MESSAGES_QUERY_KEYS.infiniteMessages(chatId)
      });
    };

    // Simulate subscription setup
    const interval = setInterval(() => {
      if (Math.random() > 0.95) { // Simulate occasional new messages
        handleNewMessage();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [chatId, queryClient]);
}