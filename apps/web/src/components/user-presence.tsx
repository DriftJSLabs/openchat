'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { 
  Circle,
  Clock,
  Moon,
  Phone,
  Smartphone,
  Monitor,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { User } from '@/lib/db/schema/shared';

/**
 * User presence status types
 */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * Device type for presence
 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

/**
 * User presence data interface
 */
export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: Date;
  isTyping?: boolean;
  currentDevice?: DeviceType;
  customMessage?: string;
  onlineDevices: DeviceType[];
}

/**
 * Props for the UserPresenceIndicator component
 */
export interface UserPresenceIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  /** User information */
  user: Pick<User, 'id' | 'name' | 'image' | 'email'>;
  /** User presence data */
  presence: UserPresence;
  /** Size of the indicator */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show the user's avatar */
  showAvatar?: boolean;
  /** Whether to show the user's name */
  showName?: boolean;
  /** Whether to show detailed status on hover */
  showDetails?: boolean;
  /** Whether to show typing indicator */
  showTyping?: boolean;
  /** Custom status text */
  customStatus?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Individual user presence indicator component that shows online status,
 * last seen time, device information, and typing status.
 * 
 * Features:
 * - Real-time presence status with color-coded indicators
 * - Device type detection and display
 * - Last seen timestamp with human-readable format
 * - Typing indicator animation
 * - Hover cards with detailed status information
 * - Support for custom status messages
 * - Responsive design for different sizes
 * - Accessibility compliant with proper ARIA labels
 */
export function UserPresenceIndicator({
  className,
  user,
  presence,
  size = 'md',
  showAvatar = true,
  showName = true,
  showDetails = true,
  showTyping = true,
  customStatus,
  onClick,
  ...props
}: UserPresenceIndicatorProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for accurate "last seen" display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  /**
   * Get the appropriate status color
   */
  const getStatusColor = useCallback((status: PresenceStatus): string => {
    switch (status) {
      case 'online':
        return 'text-green-500 bg-green-500';
      case 'away':
        return 'text-yellow-500 bg-yellow-500';
      case 'busy':
        return 'text-red-500 bg-red-500';
      case 'offline':
      default:
        return 'text-gray-500 bg-gray-500';
    }
  }, []);

  /**
   * Get device icon
   */
  const getDeviceIcon = useCallback((device: DeviceType) => {
    switch (device) {
      case 'desktop':
        return Monitor;
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Smartphone; // We'll use phone icon for tablet too
      default:
        return Monitor;
    }
  }, []);

  /**
   * Format last seen time
   */
  const formatLastSeen = useCallback((lastSeen: Date, current: Date): string => {
    const diffInMinutes = Math.floor((current.getTime() - lastSeen.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) { // 24 hours
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return lastSeen.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        year: lastSeen.getFullYear() !== current.getFullYear() ? 'numeric' : undefined
      });
    }
  }, []);

  /**
   * Get status text
   */
  const getStatusText = useCallback((status: PresenceStatus): string => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'away':
        return 'Away';
      case 'busy':
        return 'Busy';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  }, []);

  /**
   * Size configurations
   */
  const sizeConfig = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          avatar: 'h-6 w-6',
          indicator: 'h-2 w-2',
          text: 'text-xs',
          gap: 'gap-2',
        };
      case 'lg':
        return {
          avatar: 'h-12 w-12',
          indicator: 'h-4 w-4',
          text: 'text-base',
          gap: 'gap-4',
        };
      case 'md':
      default:
        return {
          avatar: 'h-8 w-8',
          indicator: 'h-3 w-3',
          text: 'text-sm',
          gap: 'gap-3',
        };
    }
  }, [size]);

  const statusColor = getStatusColor(presence.status);
  const statusText = getStatusText(presence.status);
  const lastSeenText = presence.status === 'online' 
    ? 'Online now' 
    : `Last seen ${formatLastSeen(presence.lastSeen, currentTime)}`;

  const component = (
    <div
      className={cn(
        'flex items-center',
        sizeConfig.gap,
        onClick && 'cursor-pointer hover:bg-accent/50 rounded-lg p-2 transition-colors',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {/* Avatar with status indicator */}
      {showAvatar && (
        <div className="relative">
          <Avatar className={sizeConfig.avatar}>
            <AvatarImage src={user.image || undefined} alt={user.name} />
            <AvatarFallback className={sizeConfig.text}>
              {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Status indicator */}
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background',
              sizeConfig.indicator,
              statusColor
            )}
            aria-label={`${user.name} is ${statusText.toLowerCase()}`}
          />
        </div>
      )}

      {/* User info */}
      {(showName || showTyping) && (
        <div className="flex-1 min-w-0">
          {showName && (
            <div className={cn('font-medium truncate', sizeConfig.text)}>
              {user.name}
            </div>
          )}
          
          {/* Status or typing indicator */}
          {showTyping && presence.isTyping ? (
            <div className={cn('flex items-center gap-1 text-muted-foreground', sizeConfig.text)}>
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
              </div>
              <span>typing...</span>
            </div>
          ) : (
            <div className={cn('text-muted-foreground truncate', sizeConfig.text)}>
              {customStatus || presence.customMessage || statusText}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Wrap with hover card for detailed info
  if (showDetails) {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          {component}
        </HoverCardTrigger>
        <HoverCardContent className="w-80" align="start">
          <div className="space-y-3">
            {/* User header */}
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback>
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-semibold">{user.name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
              <div className={cn('h-3 w-3 rounded-full', statusColor)} />
            </div>

            {/* Status details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <div className={cn('h-2 w-2 rounded-full', statusColor)} />
                  {statusText}
                </Badge>
              </div>

              {/* Custom message */}
              {presence.customMessage && (
                <div className="text-sm text-muted-foreground">
                  "{presence.customMessage}"
                </div>
              )}

              {/* Last seen */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last seen</span>
                <span>{lastSeenText}</span>
              </div>

              {/* Active devices */}
              {presence.onlineDevices.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm font-medium">Active on</span>
                  <div className="flex gap-2">
                    {presence.onlineDevices.map((device, index) => {
                      const DeviceIcon = getDeviceIcon(device);
                      return (
                        <Tooltip key={index}>
                          <TooltipTrigger asChild>
                            <div className="p-1.5 bg-muted rounded">
                              <DeviceIcon className="h-3 w-3" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {device.charAt(0).toUpperCase() + device.slice(1)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return component;
}

/**
 * Props for the UserPresenceList component
 */
export interface UserPresenceListProps extends HTMLAttributes<HTMLDivElement> {
  /** List of users with their presence data */
  users: Array<{
    user: Pick<User, 'id' | 'name' | 'image' | 'email'>;
    presence: UserPresence;
  }>;
  /** Maximum number of users to show */
  maxUsers?: number;
  /** Size of the indicators */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show avatars */
  showAvatars?: boolean;
  /** Whether to show names */
  showNames?: boolean;
  /** Whether to show only online users */
  onlineOnly?: boolean;
  /** Sort order for users */
  sortBy?: 'name' | 'status' | 'lastSeen';
  /** Click handler for individual users */
  onUserClick?: (userId: string) => void;
}

/**
 * List component for displaying multiple user presence indicators.
 * Useful for showing team members, chat participants, or online users.
 */
export function UserPresenceList({
  className,
  users,
  maxUsers = 10,
  size = 'md',
  showAvatars = true,
  showNames = true,
  onlineOnly = false,
  sortBy = 'status',
  onUserClick,
  ...props
}: UserPresenceListProps) {
  const sortedAndFilteredUsers = useMemo(() => {
    let filteredUsers = onlineOnly 
      ? users.filter(({ presence }) => presence.status === 'online')
      : users;

    // Sort users
    filteredUsers.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.user.name.localeCompare(b.user.name);
        case 'status':
          // Online first, then by name
          if (a.presence.status !== b.presence.status) {
            const statusOrder: Record<PresenceStatus, number> = {
              online: 0,
              away: 1,
              busy: 2,
              offline: 3,
            };
            return statusOrder[a.presence.status] - statusOrder[b.presence.status];
          }
          return a.user.name.localeCompare(b.user.name);
        case 'lastSeen':
          return b.presence.lastSeen.getTime() - a.presence.lastSeen.getTime();
        default:
          return 0;
      }
    });

    return filteredUsers.slice(0, maxUsers);
  }, [users, onlineOnly, sortBy, maxUsers]);

  const remainingCount = users.length - sortedAndFilteredUsers.length;

  return (
    <TooltipProvider>
      <div className={cn('space-y-1', className)} {...props}>
        {sortedAndFilteredUsers.map(({ user, presence }) => (
          <UserPresenceIndicator
            key={user.id}
            user={user}
            presence={presence}
            size={size}
            showAvatar={showAvatars}
            showName={showNames}
            onClick={onUserClick ? () => onUserClick(user.id) : undefined}
          />
        ))}
        
        {/* Show remaining count if there are more users */}
        {remainingCount > 0 && (
          <div className="text-xs text-muted-foreground px-2 py-1">
            +{remainingCount} more {remainingCount === 1 ? 'user' : 'users'}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * Compact presence indicator that shows just the status dot and count
 */
export interface PresenceSummaryProps extends HTMLAttributes<HTMLDivElement> {
  /** Array of user presence data */
  presences: UserPresence[];
  /** Whether to show detailed counts on hover */
  showDetails?: boolean;
}

export function PresenceSummary({
  className,
  presences,
  showDetails = true,
  ...props
}: PresenceSummaryProps) {
  const statusCounts = useMemo(() => {
    const counts = {
      online: 0,
      away: 0,
      busy: 0,
      offline: 0,
    };

    presences.forEach(presence => {
      counts[presence.status]++;
    });

    return counts;
  }, [presences]);

  const totalOnline = statusCounts.online + statusCounts.away + statusCounts.busy;

  const summaryComponent = (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        showDetails && 'cursor-help',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1">
        <div className="h-2 w-2 bg-green-500 rounded-full" />
        <span>{totalOnline}</span>
      </div>
      <span className="text-muted-foreground">online</span>
    </div>
  );

  if (showDetails && totalOnline > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {summaryComponent}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            {statusCounts.online > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span>{statusCounts.online} online</span>
              </div>
            )}
            {statusCounts.away > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span>{statusCounts.away} away</span>
              </div>
            )}
            {statusCounts.busy > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-red-500 rounded-full" />
                <span>{statusCounts.busy} busy</span>
              </div>
            )}
            {statusCounts.offline > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-gray-500 rounded-full" />
                <span>{statusCounts.offline} offline</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return summaryComponent;
}

/**
 * Hook for managing user presence state
 */
export function useUserPresence(userId: string, initialStatus: PresenceStatus = 'online') {
  const [presence, setPresence] = useState<UserPresence>({
    userId,
    status: initialStatus,
    lastSeen: new Date(),
    isTyping: false,
    currentDevice: 'desktop' as DeviceType,
    onlineDevices: ['desktop'],
  });

  const updateStatus = useCallback((newStatus: PresenceStatus) => {
    setPresence(prev => ({
      ...prev,
      status: newStatus,
      lastSeen: newStatus === 'offline' ? new Date() : prev.lastSeen,
    }));
  }, []);

  const setTyping = useCallback((isTyping: boolean) => {
    setPresence(prev => ({
      ...prev,
      isTyping,
    }));
  }, []);

  const setCustomMessage = useCallback((message: string | undefined) => {
    setPresence(prev => ({
      ...prev,
      customMessage: message,
    }));
  }, []);

  const updateLastSeen = useCallback(() => {
    setPresence(prev => ({
      ...prev,
      lastSeen: new Date(),
    }));
  }, []);

  return {
    presence,
    updateStatus,
    setTyping,
    setCustomMessage,
    updateLastSeen,
  };
}