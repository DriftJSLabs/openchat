// API Configuration
export const API_CONFIG = {
  OPENROUTER: {
    BASE_URL: 'https://openrouter.ai/api/v1',
    AUTH_URL: 'https://openrouter.ai/auth',
    ENDPOINTS: {
      KEYS: '/auth/keys',
      KEY_TEST: '/auth/key',
      MODELS: '/models',
      CHAT: '/chat/completions'
    }
  },
  RATE_LIMITS: {
    CHAT_API: { windowMs: 60 * 1000, maxRequests: 30 },
    STREAM_API: { windowMs: 60 * 1000, maxRequests: 60 },
  }
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  SELECTED_MODEL: 'selectedModel',
  OPENROUTER_TOKEN: 'openrouter-token',
  PKCE_STATE: 'openrouter-pkce-state',
  ENCRYPTION_KEY: 'openchat-encryption-key',
  CSRF_TOKEN: 'csrf-token'
} as const;

// Default Models
export const DEFAULT_MODELS = {
  PRIMARY: 'openai/gpt-4o',
  FALLBACK: 'openai/gpt-4o-mini',
  AVAILABLE: {
    'openai/gpt-4o': 'GPT-4 Omni',
    'openai/gpt-4o-mini': 'GPT-4 Omni Mini',
    'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'anthropic/claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'anthropic/claude-3-5-haiku': 'Claude 3.5 Haiku',
    'anthropic/claude-3-opus': 'Claude 3 Opus'
  }
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  MESSAGES_REQUIRED: 'Messages array required',
  TOKEN_REQUIRED: 'OpenRouter token required for this model',
  STREAM_ID_REQUIRED: 'Stream ID required',
  STREAM_NOT_FOUND: 'Stream not found',
  CSRF_INVALID: 'CSRF token missing or invalid',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  INTERNAL_ERROR: 'Internal server error',
  TOKEN_EXCHANGE_FAILED: 'Token exchange failed',
  MODELS_FETCH_FAILED: 'Failed to fetch models'
} as const;

// UI Constants
export const UI_CONFIG = {
  THEME: {
    DEFAULT: 'system',
    OPTIONS: ['light', 'dark', 'system']
  },
  ANIMATIONS: {
    SCROLL_BEHAVIOR: 'smooth',
    TRANSITION_DURATION: '0.2s'
  }
} as const;