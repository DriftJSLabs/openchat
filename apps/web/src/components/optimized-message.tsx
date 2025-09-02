"use client";

import React, { memo } from 'react';
import { MessageContent } from './message-content';

interface OptimizedMessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  isStreaming?: boolean;
  className?: string;
}

// Memoized message component to prevent unnecessary re-renders
export const OptimizedMessage = memo(function OptimizedMessage({
  id,
  role,
  content,
  timestamp,
  isStreaming,
  className,
}: OptimizedMessageProps) {
  return (
    <div key={id} className={className}>
      <MessageContent
        role={role}
        content={content}
        timestamp={timestamp}
        isStreaming={isStreaming}
      />
    </div>
  );
});

// Display name for debugging
OptimizedMessage.displayName = 'OptimizedMessage';