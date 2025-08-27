/**
 * Comprehensive Sync Status Panel and Error Messaging Components
 * Provides detailed sync status information, error reporting, and recovery options
 * for the TanStack DB integration in OpenChat.
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Database,
  Zap,
  Eye,
  EyeOff,
  Settings,
  Download,
  Upload,
  Activity,
  HelpCircle
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useSyncData } from '@/hooks/queries/use-sync-status';
import { cn } from '@/lib/utils';

import type {
  GlobalSyncState,
  EntitySyncState,
  OfflineQueueItem,
  DataConflict,
  DatabaseConnectionStatus,
  SyncStatus,
  MessageQueuePriority
} from '@/lib/types/tanstack-db.types';

/**
 * Mini sync status indicator for header/toolbar
 */
interface MiniSyncStatusProps {
  className?: string;
  onClick?: () => void;
  showDetails?: boolean;
}

export function MiniSyncStatus({ className, onClick, showDetails = false }: MiniSyncStatusProps) {
  const [syncState, setSyncState] = useState<GlobalSyncState>({
    status: SyncStatus.IDLE,
    connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
    pendingOperations: 0,
    lastSyncAt: null,
    error: null,
    nextSyncIn: null,
    isOffline: false,
  });

  useEffect(() => {
    const updateSyncState = (state: GlobalSyncState) => {
      setSyncState(state);
    };

    // Subscribe to sync state updates
    offlineManager.getSyncStateManager().on('global-state-updated', updateSyncState);
    
    return () => {
      offlineManager.getSyncStateManager().off('global-state-updated', updateSyncState);
    };
  }, []);

  const getStatusIcon = () => {
    if (syncState.isOffline) {
      return <WifiOff className="h-4 w-4 text-orange-500" />;
    }

    switch (syncState.status) {
      case SyncStatus.SYNCING:
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case SyncStatus.SUCCESS:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case SyncStatus.ERROR:
        return <XCircle className="h-4 w-4 text-red-500" />;
      case SyncStatus.CONFLICT:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Wifi className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    if (syncState.isOffline) return 'Offline';
    
    switch (syncState.status) {
      case SyncStatus.SYNCING:
        return syncState.pendingOperations > 0 
          ? `Syncing ${syncState.pendingOperations}` 
          : 'Syncing';
      case SyncStatus.SUCCESS:
        return 'Synced';
      case SyncStatus.ERROR:
        return 'Sync Error';
      case SyncStatus.CONFLICT:
        return 'Conflicts';
      default:
        return 'Connected';
    }
  };

  const hasIssues = syncState.isOffline || syncState.status === SyncStatus.ERROR || syncState.status === SyncStatus.CONFLICT;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className={cn(
              'flex items-center gap-2 px-2 py-1 h-8',
              hasIssues && 'text-orange-600 dark:text-orange-400',
              className
            )}
          >
            {getStatusIcon()}
            {showDetails && (
              <>
                <span className="text-xs font-medium">{getStatusText()}</span>
                {syncState.pendingOperations > 0 && (
                  <Badge variant="secondary" className="text-xs px-1 py-0">
                    {syncState.pendingOperations}
                  </Badge>
                )}
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-sm">
            <div className="font-medium">{getStatusText()}</div>
            {syncState.isOffline && (
              <div className="text-muted-foreground">
                Changes will sync when online
              </div>
            )}
            {syncState.error && (
              <div className="text-red-500 text-xs">
                {syncState.error}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Detailed sync status panel
 */
interface SyncStatusPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export function SyncStatusPanel({ isOpen = false, onClose, className }: SyncStatusPanelProps) {
  const [syncState, setSyncState] = useState<GlobalSyncState>({
    status: SyncStatus.IDLE,
    connectionStatus: DatabaseConnectionStatus.DISCONNECTED,
    pendingOperations: 0,
    lastSyncAt: null,
    error: null,
    nextSyncIn: null,
    isOffline: false,
  });

  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [conflicts, setConflicts] = useState<DataConflict[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    connection: true,
    queue: false,
    conflicts: false,
    diagnostics: false,
  });

  useEffect(() => {
    const updateSyncState = (state: GlobalSyncState) => {
      setSyncState(state);
    };

    const updateQueueItems = () => {
      const status = offlineManager.getOfflineQueue().getStats();
      setQueueItems(status.items || []);
    };

    const updateConflicts = () => {
      const activeConflicts = conflictResolution.getActiveConflicts();
      setConflicts(activeConflicts);
    };

    // Subscribe to updates
    offlineManager.getSyncStateManager().on('global-state-updated', updateSyncState);
    offlineManager.getOfflineQueue().on('item-added', updateQueueItems);
    offlineManager.getOfflineQueue().on('item-removed', updateQueueItems);
    conflictResolution.on('conflict-detected', updateConflicts);
    conflictResolution.on('conflict-resolved', updateConflicts);

    // Initial load
    updateQueueItems();
    updateConflicts();

    return () => {
      offlineManager.getSyncStateManager().off('global-state-updated', updateSyncState);
      offlineManager.getOfflineQueue().off('item-added', updateQueueItems);
      offlineManager.getOfflineQueue().off('item-removed', updateQueueItems);
      conflictResolution.off('conflict-detected', updateConflicts);
      conflictResolution.off('conflict-resolved', updateConflicts);
    };
  }, []);

  const handleRetrySync = useCallback(async () => {
    try {
      await offlineManager.processQueue();
    } catch (error) {
      console.error('Failed to retry sync:', error);
    }
  }, []);

  const handleResolveConflict = useCallback(async (conflictId: string) => {
    try {
      await conflictResolution.resolveConflict(conflictId);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  }, []);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getPriorityColor = (priority: MessageQueuePriority) => {
    switch (priority) {
      case 4: return 'bg-red-500'; // CRITICAL
      case 3: return 'bg-orange-500'; // HIGH
      case 2: return 'bg-blue-500'; // NORMAL
      case 1: return 'bg-gray-500'; // LOW
      default: return 'bg-gray-400';
    }
  };

  const getConnectionStatusColor = () => {
    if (syncState.isOffline) return 'text-orange-600';
    
    switch (syncState.connectionStatus) {
      case DatabaseConnectionStatus.CONNECTED:
        return 'text-green-600';
      case DatabaseConnectionStatus.CONNECTING:
        return 'text-blue-600';
      case DatabaseConnectionStatus.ERROR:
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'fixed inset-y-0 right-0 w-96 bg-background border-l shadow-lg z-50',
      'flex flex-col',
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Sync Status
        </h2>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <EyeOff className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Connection Status */}
          <Collapsible
            open={expandedSections.connection}
            onOpenChange={() => toggleSection('connection')}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span className="font-medium">Connection Status</span>
                </div>
                <div className={cn('text-sm', getConnectionStatusColor())}>
                  {syncState.isOffline ? 'Offline' : syncState.connectionStatus}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Network</div>
                  <div className="flex items-center gap-1">
                    {syncState.isOffline ? (
                      <WifiOff className="h-3 w-3 text-orange-500" />
                    ) : (
                      <Wifi className="h-3 w-3 text-green-500" />
                    )}
                    {syncState.isOffline ? 'Offline' : 'Online'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Last Sync</div>
                  <div>
                    {syncState.lastSyncAt 
                      ? new Date(syncState.lastSyncAt).toLocaleTimeString()
                      : 'Never'
                    }
                  </div>
                </div>
              </div>

              {syncState.error && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Sync Error</AlertTitle>
                  <AlertDescription className="mt-1">
                    {syncState.error}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleRetrySync}
                      className="mt-2"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Pending Operations Queue */}
          <Collapsible
            open={expandedSections.queue}
            onOpenChange={() => toggleSection('queue')}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span className="font-medium">Pending Operations</span>
                </div>
                <Badge variant="secondary">
                  {queueItems.length}
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-3">
              {queueItems.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  No pending operations
                </div>
              ) : (
                <div className="space-y-2">
                  {queueItems.slice(0, 5).map((item) => (
                    <Card key={item.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className={cn('w-2 h-2 rounded-full', getPriorityColor(item.priority))}
                          />
                          <div className="text-sm">
                            <div className="font-medium">{item.operation}</div>
                            <div className="text-muted-foreground text-xs">
                              {item.entityType}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.retries > 0 && (
                            <div>Retry {item.retries}</div>
                          )}
                          <div>
                            {new Date(item.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      {item.error && (
                        <div className="mt-2 text-xs text-red-500">
                          {item.error}
                        </div>
                      )}
                    </Card>
                  ))}
                  
                  {queueItems.length > 5 && (
                    <div className="text-center text-muted-foreground text-sm">
                      +{queueItems.length - 5} more operations
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Conflicts */}
          <Collapsible
            open={expandedSections.conflicts}
            onOpenChange={() => toggleSection('conflicts')}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Conflicts</span>
                </div>
                <Badge variant={conflicts.length > 0 ? 'destructive' : 'secondary'}>
                  {conflicts.length}
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-3">
              {conflicts.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  No conflicts detected
                </div>
              ) : (
                <div className="space-y-2">
                  {conflicts.map((conflict) => (
                    <Card key={conflict.conflictId} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">
                            {conflict.entityType} Conflict
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(conflict.detectedAt).toLocaleTimeString()}
                          </div>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          Conflicting fields: {conflict.conflictingFields.join(', ')}
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolveConflict(conflict.conflictId)}
                            className="text-xs h-6"
                          >
                            Auto Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-6"
                          >
                            Manual Review
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Diagnostics */}
          <Collapsible
            open={expandedSections.diagnostics}
            onOpenChange={() => toggleSection('diagnostics')}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium">Diagnostics</span>
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Browser</div>
                  <div className="text-xs">
                    {navigator.onLine ? 'Online' : 'Offline'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Storage</div>
                  <div className="text-xs">Available</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs">
                  <Download className="h-3 w-3 mr-1" />
                  Export Data
                </Button>
                <Button size="sm" variant="outline" className="text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Force Sync
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Error notification toast component
 */
interface ErrorNotificationProps {
  error: {
    title: string;
    message: string;
    code?: string;
    retryable?: boolean;
  };
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorNotification({ error, onRetry, onDismiss }: ErrorNotificationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.95 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-4 max-w-sm"
    >
      <div className="flex items-start gap-3">
        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{error.title}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {error.message}
          </div>
          {error.code && (
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              Code: {error.code}
            </div>
          )}
        </div>
      </div>
      
      {(error.retryable || onDismiss) && (
        <div className="flex justify-end gap-2 mt-3">
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
          {error.retryable && onRetry && (
            <Button size="sm" onClick={onRetry}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Sync progress indicator
 */
interface SyncProgressProps {
  progress: number;
  total: number;
  message?: string;
  className?: string;
}

export function SyncProgress({ progress, total, message, className }: SyncProgressProps) {
  const percentage = total > 0 ? (progress / total) * 100 : 0;

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span>{message || 'Syncing...'}</span>
        <span className="text-muted-foreground">
          {progress}/{total}
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}