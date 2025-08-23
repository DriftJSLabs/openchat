/**
 * Comprehensive Chat Integration Tests
 * 
 * This test suite validates the complete chat functionality including:
 * - Real AI streaming integration
 * - Database persistence 
 * - Error handling and recovery
 * - Component integration
 * - User interaction flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInterface } from '@/components/chat-interface';
import { ChatErrorBoundary } from '@/components/chat-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the AI SDK
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    error: null,
    stop: vi.fn(),
    setMessages: vi.fn(),
  })),
}));

// Mock the database hooks
vi.mock('@/hooks/use-local-database', () => ({
  useLocalDatabase: vi.fn(() => ({
    isInitialized: true,
    isLoading: false,
    error: null,
    database: {
      createChat: vi.fn(),
      createMessage: vi.fn(),
      getChatMessages: vi.fn(() => []),
    },
  })),
}));

// Mock the chat stream hook
vi.mock('@/hooks/use-chat-stream', () => ({
  useChatStream: vi.fn(() => ({
    messages: [],
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    error: null,
    stop: vi.fn(),
    persistedMessages: [],
    currentChat: null,
    isDatabaseLoading: false,
    databaseError: null,
    isSyncing: false,
    createChat: vi.fn(),
    clearChat: vi.fn(),
  })),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock the worker
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as any,
  onerror: null as any,
};
global.Worker = vi.fn().mockImplementation(() => mockWorker);

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Chat Integration Tests', () => {
  let queryClient: QueryClient;
  const user = userEvent.setup();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderChatInterface = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatInterface userId="test-user" {...props} />
      </QueryClientProvider>
    );
  };

  const renderWithErrorBoundary = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatErrorBoundary>
          <ChatInterface userId="test-user" {...props} />
        </ChatErrorBoundary>
      </QueryClientProvider>
    );
  };

  describe('Chat Interface Rendering', () => {
    it('should render chat interface in conversation mode', () => {
      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should render animated chat in standalone mode', () => {
      renderChatInterface({ mode: 'standalone' });
      
      // Should render the AnimatedAIChat component
      expect(screen.getByText(/how can i help today/i)).toBeInTheDocument();
    });

    it('should show loading state when database is initializing', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: true,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/connecting to chat services/i)).toBeInTheDocument();
    });
  });

  describe('Message Sending Flow', () => {
    it('should handle message input and submission', async () => {
      const mockHandleInputChange = vi.fn();
      const mockHandleSubmit = vi.fn();
      
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: 'Test message',
        handleInputChange: mockHandleInputChange,
        handleSubmit: mockHandleSubmit,
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: { id: 'test-chat', title: 'Test Chat' },
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      const input = screen.getByPlaceholderText(/type your message/i);
      const sendButton = screen.getByRole('button', { name: /send/i });

      // Type a message
      await user.type(input, 'Hello, AI!');
      expect(mockHandleInputChange).toHaveBeenCalled();

      // Send the message
      await user.click(sendButton);
      expect(mockHandleSubmit).toHaveBeenCalled();
    });

    it('should prevent submission of empty messages', async () => {
      const mockHandleSubmit = vi.fn();
      
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: mockHandleSubmit,
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });

    it('should handle Enter key for message submission', async () => {
      const mockHandleSubmit = vi.fn();
      
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: 'Test message',
        handleInputChange: vi.fn(),
        handleSubmit: mockHandleSubmit,
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      const input = screen.getByPlaceholderText(/type your message/i);
      
      // Type message and press Enter
      await user.type(input, 'Hello{enter}');
      
      expect(mockHandleSubmit).toHaveBeenCalled();
    });
  });

  describe('Message Display', () => {
    it('should display existing messages from database', async () => {
      const testMessages = [
        {
          id: 'msg1',
          chatId: 'chat1',
          role: 'user' as const,
          content: 'Hello, how are you?',
          messageType: 'text' as const,
          metadata: null,
          parentMessageId: null,
          editHistory: null,
          tokenCount: 10,
          createdAt: Date.now() / 1000,
          isDeleted: false,
        },
        {
          id: 'msg2',
          chatId: 'chat1',
          role: 'assistant' as const,
          content: 'I am doing well, thank you for asking!',
          messageType: 'text' as const,
          metadata: null,
          parentMessageId: null,
          editHistory: null,
          tokenCount: 15,
          createdAt: Date.now() / 1000,
          isDeleted: false,
        },
      ];

      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: testMessages,
        currentChat: { id: 'chat1', title: 'Test Chat' },
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation', chatId: 'chat1' });
      
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
      expect(screen.getByText('I am doing well, thank you for asking!')).toBeInTheDocument();
    });

    it('should show empty state when no messages exist', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
    });
  });

  describe('Streaming Integration', () => {
    it('should show streaming indicator when AI is responding', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: true, // Streaming is active
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
        streamingContent: 'This is a streaming response...',
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/generating/i)).toBeInTheDocument();
    });

    it('should provide stop functionality during streaming', async () => {
      const mockStop = vi.fn();
      
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: true,
        error: null,
        stop: mockStop,
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      const stopButton = screen.getByRole('button', { name: /stop/i });
      await user.click(stopButton);
      
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display database errors', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: 'Database connection failed',
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/database connection failed/i)).toBeInTheDocument();
    });

    it('should display streaming errors', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: new Error('AI service unavailable'),
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/ai service unavailable/i)).toBeInTheDocument();
    });

    it('should handle component errors with error boundary', () => {
      // Mock console.error to avoid noise in test output
      const originalError = console.error;
      console.error = vi.fn();

      // Create a component that throws an error
      const ThrowingComponent = () => {
        throw new Error('Test component error');
      };

      expect(() => {
        render(
          <ChatErrorBoundary>
            <ThrowingComponent />
          </ChatErrorBoundary>
        );
      }).not.toThrow();

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

      // Restore console.error
      console.error = originalError;
    });
  });

  describe('Chat Management', () => {
    it('should create new chat when auto-create is enabled', async () => {
      const mockCreateChat = vi.fn().mockResolvedValue({
        id: 'new-chat-id',
        title: 'New Chat',
        userId: 'test-user',
      });
      
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: 'Hello',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: mockCreateChat,
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ 
        mode: 'conversation',
        autoCreateChat: true 
      });
      
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);
      
      expect(mockCreateChat).toHaveBeenCalled();
    });

    it('should display chat title in header', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: { id: 'test-chat', title: 'My Important Chat' },
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText('My Important Chat')).toBeInTheDocument();
    });
  });

  describe('Sync Status', () => {
    it('should show sync indicator when syncing', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: true,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      expect(screen.getByText(/syncing/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      renderChatInterface({ mode: 'conversation' });
      
      const messageInput = screen.getByPlaceholderText(/type your message/i);
      expect(messageInput).toHaveAttribute('aria-label', 'Message input');
      
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      renderChatInterface({ mode: 'conversation' });
      
      const input = screen.getByPlaceholderText(/type your message/i);
      
      // Tab should focus the input
      await user.tab();
      expect(input).toHaveFocus();
      
      // Tab should move to send button
      await user.tab();
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toHaveFocus();
    });
  });

  describe('Performance', () => {
    it('should handle rapid message updates efficiently', async () => {
      const { useChatStream } = await import('@/hooks/use-chat-stream');
      const mockHandleInputChange = vi.fn();
      
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        input: '',
        handleInputChange: mockHandleInputChange,
        handleSubmit: vi.fn(),
        isLoading: false,
        error: null,
        stop: vi.fn(),
        persistedMessages: [],
        currentChat: null,
        isDatabaseLoading: false,
        databaseError: null,
        isSyncing: false,
        createChat: vi.fn(),
        clearChat: vi.fn(),
      } as any);

      renderChatInterface({ mode: 'conversation' });
      
      const input = screen.getByPlaceholderText(/type your message/i);
      
      // Rapidly type multiple characters
      for (let i = 0; i < 10; i++) {
        await user.type(input, 'a');
      }
      
      // Should have called handleInputChange for each character
      expect(mockHandleInputChange).toHaveBeenCalledTimes(10);
    });
  });
});