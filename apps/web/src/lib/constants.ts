// Application constants to eliminate magic strings and numbers

// API endpoints
export const API_ENDPOINTS = {
  CHAT: '/api/chat',
  DEBUG_OPENROUTER: '/api/debug/openrouter',
  OPENROUTER_MODELS: 'https://openrouter.ai/api/v1/models',
  OPENROUTER_AUTH_KEYS: 'https://openrouter.ai/api/v1/auth/keys',
  OPENROUTER_AUTH_KEY: 'https://openrouter.ai/api/v1/auth/key',
  OPENROUTER_CHAT: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_OAUTH: 'https://openrouter.ai/auth',
} as const;

// Model identifiers
export const MODELS = {
  OPENAI_GPT4O: 'openai/gpt-4o',
  OPENAI_GPT4O_MINI: 'openai/gpt-4o-mini',
  OPENAI_GPT35_TURBO: 'openai/gpt-3.5-turbo',
  ANTHROPIC_CLAUDE35_SONNET: 'anthropic/claude-3-5-sonnet',
  ANTHROPIC_CLAUDE35_HAIKU: 'anthropic/claude-3-5-haiku',
  ANTHROPIC_CLAUDE3_OPUS: 'anthropic/claude-3-opus',
} as const;

// Storage keys
export const STORAGE_KEYS = {
  SELECTED_MODEL: 'selectedModel',
  OPENROUTER_TOKEN: 'openrouter-token',
  PKCE_STATE: 'openrouter-pkce-state',
  SESSION_ENCRYPTION_KEY: 'session-encryption-key',
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Rate limiting
export const RATE_LIMITS = {
  CHAT_REQUESTS_PER_MINUTE: 30,
  AUTH_REQUESTS_PER_MINUTE: 10,
  API_REQUESTS_PER_MINUTE: 60,
  WINDOW_MS: 60 * 1000, // 1 minute
} as const;

// Security
export const SECURITY = {
  CSRF_TOKEN_HEADER: 'x-csrf-token',
  CSRF_COOKIE_NAME: 'csrf-token',
  CSRF_COOKIE_MAX_AGE: 60 * 60 * 24, // 24 hours
  ENCRYPTION_KEY_LENGTH: 32,
} as const;

// UI constants
export const UI = {
  DEFAULT_TEMPERATURE: 0.7,
  MAX_TOKENS: 2000,
  MAX_RETRIES: 2,
  MESSAGE_PREVIEW_LENGTH: 50,
  SCROLL_BEHAVIOR: 'smooth' as ScrollBehavior,
} as const;

// Content types
export const CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT_STREAM: 'text/event-stream',
} as const;

// Cache control headers
export const CACHE_CONTROL = {
  NO_CACHE: 'no-cache',
  KEEP_ALIVE: 'keep-alive',
} as const;

// Event stream data types
export const STREAM_TYPES = {
  DELTA: 'delta',
  DONE: 'done',
  ERROR: 'error',
  ABORT: 'abort',
  RESUME: 'resume',
} as const;

// PKCE constants
export const PKCE = {
  CODE_CHALLENGE_METHOD: 'S256',
  CODE_VERIFIER_LENGTH: 32,
} as const;

// Cleanup intervals
export const INTERVALS = {
  RATE_LIMIT_CLEANUP: 5 * 60 * 1000, // 5 minutes
} as const;

// Message roles
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  MESSAGES_REQUIRED: 'Messages array required',
  OPENROUTER_TOKEN_REQUIRED: 'OpenRouter token required for this model',
  CONNECT_OPENROUTER: 'Please connect your OpenRouter account to use AI features',
  CSRF_VALIDATION_FAILED: 'CSRF token validation failed',
  TOO_MANY_REQUESTS: 'Too many requests',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  STREAM_ERROR: 'Stream error',
  UNKNOWN_ERROR: 'Unknown error',
} as const;