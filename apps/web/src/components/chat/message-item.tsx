'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { memo } from 'react';
import type { Message } from '@/lib/db/schema/shared';
import { Response } from '@/components/ai-elements/response';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Copy,
  MoreHorizontal,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState, useEffect } from 'react';

/**
 * Props for the MessageItem component
 */
export interface MessageItemProps extends HTMLAttributes<HTMLDivElement> {
  /** The message to display */
  message: Message;
  /** Whether this message is currently being streamed */
  isStreaming?: boolean;
  /** Whether to show message actions (copy, regenerate, etc.) */
  showActions?: boolean;
  /** Whether to show timestamp */
  showTimestamp?: boolean;
  /** Whether to show role badge */
  showRole?: boolean;
  /** Custom action handlers */
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onThumbsUp?: (messageId: string) => void;
  onThumbsDown?: (messageId: string) => void;
  /** Whether to parse incomplete markdown (for streaming messages) */
  parseIncompleteMarkdown?: boolean;
}

/**
 * Individual message component that displays a single chat message.
 * Handles both user and AI messages with appropriate styling and positioning.
 * 
 * Features:
 * - User messages appear on the right with primary styling (no icons)
 * - AI messages appear on the left with muted styling (no icons)
 * - Clean layout without avatars or user icons as per requirements
 * - Markdown rendering for AI responses using existing Response component
 * - Message actions (copy, regenerate, thumbs up/down, delete)
 * - Responsive design that works on mobile and desktop
 * - Proper accessibility with ARIA labels and keyboard navigation
 * - Performance optimized with memo for large message lists
 * 
 * Layout Specification:
 * - User messages: right-aligned, primary background, max 80% width, no icons
 * - AI messages: left-aligned, muted background, max 80% width, no icons
 * - Actions appear on hover for desktop, always visible on mobile
 * - Timestamps shown in small text below message content
 * - Proper spacing and margin management for clean appearance
 */
export const MessageItem = memo(function MessageItem({
  className,
  message,
  isStreaming = false,
  showActions = true,
  showTimestamp = true,
  showRole = false,
  onCopy,
  onRegenerate,
  onDelete,
  onThumbsUp,
  onThumbsDown,
  parseIncompleteMarkdown = true,
  ...props
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Detect mobile viewport to always show actions on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  /**
   * Handle copying message content to clipboard
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onCopy?.(message.content);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (date: Date | string | number) => {
    const messageDate = new Date(date);
    const now = new Date();
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return messageDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (diffInHours < 168) { // 7 days
      return messageDate.toLocaleDateString([], { 
        weekday: 'short',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return messageDate.toLocaleDateString([], { 
        month: 'short',
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  return (
    <div
      className={cn(
        // Base layout: full width with proper spacing
        'w-full group',
        // Add hover state for actions
        'transition-colors duration-200',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      <div
        className={cn(
          // Message container layout
          'flex w-full gap-2',
          // Alignment based on message role
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        {/* Message content container */}
        <div
          className={cn(
            // Base message bubble styling
            'relative max-w-[80%] rounded-lg',
            // Responsive max width
            'sm:max-w-[70%] md:max-w-[60%] lg:max-w-[50%]',
            // Role-based styling
            isUser && [
              'bg-primary text-primary-foreground',
              'ml-8 sm:ml-12 md:ml-16', // Left margin for user messages
            ],
            isAssistant && [
              'bg-muted text-foreground',
              'mr-8 sm:mr-12 md:mr-16', // Right margin for AI messages
            ],
            message.role === 'system' && [
              'bg-secondary text-secondary-foreground border border-border',
              'mx-8 sm:mx-12 md:mx-16', // Center system messages
            ]
          )}
        >
          {/* Role badge (optional) */}
          {showRole && (
            <div className="mb-2">
              <Badge 
                variant={isUser ? 'default' : isAssistant ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {message.role}
              </Badge>
            </div>
          )}

          {/* Message content */}
          <div className="px-4 py-3">
            {isAssistant ? (
              // Use the existing Response component for AI messages with markdown
              <Response
                className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                parseIncompleteMarkdown={parseIncompleteMarkdown && isStreaming}
              >
                {message.content}
              </Response>
            ) : (
              // Plain text for user and system messages
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {message.content}
              </p>
            )}
          </div>

          {/* Timestamp */}
          {showTimestamp && (
            <div className={cn(
              'px-4 pb-2 text-xs opacity-70',
              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {formatTimestamp(message.createdAt)}
              {isStreaming && (
                <span className="ml-2 animate-pulse">●</span>
              )}
            </div>
          )}
        </div>

        {/* Message actions */}
        {showActions && (isHovered || isMobile) && (
          <div className={cn(
            'flex items-start gap-1 pt-2',
            // Position actions based on message alignment
            isUser ? 'order-first pr-2' : 'order-last pl-2'
          )}>
            {/* Copy button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-60 hover:opacity-100"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              <Copy className="h-3 w-3" />
            </Button>

            {/* Additional actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-60 hover:opacity-100"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isUser ? "end" : "start"} className="w-48">
                {/* Feedback actions for AI messages */}
                {isAssistant && (
                  <>
                    <DropdownMenuItem 
                      onClick={() => onThumbsUp?.(message.id)}
                      className="flex items-center gap-2"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Helpful
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onThumbsDown?.(message.id)}
                      className="flex items-center gap-2"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Not helpful
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onRegenerate?.(message.id)}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Regenerate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                {/* Delete action */}
                <DropdownMenuItem 
                  onClick={() => onDelete?.(message.id)}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Copy feedback */}
      {isCopied && (
        <div className={cn(
          'mt-1 text-xs text-muted-foreground',
          isUser ? 'text-right mr-8 sm:mr-12 md:mr-16' : 'text-left ml-8 sm:ml-12 md:ml-16'
        )}>
          Copied to clipboard
        </div>
      )}
    </div>
  );
});

/**
 * Message item container for additional styling or layout control
 */
export interface MessageItemContainerProps extends HTMLAttributes<HTMLDivElement> {}

export function MessageItemContainer({
  className,
  children,
  ...props
}: MessageItemContainerProps) {
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

/**
 * Message separator component for grouping messages by time or topic
 */
export interface MessageSeparatorProps extends HTMLAttributes<HTMLDivElement> {
  /** Text to display in the separator */
  text: string;
}

export function MessageSeparator({
  className,
  text,
  ...props
}: MessageSeparatorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 my-6',
        className
      )}
      {...props}
    >
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground font-medium px-2">
        {text}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}