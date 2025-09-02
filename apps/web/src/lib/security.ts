import { NextRequest, NextResponse } from 'next/server';
import { HTTP_STATUS, ERROR_MESSAGES, STORAGE_KEYS } from './constants';

// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export function rateLimit(config: RateLimitConfig) {
  return (req: NextRequest): NextResponse | null => {
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const key = `${ip}`;
    
    const existing = rateLimitMap.get(key);
    
    if (!existing || now > existing.resetTime) {
      // Reset window
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return null; // Allow request
    }
    
    if (existing.count >= config.maxRequests) {
      return new NextResponse(
        JSON.stringify({ 
          error: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          retryAfter: Math.ceil((existing.resetTime - now) / 1000)
        }),
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((existing.resetTime - now) / 1000).toString()
          }
        }
      );
    }
    
    // Increment counter
    existing.count++;
    return null; // Allow request
  };
}

// CSRF protection using double submit cookie pattern
export function csrfProtection(req: NextRequest): NextResponse | null {
  // Skip CSRF for GET requests
  if (req.method === 'GET') return null;
  
  const csrfTokenFromHeader = req.headers.get('x-csrf-token');
  const csrfTokenFromCookie = req.cookies.get(STORAGE_KEYS.CSRF_TOKEN)?.value;
  
  // Allow requests from same origin
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return null; // Same origin, allow
      }
    } catch {
      // Invalid origin URL
    }
  }
  
  // For API calls, require CSRF token
  if (!csrfTokenFromHeader || !csrfTokenFromCookie || csrfTokenFromHeader !== csrfTokenFromCookie) {
    return new NextResponse(
      JSON.stringify({ error: ERROR_MESSAGES.CSRF_INVALID }),
      {
        status: HTTP_STATUS.FORBIDDEN,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  return null; // Allow request
}

// Generate CSRF token
export function generateCSRFToken(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer));
}

// Middleware wrapper for API routes
export function withSecurity(
  handler: (req: NextRequest) => Promise<Response>,
  options: {
    rateLimit?: RateLimitConfig;
    csrf?: boolean;
  } = {}
) {
  return async (req: NextRequest): Promise<Response> => {
    // Apply rate limiting
    if (options.rateLimit) {
      const rateLimitResponse = rateLimit(options.rateLimit)(req);
      if (rateLimitResponse) return rateLimitResponse;
    }
    
    // Apply CSRF protection
    if (options.csrf) {
      const csrfResponse = csrfProtection(req);
      if (csrfResponse) return csrfResponse;
    }
    
    return handler(req);
  };
}