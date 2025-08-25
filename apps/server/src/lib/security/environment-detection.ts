/**
 * OpenChat Security: Environment Detection
 * 
 * This module provides secure and reliable environment detection to prevent
 * production security bypasses and ensure development-only features are
 * properly restricted.
 * 
 * Features:
 * - Multi-factor environment detection
 * - Production safety checks
 * - Fail-safe security defaults
 * - Audit logging for security decisions
 */

export interface EnvironmentInfo {
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  isStaging: boolean;
  securityLevel: 'strict' | 'moderate' | 'relaxed';
  allowDevelopmentFeatures: boolean;
  confidence: 'high' | 'medium' | 'low';
  indicators: {
    nodeEnv: string | undefined;
    explicitFlags: boolean;
    networkIndicators: boolean;
    databaseIndicators: boolean;
    securityIndicators: boolean;
  };
  securityWarnings: string[];
}

/**
 * Production indicators that should NEVER allow development features
 */
const PRODUCTION_INDICATORS = [
  // Domain patterns
  /\.com$/,
  /\.net$/,
  /\.org$/,
  /\.io$/,
  /\.co$/,
  // Production-specific domains
  /prod\./,
  /production\./,
  /live\./,
  /api\./,
  /app\./
] as const;

/**
 * Development indicators
 */
const DEVELOPMENT_INDICATORS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'dev.',
  'development.',
  'local.',
  '.local',
  '.dev',
  '.test'
] as const;

/**
 * Secure environment detection class
 */
export class EnvironmentDetector {
  private static instance: EnvironmentDetector;
  private cachedEnvironmentInfo: EnvironmentInfo | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  /**
   * Get singleton instance
   */
  static getInstance(): EnvironmentDetector {
    if (!this.instance) {
      this.instance = new EnvironmentDetector();
    }
    return this.instance;
  }

  /**
   * Get comprehensive environment information
   */
  getEnvironmentInfo(forceRefresh: boolean = false): EnvironmentInfo {
    const now = Date.now();
    
    // Return cached result if still valid
    if (!forceRefresh && this.cachedEnvironmentInfo && now < this.cacheExpiry) {
      return this.cachedEnvironmentInfo;
    }

    const info = this.analyzeEnvironment();
    
    // Cache the result
    this.cachedEnvironmentInfo = info;
    this.cacheExpiry = now + this.CACHE_DURATION;
    
    // Log security-relevant environment decisions
    this.logEnvironmentDecision(info);
    
    return info;
  }

  /**
   * Check if development features should be allowed
   * SECURITY: This is the primary security gate - fail safe to false
   */
  isDevelopmentAllowed(): boolean {
    try {
      const info = this.getEnvironmentInfo();
      
      // FAIL SAFE: If confidence is low, default to production security
      if (info.confidence === 'low') {
        console.warn('[SECURITY] Environment detection confidence is low - defaulting to production security');
        return false;
      }
      
      // FAIL SAFE: If any production indicators, disable development features
      if (info.isProduction) {
        return false;
      }
      
      // FAIL SAFE: If security level is strict, disable development features
      if (info.securityLevel === 'strict') {
        return false;
      }
      
      return info.allowDevelopmentFeatures;
    } catch (error) {
      // FAIL SAFE: On any error, default to production security
      console.error('[SECURITY] Environment detection failed - defaulting to production security:', error);
      return false;
    }
  }

  /**
   * Check if environment is definitely production
   */
  isProductionEnvironment(): boolean {
    const info = this.getEnvironmentInfo();
    return info.isProduction;
  }

  /**
   * Analyze current environment comprehensively
   */
  private analyzeEnvironment(): EnvironmentInfo {
    const nodeEnv = process.env.NODE_ENV;
    const securityWarnings: string[] = [];
    
    // Analyze NODE_ENV
    const nodeEnvAnalysis = this.analyzeNodeEnv(nodeEnv);
    
    // Analyze explicit feature flags
    const explicitFlags = this.analyzeExplicitFlags();
    
    // Analyze network indicators
    const networkIndicators = this.analyzeNetworkIndicators();
    
    // Analyze database indicators
    const databaseIndicators = this.analyzeDatabaseIndicators();
    
    // Analyze security configuration
    const securityIndicators = this.analyzeSecurityIndicators();
    
    // Determine environment type with multi-factor analysis
    const environmentType = this.determineEnvironmentType({
      nodeEnv: nodeEnvAnalysis,
      explicitFlags,
      networkIndicators,
      databaseIndicators,
      securityIndicators
    });
    
    // Calculate confidence level
    const confidence = this.calculateConfidence({
      nodeEnv: nodeEnvAnalysis,
      explicitFlags,
      networkIndicators,
      databaseIndicators,
      securityIndicators
    });
    
    // Determine security level
    const securityLevel = this.determineSecurityLevel(environmentType, confidence);
    
    // Check for security warnings
    this.checkSecurityWarnings(environmentType, securityWarnings);
    
    return {
      isDevelopment: environmentType.isDevelopment,
      isProduction: environmentType.isProduction,
      isTest: environmentType.isTest,
      isStaging: environmentType.isStaging,
      securityLevel,
      allowDevelopmentFeatures: environmentType.isDevelopment && securityLevel !== 'strict',
      confidence,
      indicators: {
        nodeEnv,
        explicitFlags: explicitFlags.hasDevelopmentFlags,
        networkIndicators: networkIndicators.isDevelopment,
        databaseIndicators: databaseIndicators.isDevelopment,
        securityIndicators: securityIndicators.isSecure
      },
      securityWarnings
    };
  }

  /**
   * Analyze NODE_ENV value
   */
  private analyzeNodeEnv(nodeEnv: string | undefined) {
    if (!nodeEnv) {
      return { isDevelopment: false, isProduction: false, isTest: false, isExplicit: false };
    }
    
    const env = nodeEnv.toLowerCase().trim();
    
    return {
      isDevelopment: env === 'development' || env === 'dev',
      isProduction: env === 'production' || env === 'prod',
      isTest: env === 'test' || env === 'testing',
      isStaging: env === 'staging' || env === 'stage',
      isExplicit: true
    };
  }

  /**
   * Analyze explicit development/production flags
   */
  private analyzeExplicitFlags() {
    const developmentFlags = [
      process.env.ENABLE_DEV_AUTH === 'true',
      process.env.DEV_MODE === 'true',
      process.env.DEVELOPMENT === 'true',
      process.env.DEBUG === 'true'
    ];
    
    const productionFlags = [
      process.env.PRODUCTION === 'true',
      process.env.PROD_MODE === 'true',
      process.env.ENABLE_PRODUCTION_SECURITY === 'true'
    ];
    
    const insecureFlags = [
      process.env.ELECTRIC_INSECURE === 'true',
      process.env.DISABLE_AUTH === 'true',
      process.env.SKIP_SECURITY_CHECKS === 'true'
    ];
    
    return {
      hasDevelopmentFlags: developmentFlags.some(Boolean),
      hasProductionFlags: productionFlags.some(Boolean),
      hasInsecureFlags: insecureFlags.some(Boolean),
      conflictingFlags: developmentFlags.some(Boolean) && productionFlags.some(Boolean)
    };
  }

  /**
   * Analyze network-based indicators
   */
  private analyzeNetworkIndicators() {
    const urls = [
      process.env.BETTER_AUTH_URL,
      process.env.CORS_ORIGIN,
      process.env.CLIENT_URL,
      process.env.SERVER_URL,
      process.env.WEB_URL
    ].filter(Boolean);
    
    const isDevelopment = urls.some(url => 
      DEVELOPMENT_INDICATORS.some(indicator => 
        url!.toLowerCase().includes(indicator.toLowerCase())
      )
    );
    
    const isProduction = urls.some(url =>
      PRODUCTION_INDICATORS.some(pattern =>
        pattern.test(url!.toLowerCase())
      )
    );
    
    return { isDevelopment, isProduction, hasNetworkConfig: urls.length > 0 };
  }

  /**
   * Analyze database configuration indicators
   */
  private analyzeDatabaseIndicators() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return { isDevelopment: false, isProduction: false, hasConfig: false };
    }
    
    const isDevelopment = DEVELOPMENT_INDICATORS.some(indicator =>
      dbUrl.toLowerCase().includes(indicator.toLowerCase())
    );
    
    const isProduction = PRODUCTION_INDICATORS.some(pattern =>
      pattern.test(dbUrl.toLowerCase())
    ) || dbUrl.includes('ssl=true') || dbUrl.includes('sslmode=require');
    
    return { isDevelopment, isProduction, hasConfig: true };
  }

  /**
   * Analyze security configuration indicators
   */
  private analyzeSecurityIndicators() {
    const securityConfig = {
      hasSecureCookies: process.env.USE_SECURE_COOKIES === 'true',
      hasHttpsUrl: process.env.BETTER_AUTH_URL?.startsWith('https://'),
      hasStrongSecrets: this.validateSecretStrength(),
      hasProductionCors: process.env.CORS_ORIGIN !== '*',
      hasSslDatabase: process.env.DATABASE_URL?.includes('ssl=true') || 
                     process.env.DATABASE_URL?.includes('sslmode=require')
    };
    
    const secureCount = Object.values(securityConfig).filter(Boolean).length;
    const totalChecks = Object.keys(securityConfig).length;
    
    return {
      isSecure: secureCount >= totalChecks * 0.7, // 70% of security checks pass
      securityScore: secureCount / totalChecks,
      ...securityConfig
    };
  }

  /**
   * Validate strength of security secrets
   */
  private validateSecretStrength(): boolean {
    const secrets = [
      process.env.BETTER_AUTH_SECRET,
      process.env.JWT_SECRET
    ].filter(Boolean);
    
    return secrets.every(secret => 
      secret!.length >= 32 && 
      new Set(secret).size >= 16 // Basic entropy check
    );
  }

  /**
   * Determine environment type based on all indicators
   */
  private determineEnvironmentType(indicators: any) {
    // Production takes precedence (fail-safe)
    if (indicators.nodeEnv.isProduction || 
        indicators.networkIndicators.isProduction ||
        indicators.databaseIndicators.isProduction ||
        indicators.explicitFlags.hasProductionFlags) {
      return {
        isDevelopment: false,
        isProduction: true,
        isTest: false,
        isStaging: false
      };
    }
    
    // Test environment
    if (indicators.nodeEnv.isTest) {
      return {
        isDevelopment: false,
        isProduction: false,
        isTest: true,
        isStaging: false
      };
    }
    
    // Staging environment
    if (indicators.nodeEnv.isStaging) {
      return {
        isDevelopment: false,
        isProduction: false,
        isTest: false,
        isStaging: true
      };
    }
    
    // Development environment (only if clearly indicated)
    if ((indicators.nodeEnv.isDevelopment || indicators.explicitFlags.hasDevelopmentFlags) &&
        (indicators.networkIndicators.isDevelopment || indicators.databaseIndicators.isDevelopment)) {
      return {
        isDevelopment: true,
        isProduction: false,
        isTest: false,
        isStaging: false
      };
    }
    
    // Default to production (fail-safe)
    return {
      isDevelopment: false,
      isProduction: true,
      isTest: false,
      isStaging: false
    };
  }

  /**
   * Calculate confidence in environment detection
   */
  private calculateConfidence(indicators: any): 'high' | 'medium' | 'low' {
    let score = 0;
    let total = 0;
    
    // NODE_ENV is most reliable
    if (indicators.nodeEnv.isExplicit) {
      score += 3;
    }
    total += 3;
    
    // Network indicators
    if (indicators.networkIndicators.hasNetworkConfig) {
      score += 2;
    }
    total += 2;
    
    // Database indicators
    if (indicators.databaseIndicators.hasConfig) {
      score += 2;
    }
    total += 2;
    
    // Security indicators
    if (indicators.securityIndicators.securityScore > 0.5) {
      score += 1;
    }
    total += 1;
    
    const confidenceRatio = score / total;
    
    if (confidenceRatio >= 0.8) return 'high';
    if (confidenceRatio >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Determine security level based on environment and confidence
   */
  private determineSecurityLevel(environmentType: any, confidence: string): 'strict' | 'moderate' | 'relaxed' {
    // Always strict in production
    if (environmentType.isProduction) {
      return 'strict';
    }
    
    // Strict if low confidence (fail-safe)
    if (confidence === 'low') {
      return 'strict';
    }
    
    // Moderate for staging
    if (environmentType.isStaging) {
      return 'moderate';
    }
    
    // Relaxed only for confirmed development
    if (environmentType.isDevelopment && confidence === 'high') {
      return 'relaxed';
    }
    
    // Default to moderate
    return 'moderate';
  }

  /**
   * Check for security warnings
   */
  private checkSecurityWarnings(environmentType: any, warnings: string[]) {
    if (environmentType.isDevelopment) {
      warnings.push('Development features are enabled');
      
      if (process.env.ELECTRIC_INSECURE === 'true') {
        warnings.push('ElectricSQL is running in insecure mode');
      }
      
      if (process.env.CORS_ORIGIN === '*') {
        warnings.push('CORS is set to allow all origins');
      }
    }
    
    if (!environmentType.isProduction && !environmentType.isDevelopment) {
      warnings.push('Environment type is ambiguous');
    }
  }

  /**
   * Log security-relevant environment decisions
   */
  private logEnvironmentDecision(info: EnvironmentInfo) {
    const logLevel = info.securityWarnings.length > 0 ? 'warn' : 'info';
    
    const logData = {
      isDevelopment: info.isDevelopment,
      isProduction: info.isProduction,
      securityLevel: info.securityLevel,
      allowDevelopmentFeatures: info.allowDevelopmentFeatures,
      confidence: info.confidence,
      warnings: info.securityWarnings
    };
    
    if (logLevel === 'warn') {
      console.warn('[SECURITY] Environment analysis completed with warnings:', logData);
    } else {
      console.log('[SECURITY] Environment analysis completed:', logData);
    }
  }
}

/**
 * Convenience functions for common environment checks
 */
export const environmentDetector = EnvironmentDetector.getInstance();

/**
 * Check if development features should be allowed
 * SECURITY: Primary security gate - fails safe to false
 */
export function isDevelopmentAllowed(): boolean {
  return environmentDetector.isDevelopmentAllowed();
}

/**
 * Check if environment is production
 */
export function isProduction(): boolean {
  return environmentDetector.isProductionEnvironment();
}

/**
 * Get comprehensive environment information
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  return environmentDetector.getEnvironmentInfo();
}

/**
 * Require development environment or throw error
 * SECURITY: Throws error if not in development
 */
export function requireDevelopment(operation: string): void {
  if (!isDevelopmentAllowed()) {
    throw new Error(`Operation "${operation}" is only allowed in development environment`);
  }
}

/**
 * Require production environment or throw error
 */
export function requireProduction(operation: string): void {
  if (!isProduction()) {
    throw new Error(`Operation "${operation}" is only allowed in production environment`);
  }
}