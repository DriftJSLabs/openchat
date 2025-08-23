/**
 * Tests for ChatContainer component
 * 
 * These tests validate the ChatContainer component's functionality including:
 * - Context provider functionality
 * - Layout rendering
 * - Event handler integration
 * - State management
 * - Error handling
 * - Real-time streaming integration
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { ChatContainer, useChatContainer } from '../chat-container';
import type { Chat } from '@/lib/db/schema/shared';

// Test component that uses the chat context
function TestConsumer() {
  const context = useChatContainer();
  
  return (
    <div>
      <div data-testid="current-chat-id">
        {context.currentChat?.id || 'null'}
      </div>
      <div data-testid="user-id">
        {context.userId || 'null'}
      </div>
      <div data-testid="is-loading">
        {context.isLoading.toString()}
      </div>
      <div data-testid="is-streaming">
        {context.isStreaming.toString()}
      </div>
      <div data-testid="is-syncing">
        {context.isSyncing.toString()}
      </div>
      <div data-testid="error">
        {context.error || 'null'}
      </div>
      <div data-testid="streaming-content">
        {context.streamingContent || 'null'}
      </div>
      <button 
        data-testid="send-message-btn"
        onClick={() => context.onSendMessage?.('test message')}
      >
        Send Message
      </button>
      <button 
        data-testid="stop-stream-btn"
        onClick={() => context.onStopStream?.()}
      >
        Stop Stream
      </button>
      <button 
        data-testid="create-chat-btn"
        onClick={() => context.onCreateChat?.('new chat')}
      >
        Create Chat
      </button>
      <button 
        data-testid="select-chat-btn"
        onClick={() => context.onSelectChat?.('chat-123')}
      >
        Select Chat
      </button>
      <button 
        data-testid="message-action-btn"
        onClick={() => context.onMessageAction?.('copy', 'msg-123')}
      >
        Message Action
      </button>
    </div>
  );
}

describe('ChatContainer', () => {
  // Real chat data for testing
  const testChat: Chat = {
    id: 'chat-test-123',
    title: 'Test Chat',
    userId: 'user-456',
    chatType: 'conversation',
    settings: null,
    tags: null,
    isPinned: false,
    isArchived: false,
    lastActivityAt: new Date(),
    messageCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };

  describe('Context Provider', () => {
    test('provides default context values when no props are passed', () => {
      render(
        <ChatContainer>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('current-chat-id')).toHaveTextContent('null');
      expect(screen.getByTestId('user-id')).toHaveTextContent('null');
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('null');
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('null');
    });

    test('provides correct context values when props are passed', () => {
      render(
        <ChatContainer
          currentChat={testChat}
          userId="user-456"
          isLoading={true}
          isStreaming={true}
          isSyncing={true}
          error="Test error"
          streamingContent="Streaming text..."
        >
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('current-chat-id')).toHaveTextContent('chat-test-123');
      expect(screen.getByTestId('user-id')).toHaveTextContent('user-456');
      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('true');
      expect(screen.getByTestId('error')).toHaveTextContent('Test error');
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Streaming text...');
    });

    test('throws error when useChatContainer is used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useChatContainer must be used within a ChatContainer');

      console.error = originalError;
    });
  });

  describe('Event Handlers', () => {
    test('calls onSendMessage handler when invoked from context', () => {
      const mockOnSendMessage = jest.fn();
      
      render(
        <ChatContainer onSendMessage={mockOnSendMessage}>
          <TestConsumer />
        </ChatContainer>
      );

      fireEvent.click(screen.getByTestId('send-message-btn'));
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('test message');
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    test('calls onStopStream handler when invoked from context', () => {
      const mockOnStopStream = jest.fn();
      
      render(
        <ChatContainer onStopStream={mockOnStopStream}>
          <TestConsumer />
        </ChatContainer>
      );

      fireEvent.click(screen.getByTestId('stop-stream-btn'));
      
      expect(mockOnStopStream).toHaveBeenCalledTimes(1);
    });

    test('calls onCreateChat handler when invoked from context', () => {
      const mockOnCreateChat = jest.fn();
      
      render(
        <ChatContainer onCreateChat={mockOnCreateChat}>
          <TestConsumer />
        </ChatContainer>
      );

      fireEvent.click(screen.getByTestId('create-chat-btn'));
      
      expect(mockOnCreateChat).toHaveBeenCalledWith('new chat');
      expect(mockOnCreateChat).toHaveBeenCalledTimes(1);
    });

    test('calls onSelectChat handler when invoked from context', () => {
      const mockOnSelectChat = jest.fn();
      
      render(
        <ChatContainer onSelectChat={mockOnSelectChat}>
          <TestConsumer />
        </ChatContainer>
      );

      fireEvent.click(screen.getByTestId('select-chat-btn'));
      
      expect(mockOnSelectChat).toHaveBeenCalledWith('chat-123');
      expect(mockOnSelectChat).toHaveBeenCalledTimes(1);
    });

    test('calls onMessageAction handler when invoked from context', () => {
      const mockOnMessageAction = jest.fn();
      
      render(
        <ChatContainer onMessageAction={mockOnMessageAction}>
          <TestConsumer />
        </ChatContainer>
      );

      fireEvent.click(screen.getByTestId('message-action-btn'));
      
      expect(mockOnMessageAction).toHaveBeenCalledWith('copy', 'msg-123');
      expect(mockOnMessageAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Layout and Styling', () => {
    test('renders with correct base classes', () => {
      const { container } = render(<ChatContainer />);
      const chatContainer = container.firstChild as HTMLElement;
      
      expect(chatContainer).toHaveClass('flex', 'h-screen', 'w-full', 'bg-background', 'text-foreground');
    });

    test('applies custom className', () => {
      const { container } = render(<ChatContainer className="custom-class" />);
      const chatContainer = container.firstChild as HTMLElement;
      
      expect(chatContainer).toHaveClass('custom-class');
    });

    test('passes through HTML attributes', () => {
      const { container } = render(
        <ChatContainer data-testid="chat-container" role="main" />
      );
      const chatContainer = container.firstChild as HTMLElement;
      
      expect(chatContainer).toHaveAttribute('data-testid', 'chat-container');
      expect(chatContainer).toHaveAttribute('role', 'main');
    });
  });

  describe('State Management', () => {
    test('updates context when props change', () => {
      const { rerender } = render(
        <ChatContainer isLoading={false}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');

      rerender(
        <ChatContainer isLoading={true}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    });

    test('handles complex state combinations correctly', () => {
      render(
        <ChatContainer
          isLoading={true}
          isStreaming={true}
          isSyncing={false}
          error="Connection error"
        >
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('Connection error');
    });
  });

  describe('Real-time Integration', () => {
    test('handles streaming state correctly', () => {
      const { rerender } = render(
        <ChatContainer isStreaming={false}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');

      rerender(
        <ChatContainer isStreaming={true} streamingContent="Hello">
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Hello');
    });

    test('handles sync state correctly', () => {
      const { rerender } = render(
        <ChatContainer isSyncing={false}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');

      rerender(
        <ChatContainer isSyncing={true}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('is-syncing')).toHaveTextContent('true');
    });
  });

  describe('Error Handling', () => {
    test('handles error state correctly', () => {
      render(
        <ChatContainer error="Database connection failed">
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('error')).toHaveTextContent('Database connection failed');
    });

    test('clears error state when error prop is removed', () => {
      const { rerender } = render(
        <ChatContainer error="Test error">
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('error')).toHaveTextContent('Test error');

      rerender(
        <ChatContainer error={null}>
          <TestConsumer />
        </ChatContainer>
      );

      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });
  });

  describe('Performance', () => {
    test('does not re-render children unnecessarily', () => {
      let renderCount = 0;
      
      function CountingChild() {
        renderCount++;
        return <div>Render count: {renderCount}</div>;
      }

      const { rerender } = render(
        <ChatContainer>
          <CountingChild />
        </ChatContainer>
      );

      expect(renderCount).toBe(1);

      // Rerender with same props should not cause child re-render
      rerender(
        <ChatContainer>
          <CountingChild />
        </ChatContainer>
      );

      expect(renderCount).toBe(1);
    });
  });
});