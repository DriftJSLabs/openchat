import { NextRequest } from "next/server";

/**
 * SECURITY: Authentication proxy with header injection protection
 * This proxy securely forwards authentication requests to the auth server
 * while preventing header injection and other security vulnerabilities.
 */

/**
 * SECURITY FIX: Secure authentication proxy for GET requests
 */
export async function GET(request: NextRequest) {
  try {
    // Security: Validate server URL configuration
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    if (!serverUrl) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: Validate and sanitize URL
    const url = new URL(request.url);
    const authPath = sanitizeAuthPath(url.pathname);
    
    // Security: Validate query parameters
    const sanitizedSearch = sanitizeQueryString(url.search);
    const serverAuthUrl = `${serverUrl}${authPath}${sanitizedSearch}`;
    
    // Security: Validate server URL is trusted
    if (!isValidServerUrl(serverAuthUrl, serverUrl)) {
      return new Response(
        JSON.stringify({ error: 'Invalid server URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Security: Filter and sanitize headers to prevent injection
    const sanitizedHeaders = sanitizeProxyHeaders(request.headers);
    
    const response = await fetch(serverAuthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenChat-Proxy/1.0',
        ...sanitizedHeaders,
      },
      // Security: Set timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    // Security: Validate response
    if (!response.ok && response.status >= 500) {
      return new Response(
        JSON.stringify({ error: 'Authentication service unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const responseText = await response.text();
    
    // Security: Sanitize response headers
    const responseHeaders = sanitizeResponseHeaders(response.headers);
    
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...responseHeaders,
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Auth Proxy] GET request failed:', error);
    return new Response(
      JSON.stringify({ error: 'Authentication request failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * SECURITY FIX: Secure authentication proxy for POST requests
 */
export async function POST(request: NextRequest) {
  try {
    // Security: Validate server URL configuration
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    if (!serverUrl) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: Validate request size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 100) { // 100KB limit
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: Validate and sanitize URL
    const url = new URL(request.url);
    const authPath = sanitizeAuthPath(url.pathname);
    
    // Security: Validate query parameters
    const sanitizedSearch = sanitizeQueryString(url.search);
    const serverAuthUrl = `${serverUrl}${authPath}${sanitizedSearch}`;
    
    // Security: Validate server URL is trusted
    if (!isValidServerUrl(serverAuthUrl, serverUrl)) {
      return new Response(
        JSON.stringify({ error: 'Invalid server URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Security: Validate and sanitize request body
    const body = await request.text();
    const sanitizedBody = sanitizeRequestBody(body);
    
    // Security: Filter and sanitize headers to prevent injection
    const sanitizedHeaders = sanitizeProxyHeaders(request.headers);
    
    const response = await fetch(serverAuthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenChat-Proxy/1.0',
        ...sanitizedHeaders,
      },
      body: sanitizedBody,
      // Security: Set timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    // Security: Validate response
    if (!response.ok && response.status >= 500) {
      return new Response(
        JSON.stringify({ error: 'Authentication service unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const responseText = await response.text();
    
    // Security: Sanitize response headers
    const responseHeaders = sanitizeResponseHeaders(response.headers);
    
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...responseHeaders,
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Auth Proxy] POST request failed:', error);
    return new Response(
      JSON.stringify({ error: 'Authentication request failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * SECURITY: Helper functions for secure proxy operation
 */

/**
 * Sanitizes authentication path to prevent path traversal
 */
function sanitizeAuthPath(pathname: string): string {
  // Only allow /api/auth paths
  if (!pathname.startsWith('/api/auth')) {
    return '/api/auth';
  }
  
  // Remove any path traversal attempts
  const sanitized = pathname.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  
  // Validate path format
  if (!/^\/api\/auth(\/[a-zA-Z0-9._-]+)*$/.test(sanitized)) {
    return '/api/auth';
  }
  
  return sanitized;
}

/**
 * Sanitizes query string to prevent injection
 */
function sanitizeQueryString(search: string): string {
  if (!search) return '';
  
  try {
    const params = new URLSearchParams(search);
    const sanitizedParams = new URLSearchParams();
    
    // Only allow specific auth-related parameters
    const allowedParams = ['code', 'state', 'error', 'error_description', 'session_state'];
    
    for (const [key, value] of params.entries()) {
      if (allowedParams.includes(key) && typeof value === 'string' && value.length < 1000) {
        // Basic sanitization - remove dangerous characters
        const sanitizedValue = value.replace(/[<>"'&]/g, '');
        sanitizedParams.set(key, sanitizedValue);
      }
    }
    
    const result = sanitizedParams.toString();
    return result ? `?${result}` : '';
  } catch (error) {
    console.warn('[Auth Proxy] Failed to sanitize query string:', error);
    return '';
  }
}

/**
 * Validates if the server URL is trusted
 */
function isValidServerUrl(fullUrl: string, baseUrl: string): boolean {
  try {
    const url = new URL(fullUrl);
    const base = new URL(baseUrl);
    
    // Must be same origin as configured server
    return url.origin === base.origin;
  } catch (error) {
    return false;
  }
}

/**
 * Sanitizes proxy headers to prevent injection
 */
function sanitizeProxyHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  // List of headers to skip for security
  const skipHeaders = [
    'host', 'content-length', 'transfer-encoding', 'accept-encoding', 
    'content-encoding', 'connection', 'upgrade', 'proxy-authorization',
    'te', 'trailer'
  ];
  
  // List of allowed headers
  const allowedHeaders = [
    'authorization', 'cookie', 'accept', 'accept-language', 'cache-control',
    'pragma', 'referer', 'origin', 'x-requested-with'
  ];
  
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    
    if (!skipHeaders.includes(lowerKey) && allowedHeaders.includes(lowerKey)) {
      // Basic header value sanitization
      const sanitizedValue = value.replace(/[\r\n]/g, '').substring(0, 2048);
      if (sanitizedValue) {
        sanitized[key] = sanitizedValue;
      }
    }
  });
  
  return sanitized;
}

/**
 * Sanitizes response headers
 */
function sanitizeResponseHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  // Headers to pass through from auth server
  const allowedHeaders = [
    'set-cookie', 'location', 'cache-control', 'expires', 'etag',
    'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'
  ];
  
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    
    if (allowedHeaders.includes(lowerKey)) {
      // Basic sanitization
      const sanitizedValue = value.replace(/[\r\n]/g, '');
      if (sanitizedValue) {
        sanitized[key] = sanitizedValue;
      }
    }
  });
  
  return sanitized;
}

/**
 * Sanitizes request body to prevent injection
 */
function sanitizeRequestBody(body: string): string {
  if (!body) return '';
  
  try {
    // Parse as JSON to validate structure
    const parsed = JSON.parse(body);
    
    // Re-stringify to ensure clean JSON
    return JSON.stringify(parsed);
  } catch (error) {
    // If not valid JSON, return empty body
    console.warn('[Auth Proxy] Invalid JSON in request body');
    return '';
  }
}