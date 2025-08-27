"use client";

import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import Providers from './providers';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import UserMenu from '@/components/user-menu';
import { DatabaseInitializationStatus } from './database-initialization-status';
import { SyncStatusIndicator } from './sync-status-indicator';

interface AuthenticatedAppProps {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}

export function AuthenticatedApp({ children, defaultSidebarOpen = false }: AuthenticatedAppProps) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['auth-session'],
    queryFn: () => authClient.getSession(),
    refetchInterval: 5 * 60 * 1000, // Check session every 5 minutes
    staleTime: 4 * 60 * 1000, // Consider data stale after 4 minutes
  });

  const user = session?.user || null;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Providers userId={user?.id}>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <div className="flex h-full w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-h-0">
            <header className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                {user && <DatabaseInitializationStatus />}
                {user && <SyncStatusIndicator userId={user.id} />}
                <UserMenu />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </Providers>
  );
}