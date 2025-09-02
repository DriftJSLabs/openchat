// Secure logger that sanitizes sensitive data before logging
export class SecureLogger {
  private static readonly SENSITIVE_PATTERNS = [
    /Bearer\s+[A-Za-z0-9\-_.]+/gi,
    /sk-[A-Za-z0-9]{48}/gi,
    /token["\s:=]+["']?[A-Za-z0-9\-_.]+/gi,
    /key["\s:=]+["']?[A-Za-z0-9\-_.]{32,}/gi,
    /password["\s:=]+["']?[^\s"']+/gi,
    /authorization["\s:=]+["']?[^\s"']+/gi,
  ];

  private static sanitizeData(data: any): any {
    if (typeof data === 'string') {
      let sanitized = data;
      for (const pattern of this.SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
      return sanitized;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (data && typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('token') || lowerKey.includes('key') || 
            lowerKey.includes('password') || lowerKey.includes('secret') ||
            lowerKey.includes('authorization')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  public static log(...args: any[]): void {
    if (process.env.NODE_ENV === 'production') {
      const sanitizedArgs = args.map(arg => this.sanitizeData(arg));
      console.log(...sanitizedArgs);
    } else {
      console.log(...args);
    }
  }

  public static error(...args: any[]): void {
    if (process.env.NODE_ENV === 'production') {
      const sanitizedArgs = args.map(arg => this.sanitizeData(arg));
      console.error(...sanitizedArgs);
    } else {
      console.error(...args);
    }
  }

  public static warn(...args: any[]): void {
    if (process.env.NODE_ENV === 'production') {
      const sanitizedArgs = args.map(arg => this.sanitizeData(arg));
      console.warn(...sanitizedArgs);
    } else {
      console.warn(...args);
    }
  }
}