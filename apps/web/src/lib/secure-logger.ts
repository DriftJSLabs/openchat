// Secure logging utility to prevent sensitive data exposure
const SENSITIVE_PATTERNS = [
  /key/i,
  /token/i,
  /password/i,
  /secret/i,
  /auth/i,
  /bearer/i,
  /api[_-]?key/i,
];

const DEVELOPMENT = process.env.NODE_ENV === 'development';

function containsSensitiveData(message: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

function sanitizeMessage(message: string): string {
  if (containsSensitiveData(message)) {
    return '[REDACTED: Potentially sensitive data]';
  }
  return message;
}

export const secureLogger = {
  log: (message: string, ...args: any[]) => {
    if (DEVELOPMENT) {
      console.log(sanitizeMessage(message), ...args.map(arg => 
        typeof arg === 'string' ? sanitizeMessage(arg) : arg
      ));
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (DEVELOPMENT) {
      console.error(sanitizeMessage(message), ...args.map(arg => 
        typeof arg === 'string' ? sanitizeMessage(arg) : arg
      ));
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (DEVELOPMENT) {
      console.warn(sanitizeMessage(message), ...args.map(arg => 
        typeof arg === 'string' ? sanitizeMessage(arg) : arg
      ));
    }
  },
  
  // For debugging - only shows in development and sanitizes
  debug: (message: string, data?: any) => {
    if (DEVELOPMENT) {
      const sanitizedMessage = sanitizeMessage(message);
      if (data && typeof data === 'object') {
        // Don't log the actual data if it might contain sensitive info
        console.log(sanitizedMessage, '[Object - see Network tab for details]');
      } else {
        console.log(sanitizedMessage, data ? sanitizeMessage(String(data)) : '');
      }
    }
  }
};