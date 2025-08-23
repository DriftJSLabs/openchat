/**
 * Empty State Component
 * 
 * Provides empty state displays for various scenarios throughout the application.
 * Includes different variants for different contexts and proper accessibility support.
 */

import React from 'react';
import { MessageSquare, Plus, Search, Inbox, Archive, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface EmptyStateProps {
  className?: string;
  variant?: 'chat' | 'search' | 'archive' | 'error' | 'generic';
  title?: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Main empty state component with configurable variants
 * 
 * @param className - Additional CSS classes
 * @param variant - Type of empty state to display
 * @param title - Custom title text
 * @param description - Custom description text
 * @param action - Optional action button configuration
 * @param icon - Custom icon component
 */
export function EmptyState({
  className,
  variant = 'generic',
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  const config = getEmptyStateConfig(variant);
  
  const Icon = icon || config.icon;
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;
  const displayAction = action || config.action;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      "min-h-[300px]",
      className
    )}>
      {/* Icon */}
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4",
        config.iconBg
      )}>
        <Icon className={cn("h-8 w-8", config.iconColor)} />
      </div>
      
      {/* Content */}
      <div className="max-w-md space-y-2">
        <h3 className="text-lg font-medium text-foreground">
          {displayTitle}
        </h3>
        
        <p className="text-sm text-muted-foreground">
          {displayDescription}
        </p>
      </div>

      {/* Action Button */}
      {displayAction && (
        <div className="mt-6">
          {displayAction.href ? (
            <Button asChild className="gap-2">
              <Link href={displayAction.href}>
                <Plus className="h-4 w-4" />
                {displayAction.label}
              </Link>
            </Button>
          ) : (
            <Button onClick={displayAction.onClick} className="gap-2">
              <Plus className="h-4 w-4" />
              {displayAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gets configuration for different empty state variants
 */
function getEmptyStateConfig(variant: EmptyStateProps['variant']) {
  const configs = {
    chat: {
      icon: MessageSquare,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      title: 'No conversations yet',
      description: 'Start your first AI conversation to see it appear here. All your chats will be saved and organized for easy access.',
      action: {
        label: 'Start Your First Chat',
        href: '/',
      },
    },
    search: {
      icon: Search,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      title: 'No results found',
      description: 'Try adjusting your search terms or browse your recent conversations.',
      action: {
        label: 'Clear Search',
        onClick: () => window.location.reload(),
      },
    },
    archive: {
      icon: Archive,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      title: 'No archived conversations',
      description: 'Conversations you archive will appear here for easy organization.',
      action: {
        label: 'View All Chats',
        href: '/chat',
      },
    },
    error: {
      icon: AlertCircle,
      iconBg: 'bg-destructive/10',
      iconColor: 'text-destructive',
      title: 'Something went wrong',
      description: 'There was an error loading your content. Please try again.',
      action: {
        label: 'Retry',
        onClick: () => window.location.reload(),
      },
    },
    generic: {
      icon: Inbox,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      title: 'Nothing here yet',
      description: 'This area will show content when it becomes available.',
      action: undefined,
    },
  };

  return configs[variant || 'generic'];
}

/**
 * Chat-specific empty state component
 * Pre-configured for chat conversation lists
 */
export function ChatEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      variant="chat"
      className={className}
    />
  );
}

/**
 * Search-specific empty state component
 * Pre-configured for search results
 */
export function SearchEmptyState({ 
  className,
  onClearSearch,
}: { 
  className?: string;
  onClearSearch?: () => void;
}) {
  return (
    <EmptyState
      variant="search"
      className={className}
      action={onClearSearch ? {
        label: 'Clear Search',
        onClick: onClearSearch,
      } : undefined}
    />
  );
}

/**
 * Archive-specific empty state component
 * Pre-configured for archived conversations
 */
export function ArchiveEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      variant="archive"
      className={className}
    />
  );
}

/**
 * Error-specific empty state component
 * Pre-configured for error scenarios
 */
export function ErrorEmptyState({ 
  className,
  onRetry,
}: { 
  className?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      variant="error"
      className={className}
      action={onRetry ? {
        label: 'Retry',
        onClick: onRetry,
      } : undefined}
    />
  );
}

/**
 * Generic empty state component
 * Pre-configured for general empty content
 */
export function GenericEmptyState({ 
  className,
  title,
  description,
}: { 
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      variant="generic"
      className={className}
      title={title}
      description={description}
    />
  );
}