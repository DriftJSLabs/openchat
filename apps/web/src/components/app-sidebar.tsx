/**
 * Application Sidebar Component
 * 
 * This component provides the main navigation for the OpenChat application,
 * including chat management, recent conversations, and user profile access.
 * It integrates with the chat routing system and provides quick access to all features.
 */

import { MessageSquare, User, History, Search, Settings, Archive } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import Logo from "@/components/logo"
import { RecentChatsList } from "@/components/recent-chats"
import { NewChatButton } from "@/components/new-chat-button"

/**
 * Primary navigation items for chat functionality
 */
const primaryChatItems = [
  {
    title: "All Chats",
    url: "/chat",
    icon: MessageSquare,
    description: "View all conversations",
  },
]

/**
 * Secondary navigation items for chat management
 */
const secondaryChatItems = [
  {
    title: "Search Chats",
    url: "/chat?search=true",
    icon: Search,
    description: "Search through conversations",
  },
  {
    title: "Chat History",
    url: "/chat?view=history",
    icon: History,
    description: "Browse conversation history",
  },
  {
    title: "Archived",
    url: "/chat?view=archived",
    icon: Archive,
    description: "View archived conversations",
  },
]

/**
 * Enhanced AppSidebar component with comprehensive chat navigation
 * 
 * Features:
 * - Quick access to new chat and all chats
 * - Recent conversations list with real-time updates
 * - Search and filter options
 * - User profile and settings access
 * - Responsive design with proper accessibility
 */
export function AppSidebar() {
  return (
    <Sidebar className="border-r">
      {/* Sidebar Header with Logo and Branding */}
      <SidebarHeader className="p-4">
        <Link 
          href="/" 
          className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-md p-1 -m-1"
          aria-label="OpenChat Home"
        >
          <Logo width={32} height={32} />
          <span className="text-xl font-semibold text-foreground">OpenChat</span>
        </Link>
      </SidebarHeader>

      {/* Main Sidebar Content */}
      <SidebarContent className="flex flex-col gap-0">
        
        {/* Primary Chat Actions */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* New Chat Button */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NewChatButton 
                    variant="ghost" 
                    className="w-full justify-start gap-3 font-medium h-10 px-2"
                  >
                    New Chat
                  </NewChatButton>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {/* Other primary items */}
              {primaryChatItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 w-full"
                      title={item.description}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Recent Conversations Section */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel className="px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Recent Conversations
          </SidebarGroupLabel>
          <SidebarGroupContent className="flex-1">
            <Suspense fallback={<RecentChatsLoading />}>
              <RecentChatsList />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat Management Options */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryChatItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 w-full text-sm"
                      title={item.description}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Sidebar Footer with User Actions */}
      <SidebarFooter className="border-t">
        <SidebarMenu>
          {/* User Profile */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link 
                href="/profile"
                className="flex items-center gap-3 w-full"
                title="User Profile and Settings"
              >
                <User className="h-5 w-5" />
                <span>Profile</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          {/* Settings */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link 
                href="/settings"
                className="flex items-center gap-3 w-full"
                title="Application Settings"
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Loading component for recent chats list
 * Displays skeleton placeholders while recent chats are loading
 */
function RecentChatsLoading() {
  return (
    <div className="space-y-2 px-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div 
          key={i}
          className="h-10 bg-muted/50 rounded-md animate-pulse"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}