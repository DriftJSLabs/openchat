/**
 * Authentication utilities for server-side API routes
 * Provides session validation and user context extraction
 */

import { cookies } from 'next/headers'

/**
 * User session information extracted from authentication
 */
export interface UserSession {
  userId: string
  email: string
  name: string
  emailVerified: boolean
}

/**
 * Result of session validation
 */
export interface SessionValidationResult {
  session: UserSession | null
  error?: string
}

/**
 * Validates user session from request headers and cookies
 * Integrates with the Better Auth session management
 * 
 * @param request - The incoming request object
 * @returns Session validation result with user info or error
 */
export async function validateUserSession(request: Request): Promise<SessionValidationResult> {
  try {
    const cookieStore = cookies()
    
    // Extract session token from cookies
    // Better Auth typically stores session tokens in cookies
    const sessionToken = cookieStore.get('session')?.value || 
                         cookieStore.get('better-auth.session-token')?.value
    
    if (!sessionToken) {
      return {
        session: null,
        error: 'No session token found'
      }
    }

    // Extract authorization header as fallback
    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    const token = bearerToken || sessionToken

    if (!token) {
      return {
        session: null,
        error: 'No authentication token provided'
      }
    }

    // Validate session with the server auth endpoint
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const sessionResponse = await fetch(`${serverUrl}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Cookie': `session=${token}`,
        'Authorization': bearerToken ? `Bearer ${bearerToken}` : '',
        'Content-Type': 'application/json',
      },
    })

    if (!sessionResponse.ok) {
      return {
        session: null,
        error: `Session validation failed: ${sessionResponse.status}`
      }
    }

    const sessionData = await sessionResponse.json()

    // Validate session data structure
    if (!sessionData.user?.id) {
      return {
        session: null,
        error: 'Invalid session data received'
      }
    }

    const userSession: UserSession = {
      userId: sessionData.user.id,
      email: sessionData.user.email,
      name: sessionData.user.name,
      emailVerified: sessionData.user.emailVerified || false,
    }

    return {
      session: userSession,
      error: undefined
    }

  } catch (error) {
    console.error('[Auth] Session validation error:', error)
    
    return {
      session: null,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    }
  }
}

/**
 * Extracts user ID from request headers or session
 * Used for optional authentication where user context is helpful but not required
 * 
 * @param request - The incoming request object
 * @returns User ID if available, null otherwise
 */
export async function extractUserContext(request: Request): Promise<string | null> {
  try {
    const validation = await validateUserSession(request)
    return validation.session?.userId || null
  } catch (error) {
    // Silent failure for optional authentication
    console.warn('[Auth] Failed to extract user context:', error)
    return null
  }
}

/**
 * Middleware function to require authentication for protected routes
 * Returns error response if authentication fails
 * 
 * @param request - The incoming request object
 * @returns Response object if authentication fails, null if success
 */
export async function requireAuthentication(request: Request): Promise<Response | null> {
  const validation = await validateUserSession(request)
  
  if (!validation.session) {
    return new Response(
      JSON.stringify({
        error: {
          message: validation.error || 'Authentication required',
          type: 'authentication_required',
        },
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        },
      }
    )
  }
  
  return null
}

/**
 * Creates authentication context for API responses
 * Includes user information in response headers for debugging
 * 
 * @param session - The validated user session
 * @returns Headers object with user context
 */
export function createAuthContext(session: UserSession): Record<string, string> {
  return {
    'X-User-ID': session.userId,
    'X-User-Email': session.email,
    'X-User-Verified': session.emailVerified.toString(),
  }
}