"use client";

import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { LocalChatExample } from '@/components/local-chat-example';
import { useDatabaseContext } from '@/components/database-provider';
import { RefreshCwSettings as SyncSettings } from '@/components/sync-settings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AIPage() {
  const { isInitialized, initializationError } = useDatabaseContext();
  
  const { data: session } = useQuery({
    queryKey: ['auth-session'],
    queryFn: () => authClient.getSession(),
    refetchInterval: 5 * 60 * 1000, // Check session every 5 minutes
    staleTime: 4 * 60 * 1000, // Consider data stale after 4 minutes
  });

  const user = session?.user || null;

  if (!user) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Welcome to OpenChat</h1>
          <p className="text-muted-foreground mb-4">
            Please sign in to start chatting with the AI assistant.
          </p>
        </div>
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-destructive">Database Error</h1>
          <p className="text-muted-foreground mb-4">
            Failed to initialize local database: {initializationError}
          </p>
          <p className="text-sm text-muted-foreground">
            Please refresh the page or check your browser settings.
          </p>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold mb-2">Initializing Local Database</h1>
          <p className="text-muted-foreground">
            Setting up your local-first chat experience...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-6">
      <div className="max-w-7xl mx-auto h-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">AI Assistant</h1>
          <p className="text-muted-foreground">
            Your local-first chat experience with cloud synchronization.
          </p>
        </div>

        <Tabs defaultValue="chat" className="h-[calc(100%-120px)]">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="settings">Sync Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="chat" className="h-full mt-6">
            <LocalChatExample userId={user.id} />
          </TabsContent>
          
          <TabsContent value="settings" className="mt-6">
            <div className="max-w-4xl">
              <SyncSettings userId={user.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}