/**
 * TanStack Query hooks for sync status management
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { offlineManager } from '@/lib/offline-manager';
import type { GlobalSyncState, OfflineQueueItem, DataConflict } from '@/lib/types/tanstack-db.types';

export const SYNC_QUERY_KEYS = {
  syncStatus: ['sync', 'status'] as const,
  queueItems: ['sync', 'queue'] as const,
  conflicts: ['sync', 'conflicts'] as const,
} as const;

/**
 * Hook for sync status with real-time updates
 */
export function useSyncStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SYNC_QUERY_KEYS.syncStatus,
    queryFn: async (): Promise<GlobalSyncState> => {
      return offlineManager.getSyncStateManager().getGlobalState();
    },
    staleTime: 1000, // Very fresh data
    refetchInterval: 2000, // Poll every 2 seconds
    refetchIntervalInBackground: false,
  });

  // Subscribe to real-time updates and invalidate queries
  const setupRealtimeSync = useCallback(() => {
    const syncStateManager = offlineManager.getSyncStateManager();
    
    const handleStateUpdate = () => {
      queryClient.invalidateQueries({ queryKey: SYNC_QUERY_KEYS.syncStatus });
    };

    syncStateManager.on('global-state-updated', handleStateUpdate);
    
    return () => {
      syncStateManager.off('global-state-updated', handleStateUpdate);
    };
  }, [queryClient]);

  return {
    ...query,
    setupRealtimeSync,
  };
}

/**
 * Hook for offline queue items
 */
export function useOfflineQueue() {
  return useQuery({
    queryKey: SYNC_QUERY_KEYS.queueItems,
    queryFn: async (): Promise<OfflineQueueItem[]> => {
      return offlineManager.getOfflineQueue().getItems();
    },
    staleTime: 5000,
    refetchInterval: 5000,
  });
}

/**
 * Hook for data conflicts
 */
export function useDataConflicts() {
  return useQuery({
    queryKey: SYNC_QUERY_KEYS.conflicts,
    queryFn: async (): Promise<DataConflict[]> => {
      // TODO: Implement conflict resolution when available
      return [];
    },
    staleTime: 10000,
    refetchInterval: 10000,
  });
}

/**
 * Combined hook for all sync data
 */
export function useSyncData() {
  const syncStatus = useSyncStatus();
  const queueItems = useOfflineQueue();
  const conflicts = useDataConflicts();

  return {
    syncStatus: syncStatus.data,
    queueItems: queueItems.data || [],
    conflicts: conflicts.data || [],
    isLoading: syncStatus.isLoading || queueItems.isLoading || conflicts.isLoading,
    error: syncStatus.error || queueItems.error || conflicts.error,
    setupRealtimeSync: syncStatus.setupRealtimeSync,
  };
}