#!/usr/bin/env bun

/**
 * OpenChat Security: Generate Development Secrets
 * 
 * This script generates secure secrets for development environment.
 * SECURITY: These are for DEVELOPMENT ONLY. Use proper secret management in production.
 * 
 * Features:
 * - Generates cryptographically secure secrets using Web Crypto API
 * - Creates proper directory structure for Docker secrets
 * - Validates secret strength and format
 * - Provides backup and rotation capabilities
 */

import { $ } from "bun";
import chalk from "chalk";
import path from "path";
import { existsSync, mkdirSync } from "fs";

interface SecretConfig {
  name: string;
  description: string;
  type: 'password' | 'jwt' | 'url' | 'key';
  minLength: number;
  format?: 'base64' | 'hex' | 'alphanumeric' | 'url';
  template?: string;
}

const SECRETS_CONFIG: SecretConfig[] = [
  {
    name: 'postgres_password',
    description: 'PostgreSQL main database password',
    type: 'password',
    minLength: 32,
    format: 'alphanumeric'
  },
  {
    name: 'postgres_test_password', 
    description: 'PostgreSQL test database password',
    type: 'password',
    minLength: 32,
    format: 'alphanumeric'
  },
  {
    name: 'postgres_electric_password',
    description: 'PostgreSQL ElectricSQL database password',
    type: 'password',
    minLength: 32,
    format: 'alphanumeric'
  },
  {
    name: 'redis_password',
    description: 'Redis cache password',
    type: 'password',
    minLength: 32,
    format: 'alphanumeric'
  },
  {
    name: 'pgadmin_password',
    description: 'PgAdmin web interface password',
    type: 'password',
    minLength: 16,
    format: 'alphanumeric'
  },
  {
    name: 'jwt_secret',
    description: 'JWT signing secret key',
    type: 'jwt',
    minLength: 64,
    format: 'base64'
  },
  {
    name: 'better_auth_secret',
    description: 'Better Auth session secret',
    type: 'key',
    minLength: 64,
    format: 'base64'
  },
  {
    name: 'grafana_admin_password',
    description: 'Grafana admin interface password',
    type: 'password',
    minLength: 16,
    format: 'alphanumeric'
  }
];

class SecretGenerator {
  private secretsDir: string;
  private backupDir: string;

  constructor() {
    this.secretsDir = path.join(process.cwd(), 'secrets');
    this.backupDir = path.join(this.secretsDir, 'backup');
  }

  /**
   * Generate cryptographically secure secret based on configuration
   */
  private async generateSecret(config: SecretConfig): Promise<string> {
    const bytes = new Uint8Array(config.minLength);
    crypto.getRandomValues(bytes);

    switch (config.format) {
      case 'base64':
        return btoa(String.fromCharCode(...bytes))
          .replace(/[+]/g, '-')
          .replace(/[/]/g, '_')
          .replace(/[=]/g, '')
          .substring(0, config.minLength);
      
      case 'hex':
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
          .join('')
          .substring(0, config.minLength);
      
      case 'alphanumeric':
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(bytes, byte => chars[byte % chars.length])
          .join('')
          .substring(0, config.minLength);
      
      case 'url':
        // Special handling for URL secrets with templates
        return this.generateUrlSecret(config);
      
      default:
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
          .join('')
          .substring(0, config.minLength);
    }
  }

  /**
   * Generate URL-based secrets (like database URLs)
   */
  private async generateUrlSecret(config: SecretConfig): Promise<string> {
    const password = await this.generateSecret({
      ...config,
      format: 'alphanumeric',
      minLength: 24
    });

    switch (config.name) {
      case 'electric_database_url':
        return `postgresql://openchat:${password}@postgres:5432/openchat_dev`;
      
      case 'migrator_database_url':
        return `postgresql://openchat:${password}@postgres:5432/openchat_dev`;
      
      default:
        return password;
    }
  }

  /**
   * Validate secret strength and format
   */
  private validateSecret(secret: string, config: SecretConfig): boolean {
    if (secret.length < config.minLength) {
      console.warn(chalk.yellow(`⚠️  Secret ${config.name} is shorter than recommended (${secret.length} < ${config.minLength})`));
      return false;
    }

    // Additional validation based on type
    switch (config.type) {
      case 'jwt':
        // JWT secrets should have good entropy
        const uniqueChars = new Set(secret).size;
        if (uniqueChars < 20) {
          console.warn(chalk.yellow(`⚠️  JWT secret ${config.name} may have low entropy`));
          return false;
        }
        break;
      
      case 'password':
        // Passwords should contain mixed characters for database compatibility
        const hasLetters = /[a-zA-Z]/.test(secret);
        const hasNumbers = /[0-9]/.test(secret);
        if (!hasLetters || !hasNumbers) {
          console.warn(chalk.yellow(`⚠️  Password ${config.name} should contain both letters and numbers`));
          return false;
        }
        break;
    }

    return true;
  }

  /**
   * Setup directory structure for secrets
   */
  private async setupDirectories(): Promise<void> {
    try {
      if (!existsSync(this.secretsDir)) {
        mkdirSync(this.secretsDir, { recursive: true });
        console.log(chalk.green(`✅ Created secrets directory: ${this.secretsDir}`));
      }

      if (!existsSync(this.backupDir)) {
        mkdirSync(this.backupDir, { recursive: true });
        console.log(chalk.green(`✅ Created backup directory: ${this.backupDir}`));
      }

      // Create .gitignore to prevent accidental commits
      const gitignoreContent = `# Docker secrets - NEVER commit these files
*.txt
*.key
*.pem
backup/
!.gitkeep
`;
      
      await Bun.write(path.join(this.secretsDir, '.gitignore'), gitignoreContent);
      await Bun.write(path.join(this.secretsDir, '.gitkeep'), '# Keep this directory in git but ignore secret files\n');
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to setup directories: ${error.message}`));
      throw error;
    }
  }

  /**
   * Backup existing secrets before regeneration
   */
  private async backupExistingSecrets(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupSubDir = path.join(this.backupDir, timestamp);

    let hasExistingSecrets = false;

    for (const config of SECRETS_CONFIG) {
      const secretFile = path.join(this.secretsDir, `${config.name}.txt`);
      if (existsSync(secretFile)) {
        if (!hasExistingSecrets) {
          mkdirSync(backupSubDir, { recursive: true });
          hasExistingSecrets = true;
          console.log(chalk.yellow(`📦 Backing up existing secrets to: ${backupSubDir}`));
        }
        
        await $`cp ${secretFile} ${path.join(backupSubDir, `${config.name}.txt`)}`.quiet();
      }
    }

    if (hasExistingSecrets) {
      console.log(chalk.green(`✅ Backed up ${SECRETS_CONFIG.length} existing secrets`));
    }
  }

  /**
   * Generate all secrets according to configuration
   */
  async generateSecrets(force: boolean = false): Promise<void> {
    console.log(chalk.blue.bold('🔐 OpenChat Security: Generating Development Secrets\n'));
    
    await this.setupDirectories();
    
    if (!force) {
      await this.backupExistingSecrets();
    }

    let generatedCount = 0;
    let skippedCount = 0;

    for (const config of SECRETS_CONFIG) {
      const secretFile = path.join(this.secretsDir, `${config.name}.txt`);
      
      // Skip if exists and not forcing
      if (!force && existsSync(secretFile)) {
        console.log(chalk.gray(`⏭️  Skipping existing secret: ${config.name}`));
        skippedCount++;
        continue;
      }

      console.log(chalk.cyan(`🔑 Generating ${config.description}...`));
      
      try {
        const secret = await this.generateSecret(config);
        
        if (!this.validateSecret(secret, config)) {
          console.error(chalk.red(`❌ Generated secret for ${config.name} failed validation`));
          continue;
        }

        await Bun.write(secretFile, secret);
        
        // Set restrictive permissions (readable only by owner)
        await $`chmod 600 ${secretFile}`.quiet();
        
        console.log(chalk.green(`✅ Generated ${config.name} (${secret.length} chars)`));
        generatedCount++;
        
      } catch (error) {
        console.error(chalk.red(`❌ Failed to generate ${config.name}: ${error.message}`));
      }
    }

    // Generate database URL secrets that depend on passwords
    await this.generateDependentSecrets();

    console.log(chalk.green.bold(`\n🎉 Secret generation complete!`));
    console.log(chalk.green(`✅ Generated: ${generatedCount} secrets`));
    if (skippedCount > 0) {
      console.log(chalk.gray(`⏭️  Skipped: ${skippedCount} existing secrets`));
    }
    
    this.printSecurityWarnings();
  }

  /**
   * Generate secrets that depend on other secrets (like database URLs)
   */
  private async generateDependentSecrets(): Promise<void> {
    try {
      // Read the main postgres password
      const postgresPassword = await Bun.file(path.join(this.secretsDir, 'postgres_password.txt')).text();
      const postgresElectricPassword = await Bun.file(path.join(this.secretsDir, 'postgres_electric_password.txt')).text();
      
      // Generate database URL secrets
      const electricDbUrl = `postgresql://openchat:${postgresPassword}@postgres:5432/openchat_dev`;
      const migratorDbUrl = `postgresql://openchat:${postgresPassword}@postgres:5432/openchat_dev`;
      
      await Bun.write(path.join(this.secretsDir, 'electric_database_url.txt'), electricDbUrl);
      await Bun.write(path.join(this.secretsDir, 'migrator_database_url.txt'), migratorDbUrl);
      
      // Set permissions
      await $`chmod 600 ${path.join(this.secretsDir, 'electric_database_url.txt')}`.quiet();
      await $`chmod 600 ${path.join(this.secretsDir, 'migrator_database_url.txt')}`.quiet();
      
      console.log(chalk.green(`✅ Generated dependent secrets (database URLs)`));
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Could not generate dependent secrets: ${error.message}`));
    }
  }

  /**
   * Print important security warnings and next steps
   */
  private printSecurityWarnings(): void {
    console.log(chalk.yellow.bold('\n⚠️  IMPORTANT SECURITY WARNINGS:\n'));
    console.log(chalk.yellow('🔒 These secrets are for DEVELOPMENT ONLY'));
    console.log(chalk.yellow('🔒 Never commit secret files to version control'));
    console.log(chalk.yellow('🔒 Use proper secret management (HashiCorp Vault, AWS Secrets Manager) in production'));
    console.log(chalk.yellow('🔒 Rotate secrets regularly and after any security incidents'));
    console.log(chalk.yellow('🔒 Ensure proper file permissions (600) are maintained'));

    console.log(chalk.blue.bold('\n📋 Next Steps:\n'));
    console.log(chalk.blue('1. Start Docker services: docker compose up -d'));
    console.log(chalk.blue('2. Verify secret loading: docker compose logs'));
    console.log(chalk.blue('3. Test database connections'));
    console.log(chalk.blue('4. Review backup location for secret recovery'));
  }

  /**
   * Rotate specific secrets
   */
  async rotateSecret(secretName: string): Promise<void> {
    const config = SECRETS_CONFIG.find(c => c.name === secretName);
    if (!config) {
      console.error(chalk.red(`❌ Unknown secret: ${secretName}`));
      return;
    }

    console.log(chalk.blue(`🔄 Rotating secret: ${config.description}`));
    
    await this.backupExistingSecrets();
    
    const secret = await this.generateSecret(config);
    const secretFile = path.join(this.secretsDir, `${config.name}.txt`);
    
    await Bun.write(secretFile, secret);
    await $`chmod 600 ${secretFile}`.quiet();
    
    console.log(chalk.green(`✅ Rotated ${secretName}`));
    console.log(chalk.yellow('⚠️  Remember to restart services to use the new secret'));
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];
const flags = args.slice(1);

const generator = new SecretGenerator();

try {
  switch (command) {
    case 'generate':
      await generator.generateSecrets(flags.includes('--force'));
      break;
      
    case 'rotate':
      const secretName = flags[0];
      if (!secretName) {
        console.error(chalk.red('❌ Please specify a secret name to rotate'));
        process.exit(1);
      }
      await generator.rotateSecret(secretName);
      break;
      
    default:
      console.log(chalk.blue.bold('🔐 OpenChat Security: Secret Management\n'));
      console.log('Usage:');
      console.log('  bun scripts/security/generate-secrets.ts generate [--force]');
      console.log('  bun scripts/security/generate-secrets.ts rotate <secret-name>');
      console.log('\nAvailable secrets:');
      SECRETS_CONFIG.forEach(config => {
        console.log(chalk.gray(`  - ${config.name}: ${config.description}`));
      });
      break;
  }
} catch (error) {
  console.error(chalk.red(`❌ Error: ${error.message}`));
  process.exit(1);
}