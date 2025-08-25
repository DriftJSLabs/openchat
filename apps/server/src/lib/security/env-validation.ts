/**
 * OpenChat Security: Environment Variable Validation
 * 
 * This module provides comprehensive validation for environment variables
 * to prevent security vulnerabilities from misconfiguration.
 * 
 * Features:
 * - Validates required security-critical environment variables
 * - Checks for placeholder/example values
 * - Validates secret strength and format
 * - Enforces production security requirements
 * - Provides detailed error messages for troubleshooting
 */

export interface SecurityValidationOptions {
  enforceProductionSecurity: boolean;
  allowDevelopmentFallbacks: boolean;
  requiredMinSecretLength: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityLevel: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Critical security environment variables that must be validated
 */
const CRITICAL_SECURITY_VARS = [
  'BETTER_AUTH_SECRET',
  'JWT_SECRET',
  'DATABASE_URL'
] as const;

/**
 * Development-only environment variables that should not be in production
 */
const DEVELOPMENT_ONLY_VARS = [
  'ENABLE_DEV_LOGIN',
  'DISABLE_AUTH_CHECKS',
  'ALLOW_INSECURE_CONNECTIONS'
] as const;

/**
 * Known placeholder values that should never be used in any environment
 */
const PLACEHOLDER_PATTERNS = [
  'your-secret-key',
  'your-jwt-secret',
  'change-this',
  'example',
  'placeholder',
  'dev-secret',
  'fallback-secret',
  'test-secret',
  'demo-secret',
  'sample-secret'
] as const;

/**
 * Production security requirements
 */
const PRODUCTION_REQUIREMENTS = {
  minSecretLength: 64,
  minEntropyChars: 20,
  requireHttps: true,
  requireSecureCookies: true,
  maxSessionAge: 86400 * 7 // 7 days
} as const;

/**
 * Validate environment variable security configuration
 */
export class EnvironmentValidator {
  private options: SecurityValidationOptions;

  constructor(options: Partial<SecurityValidationOptions> = {}) {
    this.options = {
      enforceProductionSecurity: process.env.NODE_ENV === 'production',
      allowDevelopmentFallbacks: process.env.NODE_ENV === 'development',
      requiredMinSecretLength: process.env.NODE_ENV === 'production' ? 64 : 32,
      ...options
    };
  }

  /**
   * Validate all critical security environment variables
   */
  validateSecurityConfiguration(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      securityLevel: 'low'
    };

    // Validate critical security variables
    for (const varName of CRITICAL_SECURITY_VARS) {
      const validation = this.validateSecurityVariable(varName, process.env[varName]);
      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);
    }

    // Check for development variables in production
    if (this.options.enforceProductionSecurity) {
      this.validateProductionSecurity(result);
    }

    // Check for insecure development configurations
    this.validateDevelopmentSecurity(result);

    // Determine overall security level
    result.securityLevel = this.calculateSecurityLevel(result);
    result.isValid = result.errors.length === 0;

    return result;
  }

  /**
   * Validate a specific security-critical environment variable
   */
  private validateSecurityVariable(varName: string, value: string | undefined): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      securityLevel: 'low'
    };

    // Check if variable is set
    if (!value) {
      result.errors.push(`${varName} is required but not set`);
      return result;
    }

    // Check for placeholder values
    const hasPlaceholder = PLACEHOLDER_PATTERNS.some(pattern => 
      value.toLowerCase().includes(pattern.toLowerCase())
    );

    if (hasPlaceholder) {
      result.errors.push(`${varName} appears to contain a placeholder value: "${value.substring(0, 20)}..."`);
      return result;
    }

    // Validate secret length
    if (this.isSecretVariable(varName)) {
      const minLength = this.options.requiredMinSecretLength;
      
      if (value.length < minLength) {
        result.errors.push(`${varName} must be at least ${minLength} characters long (current: ${value.length})`);
        return result;
      }

      // Check entropy for secrets
      const uniqueChars = new Set(value).size;
      const minEntropy = this.options.enforceProductionSecurity 
        ? PRODUCTION_REQUIREMENTS.minEntropyChars 
        : 12;

      if (uniqueChars < minEntropy) {
        result.warnings.push(`${varName} may have low entropy (${uniqueChars} unique characters)`);
      }
    }

    // Validate database URLs
    if (varName === 'DATABASE_URL') {
      this.validateDatabaseUrl(value, result);
    }

    return result;
  }

  /**
   * Validate production-specific security requirements
   */
  private validateProductionSecurity(result: ValidationResult): void {
    // Check for development variables in production
    for (const varName of DEVELOPMENT_ONLY_VARS) {
      if (process.env[varName]) {
        result.errors.push(`${varName} should not be set in production environment`);
      }
    }

    // Validate HTTPS requirements
    const betterAuthUrl = process.env.BETTER_AUTH_URL;
    if (betterAuthUrl && !betterAuthUrl.startsWith('https://')) {
      result.errors.push('BETTER_AUTH_URL must use HTTPS in production');
    }

    // Check for secure cookie settings
    if (process.env.USE_SECURE_COOKIES !== 'true') {
      result.warnings.push('USE_SECURE_COOKIES should be true in production');
    }

    // Validate CORS origins
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin === '*') {
      result.errors.push('CORS_ORIGIN should not be wildcard (*) in production');
    }
  }

  /**
   * Validate development environment security
   */
  private validateDevelopmentSecurity(result: ValidationResult): void {
    // Warn about insecure development settings
    if (process.env.NODE_ENV === 'development') {
      if (process.env.AUTH_MODE === 'insecure') {
        result.warnings.push('AUTH_MODE is set to insecure (development only)');
      }

      if (process.env.ENABLE_DEV_LOGIN === 'true') {
        result.warnings.push('Development login is enabled (development only)');
      }
    }
  }

  /**
   * Validate database URL format and security
   */
  private validateDatabaseUrl(url: string, result: ValidationResult): void {
    try {
      const parsed = new URL(url);
      
      // Check protocol
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        result.errors.push('DATABASE_URL must use postgresql:// protocol');
        return;
      }

      // Check for credentials in URL (security issue)
      if (parsed.password && parsed.password.length > 0) {
        // Warn about credentials in URL (better to use connection strings)
        if (this.options.enforceProductionSecurity) {
          result.warnings.push('DATABASE_URL contains credentials - consider using connection parameters');
        }

        // Check password strength
        if (parsed.password.length < 12) {
          result.warnings.push('Database password in URL appears weak');
        }
      }

      // Check for SSL in production
      if (this.options.enforceProductionSecurity) {
        if (!url.includes('sslmode=require') && !url.includes('ssl=true')) {
          result.warnings.push('DATABASE_URL should require SSL in production');
        }
      }

    } catch (error) {
      result.errors.push(`DATABASE_URL format is invalid: ${error.message}`);
    }
  }

  /**
   * Determine if a variable contains secrets
   */
  private isSecretVariable(varName: string): boolean {
    const secretKeywords = ['secret', 'key', 'token', 'password'];
    return secretKeywords.some(keyword => 
      varName.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Calculate overall security level based on validation results
   */
  private calculateSecurityLevel(result: ValidationResult): 'critical' | 'high' | 'medium' | 'low' {
    if (result.errors.length > 0) {
      return 'critical';
    }

    if (result.warnings.length > 3) {
      return 'high';
    }

    if (result.warnings.length > 0) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get detailed security report
   */
  getSecurityReport(): string {
    const validation = this.validateSecurityConfiguration();
    
    let report = '\n=== OpenChat Security Configuration Report ===\n\n';
    
    report += `Environment: ${process.env.NODE_ENV || 'unknown'}\n`;
    report += `Security Level: ${validation.securityLevel.toUpperCase()}\n`;
    report += `Status: ${validation.isValid ? 'VALID' : 'INVALID'}\n\n`;

    if (validation.errors.length > 0) {
      report += '🔴 CRITICAL ERRORS:\n';
      validation.errors.forEach(error => {
        report += `  - ${error}\n`;
      });
      report += '\n';
    }

    if (validation.warnings.length > 0) {
      report += '🟡 WARNINGS:\n';
      validation.warnings.forEach(warning => {
        report += `  - ${warning}\n`;
      });
      report += '\n';
    }

    if (validation.isValid && validation.warnings.length === 0) {
      report += '✅ All security checks passed!\n\n';
    }

    report += 'Security Recommendations:\n';
    report += '  - Use cryptographically secure random secrets\n';
    report += '  - Keep secrets in secure storage (not in code)\n';
    report += '  - Rotate secrets regularly\n';
    report += '  - Use HTTPS in production\n';
    report += '  - Enable secure cookies in production\n';
    report += '  - Monitor for security vulnerabilities\n';

    return report;
  }
}

/**
 * Validate environment variables on module load for early detection
 */
export function validateEnvironmentOnStartup(): void {
  const validator = new EnvironmentValidator();
  const validation = validator.validateSecurityConfiguration();

  if (!validation.isValid) {
    console.error('\n🔴 CRITICAL SECURITY CONFIGURATION ERRORS DETECTED!\n');
    validation.errors.forEach(error => {
      console.error(`❌ ${error}`);
    });
    console.error('\n🛑 Application startup blocked due to security issues.');
    console.error('Please fix the above errors before starting the application.\n');
    
    if (process.env.NODE_ENV === 'production') {
      // In production, fail hard on security errors
      process.exit(1);
    }
  }

  if (validation.warnings.length > 0) {
    console.warn('\n🟡 Security Configuration Warnings:\n');
    validation.warnings.forEach(warning => {
      console.warn(`⚠️  ${warning}`);
    });
    console.warn('');
  }
}

/**
 * Export validator instance for use throughout the application
 */
export const environmentValidator = new EnvironmentValidator();