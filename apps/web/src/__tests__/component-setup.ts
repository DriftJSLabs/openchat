/**
 * Component Test Setup for OpenChat Web App
 * 
 * This setup file is specifically for testing React components
 * in isolation with proper mocking and utilities.
 */

import { beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    has: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    entries: vi.fn(),
    forEach: vi.fn(),
    toString: vi.fn(),
  }),
  usePathname: () => '/',
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// Mock Next.js image component
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

// Mock Next.js dynamic imports
vi.mock('next/dynamic', () => ({
  default: (fn: any, options: any = {}) => {
    const Component = fn();
    if (options.loading) {
      return (props: any) => <Component {...props} />;
    }
    return Component;
  },
}));

// Mock framer-motion for components that use animations
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    input: ({ children, ...props }: any) => <input {...props}>{children}</input>,
    textarea: ({ children, ...props }: any) => <textarea {...props}>{children}</textarea>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useMotionValue: () => ({ get: () => 0, set: vi.fn() }),
  useTransform: () => 0,
  useSpring: () => 0,
  useAnimation: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    set: vi.fn(),
  }),
}));

// Mock localStorage and sessionStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  },
  writable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  },
  writable: true,
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock fetch
global.fetch = vi.fn();

// Mock WebSocket
global.WebSocket = vi.fn().mockImplementation(() => ({
  readyState: WebSocket.OPEN,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

// Mock crypto for generating IDs
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
    getRandomValues: vi.fn((arr) => arr.map(() => Math.floor(Math.random() * 256))),
  },
});

// Mock console methods in test environment to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Suppress console.error and console.warn in tests unless explicitly needed
  console.error = (...args) => {
    // Still log React errors and test failures
    if (
      typeof args[0] === 'string' && 
      (args[0].includes('Warning:') || args[0].includes('Error:'))
    ) {
      originalConsoleError(...args);
    }
  };
  
  console.warn = (...args) => {
    // Still log important warnings
    if (
      typeof args[0] === 'string' && 
      args[0].includes('deprecated')
    ) {
      originalConsoleWarn(...args);
    }
  };
});

afterEach(() => {
  // Clean up DOM after each test
  cleanup();
  
  // Clear all mocks
  vi.clearAllMocks();
  
  // Clear timers
  vi.clearAllTimers();
  
  // Reset localStorage and sessionStorage mocks
  vi.mocked(localStorage.getItem).mockClear();
  vi.mocked(localStorage.setItem).mockClear();
  vi.mocked(localStorage.removeItem).mockClear();
  vi.mocked(localStorage.clear).mockClear();
  
  vi.mocked(sessionStorage.getItem).mockClear();
  vi.mocked(sessionStorage.setItem).mockClear();
  vi.mocked(sessionStorage.removeItem).mockClear();
  vi.mocked(sessionStorage.clear).mockClear();
  
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

/**
 * Utility function to wait for next tick
 */
export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Utility function to wait for component to update
 */
export const waitForUpdate = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock implementation for testing async components
 */
export const createAsyncMock = <T>(resolveValue: T, delay = 0): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(resolveValue), delay);
  });
};

/**
 * Mock user object for testing
 */
export const mockUser = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  image: 'https://example.com/avatar.jpg',
  emailVerified: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Mock chat object for testing
 */
export const mockChat = {
  id: 'test-chat-id',
  title: 'Test Chat',
  userId: 'test-user-id',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Mock message object for testing
 */
export const mockMessage = {
  id: 'test-message-id',
  content: 'Test message content',
  chatId: 'test-chat-id',
  userId: 'test-user-id',
  role: 'user' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};