import { ORPCError } from "@orpc/server";
import type { Context } from "../lib/context";
import { ErrorFactory, ErrorLogger } from "../lib/error-handler";

/**
 * Security configuration types
 */
interface SecurityConfig {
  enableCSRFProtection?: boolean;
  allowedOrigins?: string[];
  maxRequestSize?: number;
  enableSQLInjectionProtection?: boolean;
  enableXSSProtection?: boolean;
  enableContentTypeValidation?: boolean;
  maxConcurrentRequests?: number;
  blockSuspiciousPatterns?: boolean;
}

/**
 * Request validation configuration
 */
interface ValidationConfig {
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectDepth?: number;
  maxProperties?: number;
  allowedFileTypes?: string[];
  blockedKeywords?: string[];
}

/**
 * Default security configuration
 */
const defaultSecurityConfig: SecurityConfig = {
  enableCSRFProtection: true,
  allowedOrigins: ['http://localhost:3000', 'https://openchat.vercel.app'],
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  enableSQLInjectionProtection: true,
  enableXSSProtection: true,
  enableContentTypeValidation: true,
  maxConcurrentRequests: 100,
  blockSuspiciousPatterns: true,
};

/**
 * Default validation configuration
 */
const defaultValidationConfig: ValidationConfig = {
  maxStringLength: 50000,
  maxArrayLength: 1000,
  maxObjectDepth: 10,
  maxProperties: 100,
  allowedFileTypes: ['.txt', '.md', '.json', '.csv'],
  blockedKeywords: [
    'script', 'javascript:', 'vbscript:', 'onload', 'onerror',
    'eval(', 'document.', 'window.', 'alert(', 'confirm(',
    'union select', 'drop table', 'delete from', 'insert into',
    '1=1', '1 or 1', 'or 1=1', 'and 1=1'
  ],
};

/**
 * Suspicious pattern detection
 */
const suspiciousPatterns = [
  // SQL Injection patterns
  /(\bUNION\b.*\bSELECT\b)/i,
  /(\bDROP\b.*\bTABLE\b)/i,
  /(\bDELETE\b.*\bFROM\b)/i,
  /(\bINSERT\b.*\bINTO\b)/i,
  /(\bUPDATE\b.*\bSET\b)/i,
  /(\b(OR|AND)\b.*\b1\s*=\s*1\b)/i,
  
  // XSS patterns
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:[^'"]*['"]/gi,
  /vbscript:[^'"]*['"]/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  
  // Path traversal
  /\.\.[\/\\]/g,
  /(\/|\\)etc(\/|\\)passwd/g,
  /(\/|\\)windows(\/|\\)system32/g,
  
  // Command injection
  /[;&|`$(){}[\]]/g,
  /\b(wget|curl|nc|netcat|ping|nslookup)\b/i,
];

/**
 * Content Security Policy (CSP) headers
 */
const cspDirectives = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  'style-src': "'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src': "'self' https://fonts.gstatic.com",
  'img-src': "'self' data: https:",
  'connect-src': "'self' https://api.openai.com https://api.anthropic.com",
  'frame-ancestors': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
};

/**
 * Security Headers middleware factory
 */
export function createSecurityHeaders(config: SecurityConfig = {}) {
  const finalConfig = { ...defaultSecurityConfig, ...config };

  return async ({ context, next }: { context: Context; next: () => any }) => {

    try {
      // Add security headers to response (if supported by runtime)
      const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': Object.entries(cspDirectives)
          .map(([directive, value]) => `${directive} ${value}`)
          .join('; '),
      };

      // CSRF protection
      if (finalConfig.enableCSRFProtection) {
        const origin = context.origin;
        if (origin && !finalConfig.allowedOrigins?.includes(origin)) {
          throw ErrorFactory.forbidden(
            "request",
            "access from this origin",
            context
          ).toORPCError();
        }
      }

      // Set security context for downstream use
      const enhancedContext = {
        ...context,
        security: {
          headers: securityHeaders,
          config: finalConfig,
        },
      };

      return await next();
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Input validation and sanitization middleware
 */
export function createInputValidator(config: ValidationConfig = {}) {
  const finalConfig = { ...defaultValidationConfig, ...config };

  return async ({ context, input, next }: { context: Context; input: any; next: () => any }) => {

    try {
      if (input) {
        validateInput(input, finalConfig, context);
      }

      return await next();
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      
      ErrorLogger.log(ErrorFactory.invalidInput(
        "Input validation failed",
        { error: error.message },
        context
      ));
      throw ErrorFactory.invalidInput(
        "Invalid input data",
        undefined,
        context
      ).toORPCError();
    }
  };
}

/**
 * Recursive input validation function
 */
function validateInput(
  obj: any,
  config: ValidationConfig,
  context: Context,
  depth = 0,
  path = 'root'
): void {
  // Check maximum depth
  if (depth > (config.maxObjectDepth || 10)) {
    throw ErrorFactory.invalidInput(
      `Object depth exceeds maximum allowed depth at ${path}`,
      { maxDepth: config.maxObjectDepth, currentDepth: depth },
      context
    );
  }

  if (typeof obj === 'string') {
    validateString(obj, config, context, path);
  } else if (Array.isArray(obj)) {
    validateArray(obj, config, context, depth, path);
  } else if (typeof obj === 'object' && obj !== null) {
    validateObject(obj, config, context, depth, path);
  }
}

/**
 * String validation
 */
function validateString(
  str: string,
  config: ValidationConfig,
  context: Context,
  path: string
): void {
  // Check length
  if (str.length > (config.maxStringLength || 50000)) {
    throw ErrorFactory.invalidInput(
      `String length exceeds maximum at ${path}`,
      { maxLength: config.maxStringLength, actualLength: str.length },
      context
    );
  }

  // Check for suspicious patterns
  if (config.blockSuspiciousPatterns !== false) {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(str)) {
        ErrorLogger.log(ErrorFactory.invalidInput(
          `Suspicious pattern detected at ${path}`,
          { pattern: pattern.toString(), value: str.slice(0, 100) },
          context
        ));
        throw ErrorFactory.invalidInput(
          "Input contains potentially malicious content",
          undefined,
          context
        );
      }
    }
  }

  // Check for blocked keywords
  if (config.blockedKeywords) {
    const lowerStr = str.toLowerCase();
    for (const keyword of config.blockedKeywords) {
      if (lowerStr.includes(keyword.toLowerCase())) {
        ErrorLogger.log(ErrorFactory.invalidInput(
          `Blocked keyword detected at ${path}`,
          { keyword, value: str.slice(0, 100) },
          context
        ));
        throw ErrorFactory.invalidInput(
          "Input contains blocked content",
          undefined,
          context
        );
      }
    }
  }
}

/**
 * Array validation
 */
function validateArray(
  arr: any[],
  config: ValidationConfig,
  context: Context,
  depth: number,
  path: string
): void {
  // Check length
  if (arr.length > (config.maxArrayLength || 1000)) {
    throw ErrorFactory.invalidInput(
      `Array length exceeds maximum at ${path}`,
      { maxLength: config.maxArrayLength, actualLength: arr.length },
      context
    );
  }

  // Validate each element
  arr.forEach((item, index) => {
    validateInput(item, config, context, depth + 1, `${path}[${index}]`);
  });
}

/**
 * Object validation
 */
function validateObject(
  obj: object,
  config: ValidationConfig,
  context: Context,
  depth: number,
  path: string
): void {
  const keys = Object.keys(obj);
  
  // Check number of properties
  if (keys.length > (config.maxProperties || 100)) {
    throw ErrorFactory.invalidInput(
      `Object has too many properties at ${path}`,
      { maxProperties: config.maxProperties, actualProperties: keys.length },
      context
    );
  }

  // Validate each property
  keys.forEach(key => {
    // Validate key name
    validateString(key, config, context, `${path}.${key}(key)`);
    
    // Validate value
    validateInput(
      (obj as any)[key],
      config,
      context,
      depth + 1,
      `${path}.${key}`
    );
  });
}

/**
 * Anti-automation and bot detection middleware
 */
export function createBotDetection() {
  const suspiciousUserAgents = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /php/i,
  ];

  const humanHeaders = [
    'accept-language',
    'accept-encoding',
    'cache-control',
    'sec-fetch-site',
    'sec-fetch-mode',
  ];

  return async ({ context, next }: { context: Context; next: () => any }) => {

    try {
      const userAgent = context.userAgent || '';
      
      // Check for suspicious user agents
      const isSuspiciousUA = suspiciousUserAgents.some(pattern => 
        pattern.test(userAgent)
      );

      // Check for missing human-like headers (in a real implementation)
      const missingHumanHeaders = humanHeaders.filter(header => 
        !context.headers?.[header]
      );

      // Calculate suspicion score
      let suspicionScore = 0;
      if (isSuspiciousUA) suspicionScore += 50;
      if (missingHumanHeaders.length > 3) suspicionScore += 30;
      if (!userAgent) suspicionScore += 20;

      // Log suspicious activity
      if (suspicionScore > 70) {
        ErrorLogger.log(ErrorFactory.invalidInput(
          "Suspicious bot activity detected",
          {
            userAgent,
            suspicionScore,
            missingHeaders: missingHumanHeaders,
            ip: context.ip,
          },
          context
        ));

        // In production, you might want to implement CAPTCHA or additional verification
        throw ErrorFactory.rateLimitExceeded(
          1, 60000, context
        ).toORPCError();
      }

      return await next();
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Content type validation middleware
 */
export function createContentTypeValidator(allowedTypes: string[] = ['application/json']) {
  return async ({ context, next }: { context: Context; next: () => any }) => {

    try {
      const contentType = context.headers?.['content-type'] || '';
      
      if (contentType && !allowedTypes.some(type => contentType.includes(type))) {
        throw ErrorFactory.invalidInput(
          "Invalid content type",
          { 
            contentType, 
            allowedTypes,
            received: contentType.split(';')[0] 
          },
          context
        ).toORPCError();
      }

      return await next();
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Request size validation middleware
 */
export function createRequestSizeValidator(maxSize: number = 10 * 1024 * 1024) {
  return async ({ context, input, next }: { context: Context; input: any; next: () => any }) => {

    try {
      if (input) {
        const requestSize = JSON.stringify(input).length;
        
        if (requestSize > maxSize) {
          throw ErrorFactory.invalidInput(
            "Request size exceeds maximum allowed size",
            { 
              maxSize, 
              actualSize: requestSize,
              exceedsBy: requestSize - maxSize 
            },
            context
          ).toORPCError();
        }
      }

      return await next();
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Enhanced authentication middleware with additional security checks
 */
export function createEnhancedAuth() {
  return async ({ context, next }: { context: Context; next: () => any }) => {

    try {
      // Basic authentication check
      if (!context.session?.user) {
        throw ErrorFactory.unauthorized(context).toORPCError();
      }

      const user = context.session.user;

      // Check for account suspension/deactivation
      // In a real implementation, you'd check user status from database
      // if (user.status === 'suspended') {
      //   throw ErrorFactory.forbidden("account", "access", context).toORPCError();
      // }

      // Check for unusual login patterns (in production, implement with session tracking)
      const currentTime = Date.now();
      const sessionAge = context.session.createdAt 
        ? currentTime - new Date(context.session.createdAt).getTime()
        : 0;

      // Session age check (24 hours)
      if (sessionAge > 24 * 60 * 60 * 1000) {
        throw ErrorFactory.unauthorized(context).toORPCError();
      }

      // IP address validation (in production, implement with session tracking)
      // if (context.ip !== user.lastKnownIP) {
      //   // Could trigger additional verification
      // }

      return await next();
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Comprehensive security middleware stack
 */
export const securityStack = {
  // Basic security headers and CSRF protection
  headers: createSecurityHeaders(),
  
  // Input validation and sanitization
  inputValidator: createInputValidator(),
  
  // Bot detection and anti-automation
  botDetection: createBotDetection(),
  
  // Content type validation
  contentType: createContentTypeValidator(),
  
  // Request size validation
  requestSize: createRequestSizeValidator(),
  
  // Enhanced authentication
  enhancedAuth: createEnhancedAuth(),
};

/**
 * Security monitoring utilities
 */
export const securityMonitoring = {
  // Log security events
  logSecurityEvent: (
    eventType: string, 
    details: Record<string, any>, 
    context: Context,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) => {
    const event = {
      type: 'security_event',
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      userId: context.session?.user?.id,
      ip: context.ip,
      userAgent: context.userAgent,
      details,
    };

    // In production, this would be sent to a security monitoring service
    console.log(`SECURITY EVENT [${severity.toUpperCase()}]:`, event);
    
    if (severity === 'critical') {
      // Trigger immediate alerts
      console.error('CRITICAL SECURITY EVENT - IMMEDIATE ATTENTION REQUIRED');
    }
  },

  // Get security metrics
  getSecurityMetrics: () => {
    // In production, this would return actual security metrics
    return {
      totalSecurityEvents: 0,
      blockedRequests: 0,
      suspiciousActivity: 0,
      lastUpdate: new Date().toISOString(),
    };
  },
};

/**
 * Helper function to create a secure endpoint with all protections
 */
export function createSecureEndpoint(additionalMiddleware: any[] = []) {
  return [
    securityStack.headers,
    securityStack.botDetection,
    securityStack.contentType,
    securityStack.requestSize,
    securityStack.inputValidator,
    ...additionalMiddleware,
  ];
}