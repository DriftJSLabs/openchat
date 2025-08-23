/**
 * Chat Listing and Overview Page
 * 
 * This page displays all chat conversations in a organized list format,
 * allowing users to browse, search, and manage their chat history.
 * It serves as the main hub for accessing existing conversations and creating new ones.
 */

import { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, Search, MessageSquare, Clock, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatListLoading } from '@/components/chat-loading';
import { EmptyState } from '@/components/empty-state';
import { SearchableInput } from '@/components/searchable-input';

/**
 * Page metadata for SEO optimization
 */
export const metadata: Metadata = {
  title: 'Chats - OpenChat',
  description: 'View and manage all your AI chat conversations in OpenChat.',
  keywords: ['chat', 'conversations', 'AI', 'messaging', 'history'],
};

/**
 * Main chat listing page component
 * 
 * Features:
 * - List of all chat conversations
 * - Search and filter functionality
 * - Quick actions (new chat, archive, delete)
 * - Responsive grid/list layout
 * - Loading and empty states
 * - Recent conversations prioritization
 */
export default function ChatListPage() {
  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Page Header */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Your Chats
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and browse your AI conversation history
              </p>
            </div>
            
            {/* Primary Actions */}
            <div className="flex items-center gap-3">
              <Button asChild className="gap-2">
                <Link href="/">
                  <Plus className="h-4 w-4" />
                  New Chat
                </Link>
              </Button>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <SearchableInput
                placeholder="Search conversations..."
                className="pl-10"
              />
            </div>
            
            {/* Filter Options */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Clock className="h-4 w-4" />
                Recent
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Archive className="h-4 w-4" />
                Archived
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <Suspense fallback={<ChatListLoading />}>
            <ChatConversationList />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/**
 * Chat conversation list component with data fetching
 * This component handles the display of chat conversations with proper loading states
 */
async function ChatConversationList() {
  // In a real implementation, this would fetch conversations from your database
  // const conversations = await getConversations();
  
  // For now, we'll simulate different states
  const hasConversations = false; // This would be determined by actual data
  
  if (!hasConversations) {
    return <EmptyState />;
  }

  // This would render the actual conversation list
  return (
    <div className="space-y-4">
      {/* Conversation items would be rendered here */}
      <ConversationGrid />
    </div>
  );
}

/**
 * Grid layout for conversation cards
 * Displays conversations in a responsive grid with rich previews
 */
function ConversationGrid() {
  // Mock data structure - in real implementation this would come from props
  const mockConversations = [
    {
      id: 'chat_1629394800000_abc123',
      title: 'React Component Help',
      lastMessage: 'How do I create a reusable button component?',
      messageCount: 12,
      updatedAt: new Date('2024-01-15T10:30:00Z'),
      isArchived: false,
    },
    {
      id: 'chat_1629394700000_def456',
      title: 'Database Design Questions',
      lastMessage: 'What are the best practices for PostgreSQL indexing?',
      messageCount: 8,
      updatedAt: new Date('2024-01-14T15:45:00Z'),
      isArchived: false,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {mockConversations.map((conversation) => (
        <ConversationCard
          key={conversation.id}
          conversation={conversation}
        />
      ))}
    </div>
  );
}

/**
 * Individual conversation card component
 * Displays a preview of a conversation with key information and actions
 */
interface ConversationCardProps {
  conversation: {
    id: string;
    title: string;
    lastMessage: string;
    messageCount: number;
    updatedAt: Date;
    isArchived: boolean;
  };
}

function ConversationCard({ conversation }: ConversationCardProps) {
  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="block group"
    >
      <div className="border rounded-lg p-4 hover:border-primary/50 hover:shadow-md transition-all duration-200 bg-card group-hover:bg-card/80">
        {/* Card Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="font-medium text-foreground truncate">
              {conversation.title}
            </h3>
          </div>
          {conversation.isArchived && (
            <Archive className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Last Message Preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {conversation.lastMessage}
        </p>

        {/* Card Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(conversation.updatedAt)}
          </span>
          <span>
            {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Empty state component for when no conversations exist
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      
      <h3 className="text-lg font-medium text-foreground mb-2">
        No conversations yet
      </h3>
      
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        Start your first AI conversation to see it appear here. 
        All your chats will be saved and organized for easy access.
      </p>
      
      <Button asChild className="gap-2">
        <Link href="/">
          <Plus className="h-4 w-4" />
          Start Your First Chat
        </Link>
      </Button>
    </div>
  );
}