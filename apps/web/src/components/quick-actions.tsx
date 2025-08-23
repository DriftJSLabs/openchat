/**
 * Quick Actions Component
 * 
 * Provides quick access buttons for common chat operations and features.
 * Adapts to user preferences and recent activity patterns.
 */

'use client';

import { Plus, History, Search, Settings, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface QuickActionsProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'grid';
  showLabels?: boolean;
}

/**
 * Quick actions component with configurable display options
 * 
 * @param className - Additional CSS classes
 * @param variant - Display variant
 * @param showLabels - Whether to show action labels
 */
export function QuickActions({
  className,
  variant = 'default',
  showLabels = true,
}: QuickActionsProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/chat">
            <History className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/chat?search=true">
            <Search className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className={cn("grid grid-cols-2 gap-3", className)}>
        {quickActions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            showLabel={showLabels}
            size="lg"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Quick Actions</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {quickActions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            showLabel={showLabels}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual action button component
 */
interface ActionButtonProps {
  action: QuickAction;
  showLabel?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

function ActionButton({ action, showLabel = true, size = 'default' }: ActionButtonProps) {
  const buttonSize = size === 'lg' ? 'default' : size;

  return (
    <Button
      asChild
      variant={action.primary ? 'default' : 'ghost'}
      size={buttonSize}
      className={cn(
        "w-full justify-start gap-3",
        size === 'lg' && "h-12 p-4",
        !showLabel && "justify-center"
      )}
    >
      <Link href={action.href} title={action.description}>
        <action.icon className={cn(
          "flex-shrink-0",
          size === 'lg' ? "h-5 w-5" : "h-4 w-4"
        )} />
        {showLabel && (
          <div className="flex-1 text-left">
            <div className="font-medium">{action.label}</div>
            {size === 'lg' && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {action.description}
              </div>
            )}
          </div>
        )}
      </Link>
    </Button>
  );
}

/**
 * Quick action definition interface
 */
interface QuickAction {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  keyboard?: string;
}

/**
 * Available quick actions
 */
const quickActions: QuickAction[] = [
  {
    id: 'new-chat',
    label: 'New Chat',
    description: 'Start a fresh AI conversation',
    href: '/',
    icon: Plus,
    primary: true,
    keyboard: 'Ctrl+N',
  },
  {
    id: 'chat-history',
    label: 'Chat History',
    description: 'Browse your past conversations',
    href: '/chat',
    icon: History,
    keyboard: 'Ctrl+H',
  },
  {
    id: 'search-chats',
    label: 'Search Chats',
    description: 'Find specific conversations or messages',
    href: '/chat?search=true',
    icon: Search,
    keyboard: 'Ctrl+K',
  },
  {
    id: 'export-chats',
    label: 'Export Data',
    description: 'Download your chat conversations',
    href: '/settings/export',
    icon: Download,
  },
  {
    id: 'share-chat',
    label: 'Share Chat',
    description: 'Share a conversation with others',
    href: '/chat/share',
    icon: Share,
  },
];

/**
 * Featured actions component
 * Highlights the most important or frequently used actions
 */
export function FeaturedActions({ className }: { className?: string }) {
  const featuredActions = quickActions.filter(action => action.primary);

  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-sm font-medium text-foreground">Featured</h3>
      <div className="grid gap-2">
        {featuredActions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            size="lg"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Keyboard shortcuts display component
 * Shows available keyboard shortcuts for quick actions
 */
export function KeyboardShortcuts({ className }: { className?: string }) {
  const actionsWithShortcuts = quickActions.filter(action => action.keyboard);

  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-sm font-medium text-foreground">Keyboard Shortcuts</h3>
      <div className="space-y-1">
        {actionsWithShortcuts.map((action) => (
          <div
            key={action.id}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-muted-foreground">{action.label}</span>
            <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">
              {action.keyboard}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}