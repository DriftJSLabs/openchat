import { NextRequest, NextResponse } from 'next/server';

// CSRF Token utilities
export class CSRFProtection {
  private static readonly CSRF_TOKEN_HEADER = 'x-csrf-token';
  private static readonly CSRF_COOKIE_NAME = 'csrf-token';

  // Generate a secure CSRF token
  public static generateToken(): string {
    const tokenArray = new Uint8Array(32);
    crypto.getRandomValues(tokenArray);
    return btoa(String.fromCharCode(...tokenArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Validate CSRF token using double-submit cookie pattern
  public static validateToken(request: NextRequest): boolean {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const tokenFromHeader = request.headers.get(this.CSRF_TOKEN_HEADER);
    const tokenFromCookie = request.cookies.get(this.CSRF_COOKIE_NAME)?.value;

    // Both token sources must exist and match
    return tokenFromHeader && tokenFromCookie && tokenFromHeader === tokenFromCookie;
  }

  // Create response with CSRF token cookie
  public static setTokenCookie(response: NextResponse, token?: string): void {
    const csrfToken = token || this.generateToken();
    
    response.cookies.set(this.CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Client needs to read this for double-submit
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });
  }

  // Middleware function for API routes
  public static middleware(request: NextRequest): NextResponse | null {
    if (!this.validateToken(request)) {
      return new NextResponse(
        JSON.stringify({ error: 'CSRF token validation failed' }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    return null; // Continue processing
  }
}