'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { useEffect, useRef, useState, memo } from 'react';
import { Response } from '@/components/ai-elements/response';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StopCircle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Props for the StreamingMessage component
 */
export interface StreamingMessageProps extends HTMLAttributes<HTMLDivElement> {
  /** The current content being streamed */
  content: string;
  /** Whether the message is currently streaming */
  isStreaming: boolean;
  /** Whether the streaming has completed */
  isComplete?: boolean;
  /** Whether there was an error during streaming */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Handler for stopping the stream */
  onStop?: () => void;
  /** Handler for regenerating the message */
  onRegenerate?: () => void;
  /** Whether to show the streaming indicator */
  showStreamingIndicator?: boolean;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Custom streaming indicator component */
  streamingIndicator?: React.ReactNode;
  /** Whether to parse incomplete markdown during streaming */
  parseIncompleteMarkdown?: boolean;
  /** Role of the message (for styling) */
  role?: 'assistant' | 'user' | 'system';
}

/**
 * Real-time streaming message component that displays content as it's being generated.
 * Built on top of the existing Response component with enhanced streaming capabilities.
 * 
 * Features:
 * - Real-time content updates with smooth animations
 * - Incomplete markdown parsing during streaming
 * - Streaming status indicators with pulsing effects
 * - Stop and regenerate actions
 * - Error state handling with retry options
 * - Cursor/typing animation at the end of content
 * - Responsive design for mobile and desktop
 * - Accessibility support with live regions
 * - Performance optimized with memoization
 * 
 * Streaming Behavior:
 * - Content updates are applied incrementally
 * - Incomplete markdown tokens are handled gracefully
 * - Smooth animations when content changes
 * - Automatic scroll-to-bottom when content updates
 * - Error recovery and retry mechanisms
 */
export const StreamingMessage = memo(function StreamingMessage({
  className,
  content,
  isStreaming,
  isComplete = false,
  hasError = false,
  errorMessage = 'An error occurred while generating the response.',
  onStop,
  onRegenerate,
  showStreamingIndicator = true,
  showActions = true,
  streamingIndicator,
  parseIncompleteMarkdown = true,
  role = 'assistant',
  ...props
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousContentRef = useRef('');

  // Update displayed content when content prop changes
  useEffect(() => {
    if (content !== previousContentRef.current) {
      setDisplayedContent(content);
      previousContentRef.current = content;
    }
  }, [content]);

  // Manage cursor visibility during streaming
  useEffect(() => {
    if (isStreaming && !hasError) {
      setShowCursor(true);
      const interval = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setShowCursor(false);
    }
  }, [isStreaming, hasError]);

  // Auto-scroll to show new content (when component is near bottom of viewport)
  useEffect(() => {
    if (contentRef.current && isStreaming) {
      const element = contentRef.current;
      const isNearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100;
      
      if (isNearBottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [displayedContent, isStreaming]);

  /**
   * Render the default streaming indicator
   */
  const renderStreamingIndicator = () => {
    if (streamingIndicator) {
      return streamingIndicator;
    }

    return (
      <motion.div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="flex space-x-1">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-primary"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: index * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
        <span>AI is responding...</span>
      </motion.div>
    );
  };

  /**
   * Render action buttons
   */
  const renderActions = () => {
    if (!showActions) return null;

    return (
      <div className="flex items-center gap-2 mt-3">
        {isStreaming && onStop && (
          <Button
            variant="outline"
            size="sm"
            onClick={onStop}
            className="flex items-center gap-1.5"
          >
            <StopCircle className="h-4 w-4" />
            Stop
          </Button>
        )}
        
        {(hasError || isComplete) && onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Regenerate
          </Button>
        )}
      </div>
    );
  };

  return (
    <div
      ref={contentRef}
      className={cn(
        'w-full group',
        className
      )}
      {...props}
    >
      <div className="flex w-full justify-start">
        <div
          className={cn(
            'relative max-w-[80%] rounded-lg',
            'sm:max-w-[70%] md:max-w-[60%] lg:max-w-[50%]',
            'mr-8 sm:mr-12 md:mr-16',
            // Role-based styling
            role === 'assistant' && 'bg-muted text-foreground',
            role === 'user' && 'bg-primary text-primary-foreground',
            role === 'system' && 'bg-secondary text-secondary-foreground border border-border',
            // Error state styling
            hasError && 'border-destructive bg-destructive/5'
          )}
        >
          {/* Status indicator */}
          {(isStreaming || hasError) && (
            <div className="px-4 pt-3 pb-1">
              {hasError ? (
                <Badge variant="destructive" className="text-xs">
                  Error
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Generating
                  </div>
                </Badge>
              )}
            </div>
          )}

          {/* Message content */}
          <div className="px-4 py-3">
            {hasError ? (
              // Error state
              <div className="space-y-2">
                <p className="text-sm text-destructive font-medium">
                  Failed to generate response
                </p>
                <p className="text-xs text-muted-foreground">
                  {errorMessage}
                </p>
              </div>
            ) : displayedContent ? (
              // Message content with streaming support
              <div className="relative">
                <Response
                  className={cn(
                    'text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                    // Add live region for screen readers
                    isStreaming && 'sr-only'
                  )}
                  parseIncompleteMarkdown={parseIncompleteMarkdown && isStreaming}
                  aria-live={isStreaming ? 'polite' : undefined}
                  aria-atomic={isStreaming ? 'false' : undefined}
                >
                  {displayedContent}
                </Response>
                
                {/* Screen reader friendly version for streaming */}
                {isStreaming && (
                  <div
                    className="sr-only"
                    aria-live="polite"
                    aria-atomic="false"
                  >
                    {displayedContent}
                  </div>
                )}
                
                {/* Typing cursor */}
                <AnimatePresence>
                  {showCursor && isStreaming && (
                    <motion.span
                      className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-text-bottom"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            ) : isStreaming ? (
              // Initial streaming state (no content yet)
              renderStreamingIndicator()
            ) : null}
          </div>

          {/* Actions */}
          {renderActions()}

          {/* Timestamp for completed messages */}
          {isComplete && !hasError && (
            <div className="px-4 pb-2 text-xs opacity-70 text-muted-foreground">
              {new Date().toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Simple streaming text component for basic use cases
 */
export interface StreamingTextProps {
  /** The text content to stream */
  text: string;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Streaming speed in characters per update */
  speed?: number;
  /** Whether to show a cursor */
  showCursor?: boolean;
}

export function StreamingText({
  text,
  isStreaming,
  speed = 1,
  showCursor = true,
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
      return;
    }

    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + speed));
        setCurrentIndex(prev => prev + speed);
      }, 50);

      return () => clearTimeout(timeout);
    }
  }, [text, isStreaming, currentIndex, speed]);

  useEffect(() => {
    if (text !== displayedText && !isStreaming) {
      setDisplayedText(text);
      setCurrentIndex(text.length);
    }
  }, [text, isStreaming]);

  return (
    <span className="inline-block">
      {displayedText}
      {showCursor && isStreaming && currentIndex < text.length && (
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
      )}
    </span>
  );
}

/**
 * Streaming message container for layout control
 */
export interface StreamingMessageContainerProps extends HTMLAttributes<HTMLDivElement> {}

export function StreamingMessageContainer({
  className,
  children,
  ...props
}: StreamingMessageContainerProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}