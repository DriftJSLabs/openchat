/**
 * Chat Error Components
 * 
 * Provides comprehensive error handling and display components for chat-related
 * operations. Includes retry mechanisms, user-friendly error messages, and
 * proper accessibility support.
 */

'use client';

import React from "react";
import { AlertTriangle, RefreshCw, MessageSquare, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ChatErrorProps {
  title?: string;
  message?: string;
  chatId?: string;
  className?: string;
  variant?: 'default' | 'minimal' | 'inline';
  showRetry?: boolean;
  showNavigation?: boolean;
  onRetry?: () => void;
}

/**
 * Main chat error component with multiple display variants
 * 
 * @param title - Error title/heading
 * @param message - Detailed error message
 * @param chatId - Associated chat ID for context
 * @param className - Additional CSS classes
 * @param variant - Error display style
 * @param showRetry - Whether to show retry button
 * @param showNavigation - Whether to show navigation options
 * @param onRetry - Retry callback function
 */
export function ChatError({
  title = "Something went wrong",
  message = "There was an error with your chat. Please try again.",
  chatId,
  className,
  variant = 'default',
  showRetry = true,
  showNavigation = true,
  onRetry,
}: ChatErrorProps) {
  const router = useRouter();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default retry behavior - refresh the page
      window.location.reload();
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  if (variant === 'minimal') {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <Alert className={cn("mb-4", className)}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">
          {message}
          {showRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="mt-3 gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Try Again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full p-8 text-center",
      className
    )}>
      {/* Error Icon */}
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>

      {/* Error Content */}
      <div className="max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          {title}
        </h2>
        
        <p className="text-muted-foreground">
          {message}
        </p>

        {/* Chat ID for debugging */}
        {chatId && (
          <div className="text-xs text-muted-foreground font-mono bg-muted/50 px-3 py-2 rounded">
            Chat ID: {chatId}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {showRetry && (
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
          
          {showNavigation && (
            <>
              <Button variant="outline" onClick={handleGoBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              
              <Button variant="ghost" asChild className="gap-2">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Conversation not found error component
 * Specialized error for when a chat conversation cannot be found
 */
export function ConversationNotFoundError({ 
  chatId, 
  className 
}: { 
  chatId?: string; 
  className?: string; 
}) {
  return (
    <ChatError
      title="Conversation Not Found"
      message="The chat conversation you're looking for doesn't exist or may have been deleted."
      chatId={chatId}
      className={className}
      showRetry={false}
      showNavigation={true}
    />
  );
}

/**
 * Network error component
 * Specialized error for connectivity issues
 */
export function NetworkError({ 
  onRetry, 
  className 
}: { 
  onRetry?: () => void; 
  className?: string; 
}) {
  return (
    <ChatError
      title="Connection Error"
      message="Unable to connect to chat services. Please check your internet connection and try again."
      className={className}
      showRetry={true}
      showNavigation={false}
      onRetry={onRetry}
    />
  );
}

/**
 * Rate limit error component
 * Specialized error for API rate limiting
 */
export function RateLimitError({ 
  retryAfter, 
  className 
}: { 
  retryAfter?: number; 
  className?: string; 
}) {
  const retryMessage = retryAfter 
    ? `You've reached the rate limit. Please wait ${retryAfter} seconds before trying again.`
    : "You've sent too many messages recently. Please wait a moment before sending another message.";

  return (
    <ChatError
      title="Rate Limit Exceeded"
      message={retryMessage}
      className={className}
      showRetry={false}
      showNavigation={false}
    />
  );
}

/**
 * Authentication error component
 * Specialized error for authentication issues
 */
export function AuthenticationError({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full p-8 text-center",
      className
    )}>
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>

      <div className="max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Authentication Required
        </h2>
        
        <p className="text-muted-foreground">
          You need to be logged in to access this chat conversation.
        </p>

        <Button asChild className="mt-4">
          <Link href="/login">
            Sign In
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Permission error component
 * Specialized error for insufficient permissions
 */
export function PermissionError({ className }: { className?: string }) {
  return (
    <ChatError
      title="Access Denied"
      message="You don't have permission to view this chat conversation."
      className={className}
      showRetry={false}
      showNavigation={true}
    />
  );
}

/**
 * Error boundary component for chat interfaces
 * Catches JavaScript errors and displays a friendly error message
 */
interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Chat Error Boundary caught an error:', error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ChatError
          title="Unexpected Error"
          message="An unexpected error occurred while loading the chat. Please try refreshing the page."
          showRetry={true}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Message send error component
 * Specialized error for message sending failures
 */
export function MessageSendError({ 
  message = "Your message couldn't be sent. Please check your connection and try again.",
  onRetry, 
  className 
}: { 
  message?: string;
  onRetry?: () => void; 
  className?: string; 
}) {
  return (
    <Alert className={cn("mb-4 border-destructive/50", className)}>
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <AlertTitle className="text-destructive">Message Failed to Send</AlertTitle>
      <AlertDescription className="mt-2">
        {message}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3 gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}