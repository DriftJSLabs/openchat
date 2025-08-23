/**
 * Chat UI Components System
 * 
 * A comprehensive set of components for building chat interfaces with real-time
 * streaming, local database persistence, and responsive design.
 * 
 * Built on top of existing ai-elements patterns and shadcn/ui components.
 */

// Main container and layout components
export {
  ChatContainer,
  ChatContent,
  ChatHeader,
  ChatMain,
  ChatFooter,
  useChatContainer,
  type ChatContainerProps,
  type ChatContentProps,
  type ChatHeaderProps,
  type ChatMainProps,
  type ChatFooterProps,
} from './chat-container';

// Message display components
export {
  MessageList,
  MessageListScrollButton,
  MessageListContainer,
  type MessageListProps,
  type MessageListScrollButtonProps,
  type MessageListContainerProps,
} from './message-list';

export {
  MessageItem,
  MessageItemContainer,
  MessageSeparator,
  type MessageItemProps,
  type MessageItemContainerProps,
  type MessageSeparatorProps,
} from './message-item';

export {
  StreamingMessage,
  StreamingText,
  StreamingMessageContainer,
  type StreamingMessageProps,
  type StreamingTextProps,
  type StreamingMessageContainerProps,
} from './streaming-message';

// Input and interaction components
export {
  ChatInput,
  ChatInputContainer,
  SimpleChatInput,
  type ChatInputProps,
  type ChatInputContainerProps,
  type SimpleChatInputProps,
} from './chat-input';

// Navigation and sidebar components
export {
  ChatSidebar,
  SimpleChatSidebar,
  type ChatSidebarProps,
  type SimpleChatSidebarProps,
} from './chat-sidebar';

// Hooks for chat functionality
export {
  useChatStream,
  useSimpleChatStream,
  useAutoChatStream,
  type UseChatStreamOptions,
  type ChatStreamState,
  type ChatStreamHook,
  type ChatStreamOptions,
  type ChatStreamMessage,
} from '../hooks/use-chat-stream';

/**
 * Re-export commonly used types from dependencies
 */
export type { Message, Chat } from '@/lib/db/schema/shared';
export type { ChatStatus } from 'ai';

/**
 * Utility type for chat message roles
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Common chat event handlers interface
 */
export interface ChatEventHandlers {
  onSendMessage?: (content: string) => void;
  onCreateChat?: (title?: string) => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onRenameChat?: (chatId: string, newTitle: string) => void;
  onArchiveChat?: (chatId: string) => void;
  onCopyMessage?: (content: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onThumbsUp?: (messageId: string) => void;
  onThumbsDown?: (messageId: string) => void;
}

/**
 * Chat configuration interface for consistent setup
 */
export interface ChatConfig {
  userId?: string;
  chatId?: string;
  apiEndpoint?: string;
  maxLength?: number;
  showAdvancedTools?: boolean;
  supportsVoice?: boolean;
  supportsFileUpload?: boolean;
  persistMessages?: boolean;
  autoCreateChat?: boolean;
  defaultChatTitle?: string;
}

/**
 * Complete chat interface state
 */
export interface ChatState {
  currentChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  input: string;
}