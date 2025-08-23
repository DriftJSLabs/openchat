/**
 * OpenChat Home Page - Main AI Chat Interface
 * 
 * Clean, focused interface for AI conversations.
 */

import type { Metadata } from 'next';
import { AnimatedAIChat } from '@/components/animated-ai-chat';

/**
 * Enhanced metadata for the home page with improved SEO
 */
export const metadata: Metadata = {
  title: 'OpenChat - AI-Powered Conversations',
  description: 'Start meaningful conversations with AI. OpenChat provides an intuitive interface for AI-powered chat conversations with advanced features and seamless user experience.',
  keywords: ['AI chat', 'conversation', 'artificial intelligence', 'messaging', 'OpenAI', 'chat interface'],
  openGraph: {
    title: 'OpenChat - AI-Powered Conversations',
    description: 'Start meaningful conversations with AI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenChat - AI-Powered Conversations',
    description: 'Start meaningful conversations with AI',
  },
};

/**
 * Clean home page with centered AI chat interface
 */
export default function Home() {
  return (
    <div className="h-full w-full bg-background">
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <AnimatedAIChat />
        </div>
      </div>
    </div>
  );
}