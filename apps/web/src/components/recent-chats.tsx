/**
 * Recent Chats Component
 * 
 * Displays a list of recent chat conversations with previews,
 * timestamps, and quick access functionality.
 */

'use client';

import { useState } from 'react';
import { MessageSquare, Clock, MoreHorizontal, Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatChatDate } from '@/lib/chat-utils';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RecentChatsProps {
  className?: string;
  limit?: number;
  showEmpty?: boolean;
}

/**
 * Recent chats component with conversation management
 * 
 * @param className - Additional CSS classes
 * @param limit - Maximum number of chats to display
 * @param showEmpty - Whether to show empty state
 */
export function RecentChats({
  className,
  limit = 8,
  showEmpty = true,
}: RecentChatsProps) {
  const [conversations, setConversations] = useState(mockConversations);

  const handleArchive = (id: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === id ? { ...conv, isArchived: true } : conv
      )
    );
  };

  const handleDelete = (id: string) => {
    setConversations(prev => prev.filter(conv => conv.id !== id));
  };

  const activeConversations = conversations
    .filter(conv => !conv.isArchived)
    .slice(0, limit);

  if (activeConversations.length === 0 && showEmpty) {
    return (
      <div className={cn("p-4", className)}>
        <EmptyRecentChats />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Recent Chats</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/chat" className="text-xs text-muted-foreground hover:text-foreground">
            View All
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        {activeConversations.map((conversation) => (
          <RecentChatItem
            key={conversation.id}
            conversation={conversation}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual recent chat item component
 */
interface RecentChatItemProps {
  conversation: Conversation;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function RecentChatItem({ conversation, onArchive, onDelete }: RecentChatItemProps) {
  return (
    <div className="group relative">
      <Link
        href={`/chat/${conversation.id}`}
        className="block px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-sm font-medium text-foreground truncate">
                {conversation.title}
              </h4>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatChatDate(conversation.updatedAt)}
              </span>
            </div>
            
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {conversation.lastMessage}
            </p>
            
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{conversation.messageCount} messages</span>
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Actions Menu */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onArchive(conversation.id)}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(conversation.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Empty state component for when no recent chats exist
 */
function EmptyRecentChats() {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      
      <div>
        <h4 className="text-sm font-medium text-foreground mb-1">
          No recent chats
        </h4>
        <p className="text-xs text-muted-foreground">
          Start a conversation to see it here
        </p>
      </div>
      
      <Button asChild size="sm" className="mt-3">
        <Link href="/">
          Start Chatting
        </Link>
      </Button>
    </div>
  );
}

/**
 * Recent chats list component for sidebar
 * Simplified version for use in the app sidebar
 */
export function RecentChatsList({ className }: { className?: string }) {
  const recentChats = mockConversations
    .filter(conv => !conv.isArchived)
    .slice(0, 5);

  if (recentChats.length === 0) {
    return (
      <div className={cn("px-2 py-4 text-center", className)}>
        <p className="text-xs text-muted-foreground">No recent chats</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 px-2", className)}>
      {recentChats.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/chat/${conversation.id}`}
          className="block p-2 rounded-md hover:bg-muted/50 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {conversation.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {formatChatDate(conversation.updatedAt)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/**
 * Conversation interface for type safety
 */
interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: Date;
  isArchived: boolean;
}

/**
 * Mock conversation data for development
 * In production, this would come from your database
 */
const mockConversations: Conversation[] = [
  {
    id: 'chat_1629394800000_abc123',
    title: 'React Component Help',
    lastMessage: 'How do I create a reusable button component with TypeScript?',
    messageCount: 12,
    updatedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    isArchived: false,
  },
  {
    id: 'chat_1629394700000_def456',
    title: 'Database Design Questions',
    lastMessage: 'What are the best practices for PostgreSQL indexing?',
    messageCount: 8,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isArchived: false,
  },
  {
    id: 'chat_1629394600000_ghi789',
    title: 'API Integration Guide',
    lastMessage: 'Can you help me implement OAuth2 authentication?',
    messageCount: 15,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isArchived: false,
  },
  {
    id: 'chat_1629394500000_jkl012',
    title: 'CSS Grid Layout',
    lastMessage: 'How do I create a responsive grid with CSS Grid?',
    messageCount: 6,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    isArchived: false,
  },
  {
    id: 'chat_1629394400000_mno345',
    title: 'Node.js Performance',
    lastMessage: 'What are the common Node.js performance bottlenecks?',
    messageCount: 20,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    isArchived: false,
  },
];