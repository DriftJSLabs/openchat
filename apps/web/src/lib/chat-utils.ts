/**
 * Chat utility functions for OpenChat application
 * 
 * This module provides utility functions for managing chat conversations,
 * including message formatting, conversation management, and data validation.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Represents a chat message in the conversation
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: string[];
}

/**
 * Represents a chat conversation
 */
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  isArchived?: boolean;
}

/**
 * Configuration for chat functionality
 */
export interface ChatConfig {
  maxMessages: number;
  maxMessageLength: number;
  allowedAttachmentTypes: string[];
  maxAttachmentSize: number;
}

/**
 * Default chat configuration
 */
export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  maxMessages: 1000,
  maxMessageLength: 10000,
  allowedAttachmentTypes: ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif'],
  maxAttachmentSize: 10 * 1024 * 1024, // 10MB
};

/**
 * Generates a unique chat conversation ID
 * @returns A unique identifier for a new chat conversation
 */
export function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a unique message ID
 * @returns A unique identifier for a new message
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new chat conversation
 * @param title - Optional title for the conversation
 * @returns A new empty chat conversation
 */
export function createNewConversation(title?: string): ChatConversation {
  const now = new Date();
  return {
    id: generateChatId(),
    title: title || 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a new chat message
 * @param role - The role of the message sender ('user' or 'assistant')
 * @param content - The message content
 * @param attachments - Optional array of attachment file names
 * @returns A new chat message object
 */
export function createMessage(
  role: 'user' | 'assistant',
  content: string,
  attachments?: string[]
): ChatMessage {
  return {
    id: generateMessageId(),
    role,
    content,
    timestamp: new Date(),
    attachments,
  };
}

/**
 * Validates a chat message for length and content
 * @param content - The message content to validate
 * @param config - Chat configuration (optional, uses default if not provided)
 * @returns Validation result with success status and error message if applicable
 */
export function validateMessage(
  content: string,
  config: ChatConfig = DEFAULT_CHAT_CONFIG
): { isValid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { isValid: false, error: 'Message cannot be empty' };
  }

  if (content.length > config.maxMessageLength) {
    return {
      isValid: false,
      error: `Message too long (max ${config.maxMessageLength} characters)`,
    };
  }

  return { isValid: true };
}

/**
 * Validates file attachments for type and size
 * @param files - Array of File objects to validate
 * @param config - Chat configuration (optional, uses default if not provided)
 * @returns Validation result with success status and error messages if applicable
 */
export function validateAttachments(
  files: File[],
  config: ChatConfig = DEFAULT_CHAT_CONFIG
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const file of files) {
    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!config.allowedAttachmentTypes.includes(fileExtension)) {
      errors.push(`File type ${fileExtension} is not allowed`);
    }

    // Check file size
    if (file.size > config.maxAttachmentSize) {
      const maxSizeMB = config.maxAttachmentSize / (1024 * 1024);
      errors.push(`File ${file.name} is too large (max ${maxSizeMB}MB)`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Formats a date for display in chat interface
 * @param date - The date to format
 * @returns A human-readable date string
 */
export function formatChatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Generates a conversation title based on the first user message
 * @param firstMessage - The first message in the conversation
 * @param maxLength - Maximum length for the title (default: 50)
 * @returns A generated title for the conversation
 */
export function generateConversationTitle(
  firstMessage: string,
  maxLength: number = 50
): string {
  if (!firstMessage || firstMessage.trim().length === 0) {
    return 'New Chat';
  }

  const trimmed = firstMessage.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  // Find the last space before the max length to avoid cutting words
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * Filters conversations based on search query
 * @param conversations - Array of conversations to filter
 * @param query - Search query string
 * @returns Filtered array of conversations
 */
export function filterConversations(
  conversations: ChatConversation[],
  query: string
): ChatConversation[] {
  if (!query || query.trim().length === 0) {
    return conversations;
  }

  const lowerQuery = query.toLowerCase().trim();
  
  return conversations.filter(conversation => {
    // Search in conversation title
    if (conversation.title.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in message content
    return conversation.messages.some(message =>
      message.content.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Sorts conversations by last updated date (most recent first)
 * @param conversations - Array of conversations to sort
 * @returns Sorted array of conversations
 */
export function sortConversationsByDate(
  conversations: ChatConversation[]
): ChatConversation[] {
  return [...conversations].sort((a, b) => 
    b.updatedAt.getTime() - a.updatedAt.getTime()
  );
}

/**
 * Gets recent conversations (non-archived, limited to specified count)
 * @param conversations - Array of all conversations
 * @param limit - Maximum number of conversations to return (default: 10)
 * @returns Array of recent conversations
 */
export function getRecentConversations(
  conversations: ChatConversation[],
  limit: number = 10
): ChatConversation[] {
  return sortConversationsByDate(
    conversations.filter(conv => !conv.isArchived)
  ).slice(0, limit);
}

/**
 * Estimates the token count for a message (rough approximation)
 * @param content - The message content
 * @returns Estimated token count
 */
export function estimateTokenCount(content: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(content.length / 4);
}

/**
 * Checks if a conversation has exceeded the message limit
 * @param conversation - The conversation to check
 * @param config - Chat configuration (optional, uses default if not provided)
 * @returns Whether the conversation has too many messages
 */
export function isConversationAtLimit(
  conversation: ChatConversation,
  config: ChatConfig = DEFAULT_CHAT_CONFIG
): boolean {
  return conversation.messages.length >= config.maxMessages;
}

/**
 * Truncates older messages from a conversation to stay within limits
 * @param conversation - The conversation to truncate
 * @param config - Chat configuration (optional, uses default if not provided)
 * @returns A new conversation with truncated messages
 */
export function truncateConversation(
  conversation: ChatConversation,
  config: ChatConfig = DEFAULT_CHAT_CONFIG
): ChatConversation {
  if (conversation.messages.length <= config.maxMessages) {
    return conversation;
  }

  // Keep the most recent messages
  const truncatedMessages = conversation.messages.slice(
    conversation.messages.length - config.maxMessages
  );

  return {
    ...conversation,
    messages: truncatedMessages,
    updatedAt: new Date(),
  };
}

/**
 * Error types for chat operations
 */
export class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * Common chat error codes
 */
export const CHAT_ERROR_CODES = {
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  INVALID_ATTACHMENT: 'INVALID_ATTACHMENT',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;