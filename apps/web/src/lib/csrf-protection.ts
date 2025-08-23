/**
 * CSRF Protection utilities for API routes
 * Implements double-submit cookie pattern with cryptographic verification
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

// CSRF configuration
const CSRF_TOKEN_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_COOKIE_NAME = 'csrf-token';
const TOKEN_LENGTH = 32;
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export interface CSRFValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Generates a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a secure hash of the token for verification
 */
async function hashToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates CSRF token using double-submit pattern
 */
export async function validateCSRFToken(request: NextRequest): Promise<CSRFValidationResult> {
  try {
    // Skip CSRF validation for GET, HEAD, OPTIONS requests
    const method = request.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return { valid: true };
    }

    // Get token from header
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (!headerToken) {
      return {
        valid: false,
        error: 'Missing CSRF token in header'
      };
    }

    // Get token from cookie
    const cookieStore = cookies();
    const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    if (!cookieToken) {
      return {
        valid: false,
        error: 'Missing CSRF token in cookie'
      };
    }

    // Basic format validation
    if (!/^[a-f0-9]{64}$/.test(headerToken) || !/^[a-f0-9]{64}$/.test(cookieToken)) {
      return {
        valid: false,
        error: 'Invalid CSRF token format'
      };
    }

    // Compare tokens using constant-time comparison
    if (!constantTimeCompare(headerToken, cookieToken)) {
      return {
        valid: false,
        error: 'CSRF token mismatch'
      };
    }

    // Additional validation with server secret if available
    const serverSecret = process.env.CSRF_SECRET;
    if (serverSecret) {
      const expectedHash = await hashToken(headerToken, serverSecret);
      const providedHash = request.headers.get('X-CSRF-Hash');
      
      if (!providedHash || !constantTimeCompare(expectedHash, providedHash)) {
        return {
          valid: false,
          error: 'CSRF token verification failed'
        };
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('[CSRF] Validation error:', error);
    return {
      valid: false,
      error: 'CSRF validation failed'
    };
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Creates CSRF protection response headers
 */
export function createCSRFHeaders(token: string): Record<string, string> {
  return {
    'Set-Cookie': `${CSRF_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${TOKEN_EXPIRY / 1000}; Path=/`,
    'X-CSRF-Token': token
  };
}

/**
 * Middleware function to enforce CSRF protection
 */
export async function requireCSRFProtection(request: NextRequest): Promise<Response | null> {
  const validation = await validateCSRFToken(request);
  
  if (!validation.valid) {
    return new Response(
      JSON.stringify({
        error: {
          message: validation.error || 'CSRF protection failed',
          type: 'csrf_validation_failed',
        },
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
  
  return null;
}

/**
 * Validates Origin header to prevent CSRF attacks
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  
  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      `https://${host}`,
      `http://${host}`, // for development
      'http://localhost:3000',
      'http://localhost:3001'
    ];

    return allowedOrigins.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return originUrl.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Comprehensive request validation including CSRF and Origin checks
 */
export async function validateSecureRequest(request: NextRequest): Promise<Response | null> {
  // Validate Origin header
  if (!validateOrigin(request)) {
    return new Response(
      JSON.stringify({
        error: {
          message: 'Invalid request origin',
          type: 'invalid_origin',
        },
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Validate CSRF token
  return await requireCSRFProtection(request);
}