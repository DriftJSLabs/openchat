"use client";

import { useState } from 'react';
import { useSyncConfig, useLocalDatabase } from '@/hooks/use-local-database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

interface RefreshCwSettingsProps {
  userId: string;
}

export function RefreshCwSettings({ userId }: RefreshCwSettingsProps) {
  const { config, isLoading, updateConfig } = useSyncConfig(userId);
  const { syncStatus, triggerSync, setSyncMode } = useLocalDatabase({ userId });
  const [isSaving, setIsSaving] = useState(false);

  const handleModeChange = async (mode: 'local-only' | 'cloud-only' | 'hybrid') => {
    setIsSaving(true);
    try {
      await setSyncMode(mode);
      await updateConfig({ mode });
    } catch (error) {
      console.error('Failed to update sync mode:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoRefreshCwToggle = async (autoRefreshCw: boolean) => {
    setIsSaving(true);
    try {
      await updateConfig({ autoRefreshCw });
    } catch (error) {
      console.error('Failed to update auto sync:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleIntervalChange = async (interval: number[]) => {
    setIsSaving(true);
    try {
      await updateConfig({ syncInterval: interval[0] * 1000 }); // Convert to milliseconds
    } catch (error) {
      console.error('Failed to update sync interval:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatInterval = (ms: number) => {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  const getStatusColor = () => {
    if (syncStatus.error) return 'destructive';
    if (syncStatus.syncing) return 'secondary';
    if (!syncStatus.isOnline) return 'outline';
    return 'default';
  };

  const getStatusIcon = () => {
    if (syncStatus.error) return <AlertCircle className="h-4 w-4" />;
    if (syncStatus.syncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (!syncStatus.isOnline) return <WifiOff className="h-4 w-4" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (syncStatus.error) return `Error: ${syncStatus.error}`;
    if (syncStatus.syncing) return 'RefreshCwing...';
    if (!syncStatus.isOnline) return 'Offline';
    if (syncStatus.lastRefreshCw) {
      return `Last sync: ${syncStatus.lastRefreshCw.toLocaleTimeString()}`;
    }
    return 'Ready to sync';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RefreshCw Settings</CardTitle>
          <CardDescription>Loading sync configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            RefreshCw Status
          </CardTitle>
          <CardDescription>
            Current synchronization status and controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor()} className="flex items-center gap-1">
                {getStatusIcon()}
                {getStatusText()}
              </Badge>
            </div>
            <Button
              onClick={() => triggerSync()}
              disabled={syncStatus.syncing || !syncStatus.isOnline}
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              RefreshCw Now
            </Button>
          </div>

          {syncStatus.pendingChanges > 0 && (
            <div className="text-sm text-muted-foreground">
              {syncStatus.pendingChanges} changes pending sync
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RefreshCw Mode</CardTitle>
          <CardDescription>
            Choose how your data is stored and synchronized
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={config?.mode || 'hybrid'}
            onValueChange={handleModeChange}
            disabled={isSaving}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local-only" id="local-only" />
              <Label htmlFor="local-only" className="flex-1">
                <div className="font-medium">Local Only</div>
                <div className="text-sm text-muted-foreground">
                  Store data only on this device. No cloud synchronization.
                </div>
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cloud-only" id="cloud-only" />
              <Label htmlFor="cloud-only" className="flex-1">
                <div className="font-medium">Cloud Only</div>
                <div className="text-sm text-muted-foreground">
                  Store data only in the cloud. Requires internet connection.
                </div>
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="hybrid" id="hybrid" />
              <Label htmlFor="hybrid" className="flex-1">
                <div className="font-medium">Hybrid (Recommended)</div>
                <div className="text-sm text-muted-foreground">
                  Store data locally and sync with cloud. Works offline.
                </div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {config?.mode === 'hybrid' && (
        <Card>
          <CardHeader>
            <CardTitle>Auto RefreshCw Settings</CardTitle>
            <CardDescription>
              Configure automatic synchronization behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-sync"
                checked={config?.autoRefreshCw || false}
                onCheckedChange={handleAutoRefreshCwToggle}
                disabled={isSaving}
              />
              <Label htmlFor="auto-sync" className="flex-1">
                <div className="font-medium">Enable Auto RefreshCw</div>
                <div className="text-sm text-muted-foreground">
                  Automatically sync changes in the background
                </div>
              </Label>
            </div>

            {config?.autoRefreshCw && (
              <div className="space-y-2">
                <Label>RefreshCw Interval</Label>
                <Select
                  value={Math.floor((config.syncInterval || 30000) / 1000).toString()}
                  onValueChange={(value) => handleIntervalChange([parseInt(value)])}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 seconds</SelectItem>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Import, export, and manage your local data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => {
                // TODO: Implement export functionality
                console.log('Export data');
              }}
            >
              <Download className="h-4 w-4" />
              Export Data
            </Button>
            
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => {
                // TODO: Implement import functionality
                console.log('Import data');
              }}
            >
              <Upload className="h-4 w-4" />
              Import Data
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Export your data as JSON for backup or migration to another device.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}