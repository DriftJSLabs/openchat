import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

// Simple in-memory rate limiting (use Redis in production)
class MemoryStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  increment(key: string, windowMs: number): { totalHits: number; resetTime: number } {
    const now = Date.now();
    const current = this.store.get(key);

    if (!current || now > current.resetTime) {
      const resetTime = now + windowMs;
      this.store.set(key, { count: 1, resetTime });
      return { totalHits: 1, resetTime };
    }

    current.count++;
    this.store.set(key, current);
    return { totalHits: current.count, resetTime: current.resetTime };
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (now > value.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const store = new MemoryStore();

// Cleanup expired entries every 5 minutes
setInterval(() => store.cleanup(), 5 * 60 * 1000);

export function rateLimit(config: RateLimitConfig) {
  return (request: NextRequest): NextResponse | null => {
    const key = config.keyGenerator 
      ? config.keyGenerator(request)
      : getClientIP(request);

    const { totalHits, resetTime } = store.increment(key, config.windowMs);

    const remainingHits = Math.max(0, config.maxRequests - totalHits);
    const msUntilReset = Math.max(0, resetTime - Date.now());

    if (totalHits > config.maxRequests) {
      return new NextResponse(
        JSON.stringify({ 
          error: 'Too many requests',
          retryAfter: Math.ceil(msUntilReset / 1000)
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'Retry-After': Math.ceil(msUntilReset / 1000).toString(),
          }
        }
      );
    }

    // Add rate limit headers to successful responses (will be added by caller)
    return null;
  };
}

function getClientIP(request: NextRequest): string {
  // Try various headers for client IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfIP = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfIP) {
    return cfIP;
  }
  
  // Fallback to a default if no IP is found
  return 'unknown';
}

// Pre-configured rate limiters
export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
});

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  maxRequests: 10, // 10 requests per minute
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
});