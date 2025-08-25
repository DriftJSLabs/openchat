/**
 * Individual Chat Conversation Page
 * 
 * This page displays a specific chat conversation identified by the [id] parameter.
 * It provides a full-featured chat interface with message history, real-time responses,
 * and attachment support while maintaining consistency with the application's design system.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ChatInterface } from '@/components/chat-interface';
import { ChatLoading } from '@/components/chat-loading';
import { ChatError } from '@/components/chat-error';

interface ChatPageProps {
  params: {
    id: string;
  };
}

/**
 * Validates chat ID format to prevent invalid routes
 * @param id - The chat ID to validate
 * @returns Whether the ID format is valid
 */
function isValidChatId(id: string): boolean {
  // Chat IDs should start with 'chat_' followed by timestamp and random string
  // Format: chat_[timestamp]_[random]
  const chatIdPattern = /^chat_\d+_[a-z0-9]+$/;
  return chatIdPattern.test(id);
}

/**
 * Generates metadata for the chat page
 * @param params - Route parameters containing chat ID
 * @returns Metadata object for SEO and social sharing
 */
export async function generateMetadata({ params }: ChatPageProps): Promise<Metadata> {
  const { id } = await params;

  // Validate chat ID format
  if (!isValidChatId(id)) {
    return {
      title: 'Chat Not Found - OpenChat',
      description: 'The requested chat conversation could not be found.',
    };
  }

  // In a real implementation, you would fetch the conversation title from your database
  // For now, we'll use a generic title
  const chatTitle = `Chat ${id.split('_')[1] ? new Date(parseInt(id.split('_')[1])).toLocaleDateString() : 'Conversation'}`;

  return {
    title: `${chatTitle} - OpenChat`,
    description: 'AI-powered chat conversation in OpenChat application',
    robots: {
      index: false, // Chat conversations should not be indexed by search engines
      follow: false,
    },
  };
}

/**
 * Main chat conversation page component
 * 
 * Features:
 * - Displays specific chat conversation by ID
 * - Real-time message interface
 * - Message history persistence
 * - Attachment support
 * - Error handling and loading states
 * - Responsive design
 */
export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  // Validate the chat ID format before proceeding
  if (!isValidChatId(id)) {
    notFound();
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Chat Header - provides context and navigation */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">
              Chat Conversation
            </h1>
            <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
              {id}
            </span>
          </div>
          
          {/* Additional chat controls can be added here */}
          <div className="flex items-center gap-2">
            {/* Future: Add chat settings, export, delete buttons */}
          </div>
        </div>
      </div>

      {/* Main Chat Interface - takes up remaining space */}
      <div className="flex-1 min-h-0 relative">
        <Suspense fallback={<ChatLoading />}>
          <ChatInterfaceWrapper chatId={id} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Wrapper component for the chat interface with error boundary
 * This component handles loading and error states for the chat interface
 */
async function ChatInterfaceWrapper({ chatId }: { chatId: string }) {
  try {
    // In a real implementation, you would fetch conversation data here
    // const conversation = await getConversation(chatId);
    
    // For now, we'll pass the chatId to the ChatInterface component
    // which will handle its own data fetching and state management
    return (
      <ChatInterface 
        chatId={chatId}
        mode="conversation"
        className="h-full"
      />
    );
  } catch (error) {
    console.error('Error loading chat conversation:', error);
    
    return (
      <ChatError
        title="Failed to Load Conversation"
        message="There was an error loading this chat conversation. Please try again."
        chatId={chatId}
      />
    );
  }
}

/**
 * Static parameters generation for build optimization
 * In a real implementation, you might pre-generate some chat pages
 * or use dynamic routing with ISR (Incremental Static Regeneration)
 */
export function generateStaticParams() {
  // Return empty array to use dynamic routing
  // In production, you might want to pre-generate recent chat pages
  return [];
}