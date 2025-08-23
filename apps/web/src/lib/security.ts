/**
 * Security validation functions for OpenChat
 */

/**
 * Validates if a prompt is safe and doesn't contain injection attempts
 */
export function isPromptSafe(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') {
    return false;
  }

  // Comprehensive patterns for prompt injection detection
  const dangerousPatterns = [
    // Direct instruction overrides
    /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|context)/i,
    /disregard\s+(previous|all|above|prior|that|everything)/i,
    /override\s+(safety|security|instructions?)/i,
    /system\s*(override|bypass|ignore)/i,
    
    // Role manipulation attempts
    /\n\n\s*human\s*:/i,
    /^\s*human\s*:/i,
    /\n\n\s*assistant\s*:/i,
    /\n\n\s*system\s*:/i,
    /act\s+as\s+(if\s+)?you\s+(are|were)/i,
    
    // Comment-based injections
    /<!--.*ignore.*-->/i,
    /\/\*.*ignore.*\*\//i,
    /\#.*ignore.*instructions/i,
    
    // Encoding attempts
    /%6e%65%77%20%69%6e%73%74%72%75%63%74%69%6f%6e/i, // "new instruction" encoded
    /\\u006e\\u0065\\u0077/i, // unicode encoded attempts
    
    // Prompt leakage attempts
    /repeat\s+(the\s+)?(above|previous)\s+(prompt|instruction)/i,
    /(show|tell|give)\s+me\s+(your|the)\s+(prompt|instruction)/i,
    /what\s+(is|was)\s+(your|the)\s+(initial|original)\s+(prompt|instruction)/i,
    
    // Jailbreak patterns
    /for\s+educational\s+purposes\s+only/i,
    /this\s+is\s+(just\s+)?a\s+(test|simulation)/i,
    /developer\s+mode/i,
    /debug\s+mode/i,
    
    // Direct bypassing attempts
    /forget\s+(everything|all)\s+(above|before)/i,
    /start\s+over/i,
    /new\s+(conversation|session)/i,
    /reset\s+(conversation|context)/i,
    
    // Pattern to catch "disregard everything above"
    /disregard\s+(everything\s+)?above/i,
    /actually,\s*disregard/i
  ];

  return !dangerousPatterns.some(pattern => pattern.test(prompt));
}

/**
 * Validates AI response content for safety and proper structure
 */
export function validateAIResponse(response: any): boolean {
  // Basic structure validation
  if (!response || typeof response !== 'object') {
    return false;
  }

  // Check required fields
  if (!response.response || typeof response.response !== 'string') {
    return false;
  }

  // Response length validation
  if (response.response.length === 0 || response.response.length > 50000) {
    return false;
  }

  // Check for sensitive information leakage
  const sensitivePatterns = [
    /api[_-]?\s*key\s*(is|[:=])\s*[a-zA-Z0-9_-]+/i,
    /(password|pwd)\s*(is|[:=])\s*\S+/i,
    /(secret|token)\s*(is|[:=])\s*\S+/i,
    /private[_-]?key\s*(is|[:=])/i,
    /sk-[a-zA-Z0-9]{20,}/i, // OpenAI API key format (relaxed length)
    /ghp_[a-zA-Z0-9]{36}/i, // GitHub token format
    /glpat-[a-zA-Z0-9_\-]{20}/i, // GitLab token format
    /AKIA[0-9A-Z]{16}/i, // AWS access key format
    /(your|the)\s+(api\s+key|password|secret|token)\s+(is|was)\s+/i
  ];

  if (sensitivePatterns.some(pattern => pattern.test(response.response))) {
    return false;
  }

  // Check for system information leakage
  const systemInfoPatterns = [
    /\/etc\/passwd/i,
    /\/root\//i,
    /c:\\windows\\system32/i,
    /database\s+(connection|password)/i,
    /internal\s+(server|ip|address)/i,
  ];

  if (systemInfoPatterns.some(pattern => pattern.test(response.response))) {
    return false;
  }

  return true;
}

/**
 * Sanitizes file paths to prevent directory traversal attacks
 */
export function sanitizePath(pathname: string): string {
  if (!pathname || typeof pathname !== 'string') {
    return '';
  }

  // URL decode any encoded sequences
  let decoded = decodeURIComponent(pathname);
  
  // Remove various forms of directory traversal
  decoded = decoded.replace(/\.\.\\\//g, ''); // ..\/
  decoded = decoded.replace(/\.\.\//g, '');   // ../
  decoded = decoded.replace(/\.\.\\\\/g, ''); // ..\\
  decoded = decoded.replace(/\.\.\\/g, '');   // ..\
  decoded = decoded.replace(/\.\.%2f/gi, ''); // ..%2F (encoded /)
  decoded = decoded.replace(/\.\.%5c/gi, ''); // ..%5C (encoded \)
  decoded = decoded.replace(/\.\.%2F/g, '');  // ..%2F
  decoded = decoded.replace(/\.\.%5C/g, '');  // ..%5C
  
  // Remove null bytes and other control characters
  decoded = decoded.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Normalize multiple slashes
  decoded = decoded.replace(/\/+/g, '/');
  
  return decoded;
}

/**
 * Validates if a sanitized path is safe for the given base path
 */
export function isPathSafe(pathname: string, allowedBasePath: string): boolean {
  const sanitized = sanitizePath(pathname);
  
  // Check if the sanitized path starts with the allowed base path
  if (!sanitized.startsWith(allowedBasePath)) {
    return false;
  }
  
  // Additional validation - check for valid characters after base path
  const remainder = sanitized.slice(allowedBasePath.length);
  if (remainder && remainder !== '/') {
    // Only allow alphanumeric, dashes, underscores, dots, and slashes after base
    const validPattern = /^\/[a-zA-Z0-9._/-]*$/;
    return validPattern.test(remainder);
  }
  
  return true;
}

/**
 * Sanitizes message content to prevent XSS and other injection attacks
 */
export function sanitizeMessageContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  let sanitized = content;
  
  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit excessive newlines
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove script tags and their content
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  
  // Remove javascript: protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data URLs that could contain HTML
  sanitized = sanitized.replace(/data:text\/html[^;]*;[^,]*,/gi, '');
  
  // Remove template literals that could be executed
  sanitized = sanitized.replace(/\$\{[^}]*\}/g, '');
  
  // Normalize carriage returns
  sanitized = sanitized.replace(/\r\n/g, '\n');
  sanitized = sanitized.replace(/\r/g, '\n');
  
  return sanitized.trim();
}

/**
 * Validates and sanitizes HTTP headers
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  // List of allowed headers (whitelist approach)
  const allowedHeaders = [
    'content-type',
    'authorization',
    'accept',
    'user-agent',
    'x-requested-with',
    'cache-control'
  ];
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (allowedHeaders.includes(lowerKey) && typeof value === 'string') {
      // Remove CRLF injection attempts
      const cleanValue = value
        .replace(/[\r\n]/g, '')
        .slice(0, 2048); // Limit header length
      
      if (cleanValue.length > 0) {
        sanitized[lowerKey] = cleanValue;
      }
    }
  }
  
  return sanitized;
}

/**
 * Redacts sensitive information from error messages
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return 'An error occurred';
  }

  let sanitized = message;
  
  // Redact common sensitive patterns
  sanitized = sanitized.replace(/api[_-]?key\s*[:=]\s*[a-zA-Z0-9_-]+/gi, '[API_KEY_REDACTED]');
  sanitized = sanitized.replace(/password\s*[:=]\s*\S+/gi, '[REDACTED]');
  sanitized = sanitized.replace(/secret\s*[:=]\s*\S+/gi, '[REDACTED]');
  sanitized = sanitized.replace(/token\s*[:=]\s*[a-zA-Z0-9._-]+/gi, '[TOKEN_REDACTED]');
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{48}/gi, '[API_KEY_REDACTED]');
  sanitized = sanitized.replace(/\/[a-zA-Z0-9._/-]*\/private/gi, '[PATH_REDACTED]');
  sanitized = sanitized.replace(/\/etc\/passwd/gi, '[PATH_REDACTED]');
  sanitized = sanitized.replace(/c:\\windows\\system32/gi, '[PATH_REDACTED]');
  
  return sanitized;
}