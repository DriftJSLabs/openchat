/**
 * Chat Loading Component
 * 
 * Provides loading states for chat-related operations with smooth animations
 * and proper accessibility support. Used throughout the application when
 * chat data is being fetched or processed.
 */

import { Loader2, MessageSquare, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatLoadingProps {
  className?: string;
  message?: string;
  variant?: 'default' | 'minimal' | 'skeleton';
}

/**
 * Main chat loading component with multiple display variants
 * 
 * @param className - Additional CSS classes
 * @param message - Custom loading message
 * @param variant - Loading display style
 */
export function ChatLoading({ 
  className, 
  message = "Loading conversation...", 
  variant = 'default' 
}: ChatLoadingProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (variant === 'skeleton') {
    return <ChatSkeleton className={className} />;
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full p-8 text-center",
      className
    )}>
      <div className="relative mb-6">
        {/* Animated background circle */}
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
        
        {/* Main loading icon */}
        <div className="relative w-16 h-16 rounded-full bg-background border-2 border-primary/20 flex items-center justify-center">
          <Bot className="h-8 w-8 text-primary animate-pulse" />
        </div>
        
        {/* Spinning loader */}
        <div className="absolute -top-2 -right-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">
        {message}
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-md">
        Please wait while we prepare your chat experience
      </p>

      {/* Loading dots animation */}
      <div className="flex items-center space-x-1 mt-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 bg-primary rounded-full animate-pulse"
            style={{
              animationDelay: `${i * 0.2}s`,
              animationDuration: '1s',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Chat skeleton loading component
 * Shows placeholder elements that mimic the chat interface structure
 */
export function ChatSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      {/* Header skeleton */}
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
            <div className="w-32 h-5 bg-muted rounded animate-pulse" />
          </div>
          <div className="w-20 h-8 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Messages area skeleton */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-xs space-y-2">
            <div className="w-48 h-4 bg-muted rounded animate-pulse" />
            <div className="w-32 h-4 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* AI message */}
        <div className="flex justify-start">
          <div className="max-w-md space-y-2">
            <div className="w-64 h-4 bg-muted rounded animate-pulse" />
            <div className="w-48 h-4 bg-muted rounded animate-pulse" />
            <div className="w-56 h-4 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Another user message */}
        <div className="flex justify-end">
          <div className="max-w-xs space-y-2">
            <div className="w-40 h-4 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Loading AI response */}
        <div className="flex justify-start">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-muted rounded-full animate-pulse" />
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-muted rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-muted rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-muted rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="flex-shrink-0 p-4 border-t">
        <div className="flex items-end gap-3">
          <div className="flex-1 h-12 bg-muted rounded-lg animate-pulse" />
          <div className="w-12 h-12 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * Chat list loading component
 * Shows skeleton placeholders for chat conversation lists
 */
export function ChatListLoading({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Search bar skeleton */}
      <div className="w-full h-10 bg-muted rounded-lg animate-pulse" />
      
      {/* Chat items skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ChatItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual chat item skeleton for lists
 */
export function ChatItemSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-muted rounded" />
          <div className="w-32 h-4 bg-muted rounded" />
        </div>
        <div className="w-4 h-4 bg-muted rounded" />
      </div>
      
      {/* Content */}
      <div className="space-y-2">
        <div className="w-full h-3 bg-muted rounded" />
        <div className="w-3/4 h-3 bg-muted rounded" />
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="w-16 h-3 bg-muted rounded" />
        <div className="w-20 h-3 bg-muted rounded" />
      </div>
    </div>
  );
}

/**
 * Message loading component for real-time chat
 * Shows when AI is thinking/typing a response
 */
export function MessageLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 p-4", className)}>
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">AI is thinking</span>
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
              style={{
                animationDelay: `${i * 0.15}s`,
                animationDuration: '0.6s',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Connection loading component
 * Shows when establishing connection to chat services
 */
export function ConnectionLoading({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-lg border border-dashed",
      className
    )}>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">
        Connecting to chat services...
      </span>
    </div>
  );
}