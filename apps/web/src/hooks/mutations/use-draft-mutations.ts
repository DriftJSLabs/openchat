/**
 * TanStack Query mutations for draft auto-save - replaces useEffect patterns
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

type DraftData = {
  id: string;
  content: string;
  chatId: string;
  createdAt: Date;
  updatedAt: Date;
};

export const DRAFT_QUERY_KEYS = {
  drafts: ['drafts'] as const,
  draft: (key: string) => ['drafts', key] as const,
} as const;

/**
 * Debounced auto-save mutation - replaces useEffect + setTimeout pattern
 */
export function useDraftAutoSave(draftKey: string, options?: {
  debounceMs?: number;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const { debounceMs = 1000, enabled = true } = options || {};

  // Save draft mutation
  const saveMutation = useMutation({
    mutationFn: async (content: string): Promise<DraftData> => {
      // TODO: Replace with actual API call
      const now = new Date();
      const draft: DraftData = {
        id: `draft-${draftKey}`,
        content,
        chatId: draftKey,
        createdAt: now,
        updatedAt: now,
      };

      // Simulate API call
      localStorage.setItem(`chat-draft-${draftKey}`, content);
      
      return draft;
    },
    onSuccess: (data) => {
      // Update query cache
      queryClient.setQueryData(DRAFT_QUERY_KEYS.draft(draftKey), data);
      queryClient.invalidateQueries({ queryKey: DRAFT_QUERY_KEYS.drafts });
    },
    onError: (error) => {
      console.error('Failed to save draft:', error);
    },
  });

  // Load draft mutation
  const loadMutation = useMutation({
    mutationFn: async (): Promise<string | null> => {
      // TODO: Replace with actual API call
      const savedDraft = localStorage.getItem(`chat-draft-${draftKey}`);
      return savedDraft;
    },
  });

  // Delete draft mutation
  const deleteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      // TODO: Replace with actual API call
      localStorage.removeItem(`chat-draft-${draftKey}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: DRAFT_QUERY_KEYS.draft(draftKey) });
      queryClient.invalidateQueries({ queryKey: DRAFT_QUERY_KEYS.drafts });
    },
  });

  // Debounced save function - replaces useEffect debouncing
  const debouncedSave = useCallback((content: string) => {
    if (!enabled || !content.trim()) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      saveMutation.mutate(content);
    }, debounceMs);
  }, [saveMutation, debounceMs, enabled]);

  // Immediate save (for important events like blur)
  const saveImmediately = useCallback((content: string) => {
    if (!enabled) return;

    // Clear debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    saveMutation.mutate(content);
  }, [saveMutation, enabled]);

  // Load saved draft
  const loadDraft = useCallback(() => {
    return loadMutation.mutateAsync();
  }, [loadMutation]);

  // Clear draft
  const clearDraft = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    deleteMutation.mutate();
  }, [deleteMutation]);

  return {
    // Actions
    debouncedSave,
    saveImmediately,
    loadDraft,
    clearDraft,
    
    // States
    isSaving: saveMutation.isPending,
    isLoading: loadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    
    // Errors
    saveError: saveMutation.error,
    loadError: loadMutation.error,
    deleteError: deleteMutation.error,
    
    // Success states
    lastSaved: saveMutation.isSuccess ? new Date() : null,
  };
}