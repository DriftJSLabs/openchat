/**
 * Integration Test Setup for OpenChat Web App
 * 
 * This setup file is loaded before integration tests run.
 * It configures the test environment for testing interactions
 * between components, services, and external systems.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

// Mock server for external API calls
const server = setupServer(
  // Mock OpenChat server API
  rest.get('http://localhost:3002/api/health', (req, res, ctx) => {
    return res(ctx.json({ status: 'ok', timestamp: Date.now() }));
  }),
  
  rest.post('http://localhost:3002/api/auth/session', (req, res, ctx) => {
    return res(
      ctx.json({
        user: {
          id: 'test-user-id',
          name: 'Test User',
          email: 'test@example.com',
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
    );
  }),
  
  rest.get('http://localhost:3002/api/chats', (req, res, ctx) => {
    return res(
      ctx.json([
        {
          id: 'chat-1',
          title: 'Test Chat 1',
          userId: 'test-user-id',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'chat-2',
          title: 'Test Chat 2',
          userId: 'test-user-id',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
    );
  }),
  
  rest.post('http://localhost:3002/api/chats', (req, res, ctx) => {
    return res(
      ctx.json({
        id: 'new-chat-id',
        title: 'New Test Chat',
        userId: 'test-user-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  }),
  
  rest.get('http://localhost:3002/api/chats/:chatId/messages', (req, res, ctx) => {
    const { chatId } = req.params;
    return res(
      ctx.json([
        {
          id: 'message-1',
          content: 'Hello, this is a test message',
          chatId,
          userId: 'test-user-id',
          role: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'message-2',
          content: 'This is a response from the assistant',
          chatId,
          userId: 'assistant-id',
          role: 'assistant',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
    );
  }),
  
  rest.post('http://localhost:3002/api/chats/:chatId/messages', (req, res, ctx) => {
    const { chatId } = req.params;
    return res(
      ctx.json({
        id: 'new-message-id',
        content: 'New test message',
        chatId,
        userId: 'test-user-id',
        role: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  }),
  
  // Mock ElectricSQL service
  rest.get('http://localhost:5134/api/status', (req, res, ctx) => {
    return res(ctx.json({ status: 'ok', version: '1.0.0' }));
  }),
  
  rest.get('http://localhost:5134/v1/shape', (req, res, ctx) => {
    const table = req.url.searchParams.get('table');
    
    if (table === 'chats') {
      return res(
        ctx.json({
          data: [
            {
              id: 'chat-1',
              title: 'Synced Chat 1',
              user_id: 'test-user-id',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          last_offset: '1',
        })
      );
    }
    
    if (table === 'messages') {
      return res(
        ctx.json({
          data: [
            {
              id: 'message-1',
              content: 'Synced message',
              chat_id: 'chat-1',
              user_id: 'test-user-id',
              role: 'user',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          last_offset: '1',
        })
      );
    }
    
    return res(ctx.json({ data: [], last_offset: '0' }));
  }),
);

/**
 * Global setup for integration tests
 */
beforeAll(() => {
  // Start the mock server
  server.listen({
    onUnhandledRequest: 'error',
  });
  
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3002';
  process.env.NEXT_PUBLIC_ELECTRIC_URL = 'http://localhost:5134';
  process.env.TEST_DATABASE_URL = 'postgresql://openchat:openchat_test@localhost:5432/openchat_test';
  
  console.log('🧪 Integration test environment initialized');
});

/**
 * Clean up after all integration tests
 */
afterAll(() => {
  server.close();
  console.log('🧹 Integration test environment cleaned up');
});

/**
 * Reset handlers before each test
 */
beforeEach(() => {
  server.resetHandlers();
});

/**
 * Clean up after each test
 */
afterEach(() => {
  // Clear any test-specific state
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear any pending timers
  vi.clearAllTimers();
});

// Make server available for test files to add custom handlers
export { server };