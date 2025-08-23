import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, type Message } from 'ai'
import { nanoid } from 'nanoid'
import { headers } from 'next/headers'
import { validateUserSession, extractUserContext, createAuthContext, requireAuthentication, type UserSession } from '@/lib/auth-utils'
import { validateSecureRequest } from '@/lib/csrf-protection'

/**
 * Enhanced AI chat API endpoint with comprehensive error handling,
 * model fallbacks, telemetry, and OpenRouter integration.
 * 
 * Features:
 * - AI SDK v5 with proper streaming using toDataStreamResponse()
 * - OpenRouter provider with multiple model fallback strategies
 * - Comprehensive error handling and classification
 * - Request/response logging and telemetry
 * - Rate limiting and security headers
 * - Authentication integration
 * - Chat persistence integration
 */

// Model fallback configuration with priority order (security validated)
const MODEL_FALLBACKS = [
  'meta-llama/llama-3.1-8b-instruct:free', // Primary model (free tier)
  'mistralai/mistral-7b-instruct:free',    // Secondary fallback
  'openai/gpt-3.5-turbo',                  // Tertiary fallback (if available)
] as const

// Environment variables validation with security checks
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const ENVIRONMENT = process.env.NODE_ENV || 'development'
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '4096')
const TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || '0.7')
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false' // Default to true for security
const ALLOWED_MODELS = process.env.ALLOWED_MODELS ? process.env.ALLOWED_MODELS.split(',') : MODEL_FALLBACKS

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY environment variable is required')
}

// Initialize OpenRouter provider with configuration
const openrouter = createOpenRouter({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Security: List of safe, validated models to prevent model injection
const SAFE_MODELS = new Set([
  ...MODEL_FALLBACKS,
  'meta-llama/llama-3.1-70b-instruct',
  'anthropic/claude-3-haiku',
  'google/gemma-7b-it',
  'microsoft/wizardlm-2-8x22b',
]);

// OpenRouter specific error types for enhanced error handling
type OpenRouterError = {
  error: {
    type: string
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// Request validation schema
interface ChatRequest {
  messages: Message[]
  chatId?: string
  userId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

// Response telemetry tracking
interface RequestTelemetry {
  requestId: string
  timestamp: number
  userId?: string
  chatId?: string
  model: string
  messageCount: number
  requestSize: number
  duration?: number
  error?: string
  statusCode: number
}

/**
 * Validates and sanitizes the incoming chat request with comprehensive security checks
 */
function validateChatRequest(body: unknown, authenticatedUserId?: string): ChatRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a valid JSON object')
  }

  const request = body as Partial<ChatRequest>

  // Validate required messages array
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error('Messages array is required and must not be empty')
  }

  // Security: Limit message count to prevent abuse
  if (request.messages.length > 100) {
    throw new Error('Too many messages in request (max 100)')
  }

  // Validate message structure with enhanced security checks
  for (const [index, message] of request.messages.entries()) {
    if (!message.role || !message.content) {
      throw new Error(`Message ${index}: Each message must have role and content properties`)
    }
    
    // Security: Strict role validation
    if (!['user', 'assistant', 'system'].includes(message.role)) {
      throw new Error(`Message ${index}: Message role must be user, assistant, or system`)
    }
    
    if (typeof message.content !== 'string') {
      throw new Error(`Message ${index}: Message content must be a string`)
    }

    // Security: Content length validation to prevent abuse
    if (message.content.length > 50000) {
      throw new Error(`Message ${index}: Message content too long (max 50,000 characters)`)
    }

    // Security: Content sanitization - remove potentially dangerous patterns
    const sanitizedContent = sanitizeMessageContent(message.content)
    if (sanitizedContent !== message.content) {
      console.warn(`[Security] Sanitized content in message ${index}`);
      message.content = sanitizedContent;
    }
  }

  // Security: Validate and sanitize model parameter
  if (request.model && !SAFE_MODELS.has(request.model)) {
    throw new Error(`Invalid or unauthorized model: ${request.model}. Use only approved models.`)
  }

  // Validate optional parameters with stricter bounds
  const temperature = request.temperature ?? TEMPERATURE
  if (temperature < 0 || temperature > 2) {
    throw new Error('Temperature must be between 0 and 2')
  }

  const maxTokens = request.maxTokens ?? MAX_TOKENS
  if (maxTokens < 1 || maxTokens > 32768) {
    throw new Error('Max tokens must be between 1 and 32768')
  }

  // Security: Validate userId if provided matches authenticated user
  if (authenticatedUserId && request.userId && request.userId !== authenticatedUserId) {
    throw new Error('User ID mismatch: cannot make requests for other users')
  }

  // Security: Validate chatId format if provided
  if (request.chatId && !/^[a-zA-Z0-9_-]+$/.test(request.chatId)) {
    throw new Error('Invalid chat ID format: only alphanumeric characters, hyphens, and underscores allowed')
  }

  return {
    messages: request.messages,
    chatId: request.chatId,
    userId: authenticatedUserId || request.userId, // Use authenticated user ID for security
    model: request.model,
    temperature,
    maxTokens,
    stream: request.stream ?? true,
  }
}

/**
 * Sanitizes message content to prevent injection attacks and malicious content
 */
function sanitizeMessageContent(content: string): string {
  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit consecutive newlines to prevent formatting abuse
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove potentially dangerous HTML/script patterns
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  return sanitized.trim();
}

/**
 * Classifies OpenRouter specific errors for better error handling
 */
function classifyOpenRouterError(error: unknown): {
  type: 'rate_limit' | 'authentication' | 'model_unavailable' | 'invalid_request' | 'server_error' | 'network' | 'unknown'
  message: string
  statusCode: number
  retryable: boolean
} {
  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Network error occurred while communicating with AI service',
      statusCode: 503,
      retryable: true,
    }
  }

  // Handle OpenRouter API errors
  if (error && typeof error === 'object' && 'error' in error) {
    const openRouterError = error as OpenRouterError
    const errorType = openRouterError.error.type
    const errorCode = openRouterError.error.code
    const message = openRouterError.error.message

    switch (errorType) {
      case 'rate_limit_exceeded':
        return {
          type: 'rate_limit',
          message: 'Rate limit exceeded. Please try again later.',
          statusCode: 429,
          retryable: true,
        }
      case 'authentication_error':
        return {
          type: 'authentication',
          message: 'Authentication failed with AI service',
          statusCode: 401,
          retryable: false,
        }
      case 'model_not_found':
      case 'model_unavailable':
        return {
          type: 'model_unavailable',
          message: `Model unavailable: ${message}`,
          statusCode: 503,
          retryable: true,
        }
      case 'invalid_request_error':
        return {
          type: 'invalid_request',
          message: `Invalid request: ${message}`,
          statusCode: 400,
          retryable: false,
        }
      default:
        return {
          type: 'server_error',
          message: message || 'AI service error occurred',
          statusCode: 502,
          retryable: true,
        }
    }
  }

  // Handle other Error instances
  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message,
      statusCode: 500,
      retryable: false,
    }
  }

  return {
    type: 'unknown',
    message: 'An unknown error occurred',
    statusCode: 500,
    retryable: false,
  }
}

/**
 * Attempts to stream text with model fallback on failure
 */
async function streamWithFallback(
  messages: Message[],
  options: {
    temperature: number
    maxTokens: number
    preferredModel?: string
  }
) {
  const models = options.preferredModel 
    ? [options.preferredModel, ...MODEL_FALLBACKS]
    : MODEL_FALLBACKS

  let lastError: unknown

  for (const modelName of models) {
    try {
      console.log(`[AI] Attempting to use model: ${modelName}`)
      
      const result = await streamText({
        model: openrouter(modelName),
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        // Enhanced configuration for better responses
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.1,
      })

      console.log(`[AI] Successfully using model: ${modelName}`)
      return { result, modelUsed: modelName }
    } catch (error) {
      console.warn(`[AI] Model ${modelName} failed:`, error)
      lastError = error
      
      const classifiedError = classifyOpenRouterError(error)
      
      // Don't try fallbacks for non-retryable errors
      if (!classifiedError.retryable) {
        throw error
      }
      
      // Continue to next model for retryable errors
      continue
    }
  }

  // All models failed
  throw lastError || new Error('All AI models are currently unavailable')
}

/**
 * Logs request telemetry for monitoring and analytics
 */
function logRequestTelemetry(telemetry: RequestTelemetry) {
  if (ENVIRONMENT === 'development') {
    console.log('[AI Telemetry]', {
      requestId: telemetry.requestId,
      model: telemetry.model,
      messageCount: telemetry.messageCount,
      duration: telemetry.duration,
      statusCode: telemetry.statusCode,
      error: telemetry.error,
    })
  }
  
  // In production, this would send to analytics service
  // TODO: Integrate with chat analytics table for persistence
}

/**
 * Sets comprehensive security and CORS headers for the API response
 */
function setSecurityHeaders(response: Response): Response {
  // Clone the response to modify headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })

  // Enhanced security headers
  newResponse.headers.set('X-Content-Type-Options', 'nosniff')
  newResponse.headers.set('X-Frame-Options', 'DENY')
  newResponse.headers.set('X-XSS-Protection', '1; mode=block')
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  newResponse.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  newResponse.headers.set('X-DNS-Prefetch-Control', 'off')
  
  // Content Security Policy
  newResponse.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none';")
  
  // CORS headers with strict origin validation
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  const requestOrigin = response.headers.get('origin')
  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
  
  newResponse.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  newResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  newResponse.headers.set('Access-Control-Allow-Credentials', 'true')
  newResponse.headers.set('Access-Control-Max-Age', '86400')
  
  return newResponse
}

/**
 * Enhanced POST handler for chat API with comprehensive error handling and features
 */
// Rate limiting storage (in production, use Redis or database)
const rateLimitMap = new Map<string, { requests: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20 // 20 requests per minute

/**
 * Implements rate limiting based on IP address and user ID
 */
function checkRateLimit(clientIP: string, userId?: string): { allowed: boolean; remaining: number; resetTime: number } {
  const identifier = userId || clientIP
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW
  
  // Clean up old entries
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetTime < now) {
      rateLimitMap.delete(key)
    }
  }
  
  const current = rateLimitMap.get(identifier) || { requests: 0, resetTime: now + RATE_LIMIT_WINDOW }
  
  if (current.resetTime < now) {
    // Reset window
    current.requests = 0
    current.resetTime = now + RATE_LIMIT_WINDOW
  }
  
  const allowed = current.requests < RATE_LIMIT_MAX_REQUESTS
  
  if (allowed) {
    current.requests++
    rateLimitMap.set(identifier, current)
  }
  
  return {
    allowed,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.requests),
    resetTime: current.resetTime
  }
}

export async function POST(req: Request) {
  const requestId = nanoid()
  const startTime = Date.now()
  const headersList = headers()
  const userAgent = headersList.get('user-agent') || 'unknown'
  const clientIP = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  
  // Security: Validate CSRF protection and origin
  const csrfError = await validateSecureRequest(req as any)
  if (csrfError) {
    return setSecurityHeaders(csrfError)
  }
  
  // Security: Basic request validation
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return setSecurityHeaders(new Response(
      JSON.stringify({ error: { message: 'Content-Type must be application/json', type: 'invalid_request' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    ))
  }
  
  let telemetry: RequestTelemetry = {
    requestId,
    timestamp: startTime,
    model: 'unknown',
    messageCount: 0,
    requestSize: 0,
    statusCode: 500,
  }

  try {
    // Security: Validate request size before processing
    const contentLength = req.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
      const error = new Response(
        JSON.stringify({ error: { message: 'Request too large', type: 'invalid_request', requestId } }),
        { status: 413, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
      )
      return setSecurityHeaders(error)
    }
    
    // Get request body and calculate size
    const rawBody = await req.text()
    telemetry.requestSize = new Blob([rawBody]).size
    
    // Security: Additional size check after reading body
    if (telemetry.requestSize > 1024 * 1024) {
      const error = new Response(
        JSON.stringify({ error: { message: 'Request body too large', type: 'invalid_request', requestId } }),
        { status: 413, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
      )
      return setSecurityHeaders(error)
    }
    
    // Parse and validate request
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch (error) {
      throw new Error('Invalid JSON in request body')
    }

    const validatedRequest = validateChatRequest(body, userSession?.userId)
    telemetry.messageCount = validatedRequest.messages.length
    telemetry.userId = validatedRequest.userId
    telemetry.chatId = validatedRequest.chatId

    console.log(`[AI] Processing chat request ${requestId}`, {
      userId: validatedRequest.userId,
      chatId: validatedRequest.chatId,
      messageCount: validatedRequest.messages.length,
      requestSize: telemetry.requestSize,
      clientIP,
      userAgent: userAgent.substring(0, 100), // Truncate for logging
    })

    // SECURITY FIX: Enforce authentication for chat API
    let userSession: UserSession | null = null
    
    if (REQUIRE_AUTH) {
      // Strict authentication enforcement
      const authError = await requireAuthentication(req)
      if (authError) {
        telemetry.error = 'Authentication required'
        telemetry.statusCode = 401
        logRequestTelemetry(telemetry)
        return setSecurityHeaders(authError)
      }
      
      // Get validated session after authentication check
      const sessionValidation = await validateUserSession(req)
      if (!sessionValidation.session) {
        const error = new Response(
          JSON.stringify({
            error: {
              message: 'Valid user session required',
              type: 'authentication_required',
              requestId,
            },
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
            },
          }
        )
        return setSecurityHeaders(error)
      }
      
      userSession = sessionValidation.session
      telemetry.userId = userSession.userId
      
      console.log(`[AI] Authenticated user ${userSession.userId}`, {
        email: userSession.email,
        emailVerified: userSession.emailVerified,
      })
      
      // Security: Check rate limit for authenticated user
      const rateLimit = checkRateLimit(clientIP, userSession.userId)
      if (!rateLimit.allowed) {
        const error = new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_exceeded',
              requestId,
              resetTime: rateLimit.resetTime
            },
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
              'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
              'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString(),
              'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
            },
          }
        )
        return setSecurityHeaders(error)
      }
    } else {
      // Optional authentication mode (development only)
      console.warn(`[AI] Authentication disabled for request ${requestId} - development mode only`)
      
      // Security: Still apply rate limiting even without authentication
      const rateLimit = checkRateLimit(clientIP)
      if (!rateLimit.allowed) {
        const error = new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_exceeded',
              requestId,
              resetTime: rateLimit.resetTime
            },
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': requestId,
              'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
              'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString(),
              'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
            },
          }
        )
        return setSecurityHeaders(error)
      }
      
      try {
        const sessionValidation = await validateUserSession(req)
        if (sessionValidation.session) {
          userSession = sessionValidation.session
          telemetry.userId = userSession.userId
        }
      } catch (authError) {
        console.warn(`[AI] Optional authentication failed for request ${requestId}:`, authError)
      }
    }

    // Stream text with model fallback
    const { result, modelUsed } = await streamWithFallback(
      validatedRequest.messages,
      {
        temperature: validatedRequest.temperature,
        maxTokens: validatedRequest.maxTokens,
        preferredModel: validatedRequest.model,
      }
    )

    telemetry.model = modelUsed
    telemetry.duration = Date.now() - startTime
    telemetry.statusCode = 200

    console.log(`[AI] Successfully generated response for ${requestId}`, {
      model: modelUsed,
      duration: telemetry.duration,
    })

    // Convert to data stream response for proper frontend integration
    const responseHeaders = {
      'X-Request-ID': requestId,
      'X-Model-Used': modelUsed,
      'X-Response-Time': telemetry.duration.toString(),
      // Add authentication context headers if user is authenticated
      ...(userSession ? createAuthContext(userSession) : {}),
    }
    
    const streamResponse = result.toDataStreamResponse({
      headers: responseHeaders,
    })

    // Apply security headers and return response
    const secureResponse = setSecurityHeaders(streamResponse)
    
    // Log successful telemetry
    logRequestTelemetry(telemetry)
    
    return secureResponse

  } catch (error) {
    const duration = Date.now() - startTime
    const classifiedError = classifyOpenRouterError(error)
    
    telemetry.duration = duration
    telemetry.error = classifiedError.message
    telemetry.statusCode = classifiedError.statusCode

    console.error(`[AI] Request ${requestId} failed:`, {
      error: classifiedError.message,
      type: classifiedError.type,
      duration,
      statusCode: classifiedError.statusCode,
      retryable: classifiedError.retryable,
    })

    // Log error telemetry
    logRequestTelemetry(telemetry)

    // Return appropriate error response
    const errorResponse = new Response(
      JSON.stringify({
        error: {
          message: classifiedError.message,
          type: classifiedError.type,
          requestId,
          retryable: classifiedError.retryable,
        },
      }),
      {
        status: classifiedError.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      }
    )

    return setSecurityHeaders(errorResponse)
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  })
}