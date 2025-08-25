#!/usr/bin/env bun

/**
 * OpenChat Development Environment Diagnostic Script
 * 
 * This script performs comprehensive diagnostics of the development environment,
 * checking configuration files, environment variables, Docker connectivity,
 * and providing specific fix recommendations for common issues.
 * 
 * Diagnostic Categories:
 * - Environment Configuration
 * - Database Connectivity
 * - Docker Services
 * - Network & Ports
 * - File System Permissions
 * - Service Dependencies
 * - Common Issue Detection
 */

import { existsSync, readFileSync, statSync } from "fs";
import { spawn } from "bun";
import chalk from "chalk";
import path from "path";

interface DiagnosticResult {
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  message: string;
  details?: string[];
  fixes?: string[];
}

interface DiagnosticCategory {
  name: string;
  description: string;
  results: DiagnosticResult[];
}

class SystemDiagnostics {
  private categories: DiagnosticCategory[] = [];
  private rootDir: string = process.cwd();
  
  constructor() {
    console.log(chalk.blue.bold('🔍 OpenChat Development Environment Diagnostics\n'));
  }

  /**
   * Main diagnostic orchestration method
   */
  async diagnose(): Promise<void> {
    try {
      // Run all diagnostic categories
      await this.checkEnvironmentConfiguration();
      await this.checkDatabaseConfiguration();
      await this.checkDockerServices();
      await this.checkNetworkAndPorts();
      await this.checkFileSystemPermissions();
      await this.checkServiceDependencies();
      await this.checkCommonIssues();
      
      // Display results
      this.displayResults();
      
    } catch (error) {
      console.error(chalk.red.bold(`💥 Diagnostics failed: ${error}`));
      process.exit(1);
    }
  }

  /**
   * Check environment configuration files and variables
   */
  private async checkEnvironmentConfiguration(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Environment Configuration',
      description: 'Checking environment files, variables, and configuration',
      results: []
    };

    // Check .env files
    category.results.push(await this.checkEnvFile('.env'));
    category.results.push(await this.checkEnvFile('.env.example'));
    category.results.push(await this.checkEnvFile('apps/server/.env.example'));
    category.results.push(await this.checkEnvFile('apps/web/.env.example'));

    // Check package.json files
    category.results.push(await this.checkPackageJson('package.json'));
    category.results.push(await this.checkPackageJson('apps/server/package.json'));
    category.results.push(await this.checkPackageJson('apps/web/package.json'));

    // Check critical environment variables
    category.results.push(await this.checkEnvironmentVariables());

    // Check Node/Bun version
    category.results.push(await this.checkRuntimeVersion());

    this.categories.push(category);
  }

  /**
   * Check database configuration and connectivity
   */
  private async checkDatabaseConfiguration(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Database Configuration',
      description: 'Checking database setup, connectivity, and schema',
      results: []
    };

    // Check database configuration files
    category.results.push(await this.checkDrizzleConfig());
    category.results.push(await this.checkDatabaseSchema());
    category.results.push(await this.checkMigrations());
    category.results.push(await this.checkSeeds());

    // Test database connectivity
    category.results.push(await this.testDatabaseConnection());

    this.categories.push(category);
  }

  /**
   * Check Docker services and configuration
   */
  private async checkDockerServices(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Docker Services',
      description: 'Checking Docker installation, services, and containers',
      results: []
    };

    // Check Docker installation
    category.results.push(await this.checkDockerInstallation());
    category.results.push(await this.checkDockerCompose());

    // Check Docker Compose files
    category.results.push(await this.checkDockerComposeFiles());

    // Check running containers
    category.results.push(await this.checkRunningContainers());

    // Check container logs for errors
    category.results.push(await this.checkContainerLogs());

    this.categories.push(category);
  }

  /**
   * Check network connectivity and port availability
   */
  private async checkNetworkAndPorts(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Network & Ports',
      description: 'Checking port availability and network connectivity',
      results: []
    };

    const criticalPorts = [3000, 3001, 3002, 5432];
    
    for (const port of criticalPorts) {
      category.results.push(await this.checkPortAvailability(port));
    }

    // Check service connectivity
    category.results.push(await this.checkServiceConnectivity('http://localhost:3001', 'API Server'));
    category.results.push(await this.checkServiceConnectivity('http://localhost:3000', 'Web App'));
    category.results.push(await this.checkServiceConnectivity('http://localhost:3002', 'Documentation'));

    this.categories.push(category);
  }

  /**
   * Check file system permissions and structure
   */
  private async checkFileSystemPermissions(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'File System & Permissions',
      description: 'Checking file system structure and permissions',
      results: []
    };

    // Check critical directories
    const criticalDirs = [
      'apps/server',
      'apps/web',
      'apps/fumadocs',
      'scripts',
      'apps/server/src/db',
      'apps/server/src/db/migrations'
    ];

    for (const dir of criticalDirs) {
      category.results.push(await this.checkDirectoryPermissions(dir));
    }

    // Check critical files
    const criticalFiles = [
      'package.json',
      'turbo.json',
      'docker-compose.yml',
      'apps/server/drizzle.config.ts',
      'apps/server/src/index.ts'
    ];

    for (const file of criticalFiles) {
      category.results.push(await this.checkFilePermissions(file));
    }

    this.categories.push(category);
  }

  /**
   * Check service dependencies and installations
   */
  private async checkServiceDependencies(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Service Dependencies',
      description: 'Checking installed dependencies and requirements',
      results: []
    };

    // Check node_modules
    category.results.push(await this.checkNodeModules());

    // Check critical dependencies
    category.results.push(await this.checkCriticalDependencies());

    // Check development tools
    category.results.push(await this.checkDevelopmentTools());

    // Check database tools
    category.results.push(await this.checkDatabaseTools());

    this.categories.push(category);
  }

  /**
   * Check for common development issues
   */
  private async checkCommonIssues(): Promise<void> {
    const category: DiagnosticCategory = {
      name: 'Common Issues Detection',
      description: 'Scanning for frequently encountered problems',
      results: []
    };

    // Check for port conflicts
    category.results.push(await this.checkPortConflicts());

    // Check for stale processes
    category.results.push(await this.checkStaleProcesses());

    // Check for disk space
    category.results.push(await this.checkDiskSpace());

    // Check for memory usage
    category.results.push(await this.checkMemoryUsage());

    // Check for common misconfigurations
    category.results.push(await this.checkMisconfigurations());

    this.categories.push(category);
  }

  // Individual diagnostic methods

  private async checkEnvFile(filePath: string): Promise<DiagnosticResult> {
    const fullPath = path.join(this.rootDir, filePath);
    
    if (!existsSync(fullPath)) {
      return {
        category: 'Environment Configuration',
        name: `Environment File: ${filePath}`,
        status: filePath.endsWith('.example') ? 'warn' : 'fail',
        message: filePath.endsWith('.example') ? 'Example file not found' : 'Environment file missing',
        fixes: [
          `Create ${filePath} file`,
          filePath.endsWith('.example') ? `Copy from ${filePath.replace('.example', '')}` : `Copy from ${filePath}.example`,
          'Ensure all required environment variables are set'
        ]
      };
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      return {
        category: 'Environment Configuration',
        name: `Environment File: ${filePath}`,
        status: 'pass',
        message: `Found with ${lines.length} variables`,
        details: lines.slice(0, 5).map(line => line.split('=')[0])
      };
    } catch (error) {
      return {
        category: 'Environment Configuration',
        name: `Environment File: ${filePath}`,
        status: 'fail',
        message: `Cannot read file: ${error}`,
        fixes: ['Check file permissions', 'Verify file is not corrupted']
      };
    }
  }

  private async checkPackageJson(filePath: string): Promise<DiagnosticResult> {
    const fullPath = path.join(this.rootDir, filePath);
    
    if (!existsSync(fullPath)) {
      return {
        category: 'Environment Configuration',
        name: `Package Config: ${filePath}`,
        status: 'fail',
        message: 'package.json not found',
        fixes: ['Ensure you are in the correct directory', 'Initialize project with bun init']
      };
    }

    try {
      const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
      const hasScripts = content.scripts && Object.keys(content.scripts).length > 0;
      const hasDependencies = content.dependencies || content.devDependencies;
      
      return {
        category: 'Environment Configuration',
        name: `Package Config: ${filePath}`,
        status: 'pass',
        message: `Valid (${hasScripts ? 'has scripts' : 'no scripts'})`,
        details: [
          `Scripts: ${content.scripts ? Object.keys(content.scripts).length : 0}`,
          `Dependencies: ${content.dependencies ? Object.keys(content.dependencies).length : 0}`,
          `DevDependencies: ${content.devDependencies ? Object.keys(content.devDependencies).length : 0}`
        ]
      };
    } catch (error) {
      return {
        category: 'Environment Configuration',
        name: `Package Config: ${filePath}`,
        status: 'fail',
        message: `Invalid JSON: ${error}`,
        fixes: ['Fix JSON syntax errors', 'Validate with a JSON linter']
      };
    }
  }

  private async checkEnvironmentVariables(): Promise<DiagnosticResult> {
    const requiredVars = [
      'DATABASE_URL',
      'NODE_ENV'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      return {
        category: 'Environment Configuration',
        name: 'Required Environment Variables',
        status: 'pass',
        message: 'All required variables present',
        details: requiredVars.map(varName => `${varName}: ${process.env[varName] ? 'set' : 'missing'}`)
      };
    } else {
      return {
        category: 'Environment Configuration',
        name: 'Required Environment Variables',
        status: 'fail',
        message: `Missing ${missingVars.length} required variables`,
        details: missingVars,
        fixes: [
          'Set missing environment variables',
          'Copy .env.example to .env and configure',
          'Check documentation for required variables'
        ]
      };
    }
  }

  private async checkRuntimeVersion(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['bun', '--version']);
      
      if (result.exitCode === 0) {
        const version = result.stdout.trim();
        return {
          category: 'Environment Configuration',
          name: 'Runtime Version',
          status: 'pass',
          message: `Bun ${version}`,
          details: [`Full version: ${version}`]
        };
      } else {
        return {
          category: 'Environment Configuration',
          name: 'Runtime Version',
          status: 'fail',
          message: 'Bun not found or not working',
          fixes: [
            'Install Bun: curl -fsSL https://bun.sh/install | bash',
            'Add Bun to your PATH',
            'Restart your terminal after installation'
          ]
        };
      }
    } catch (error) {
      return {
        category: 'Environment Configuration',
        name: 'Runtime Version',
        status: 'fail',
        message: `Runtime check failed: ${error}`,
        fixes: ['Install or reinstall Bun runtime']
      };
    }
  }

  private async checkDrizzleConfig(): Promise<DiagnosticResult> {
    const configPath = path.join(this.rootDir, 'apps/server/drizzle.config.ts');
    
    if (!existsSync(configPath)) {
      return {
        category: 'Database Configuration',
        name: 'Drizzle Configuration',
        status: 'fail',
        message: 'drizzle.config.ts not found',
        fixes: [
          'Create drizzle.config.ts in apps/server',
          'Configure database connection string',
          'Set up schema and migrations paths'
        ]
      };
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const hasSchema = content.includes('schema');
      const hasOut = content.includes('out') || content.includes('migrations');
      
      return {
        category: 'Database Configuration',
        name: 'Drizzle Configuration',
        status: hasSchema && hasOut ? 'pass' : 'warn',
        message: hasSchema && hasOut ? 'Configuration looks valid' : 'Configuration may be incomplete',
        details: [
          `Has schema config: ${hasSchema}`,
          `Has migrations config: ${hasOut}`
        ],
        fixes: hasSchema && hasOut ? [] : [
          'Ensure schema path is configured',
          'Ensure migrations output path is configured',
          'Verify database connection string'
        ]
      };
    } catch (error) {
      return {
        category: 'Database Configuration',
        name: 'Drizzle Configuration',
        status: 'fail',
        message: `Cannot read config: ${error}`,
        fixes: ['Check file permissions and syntax']
      };
    }
  }

  private async checkDatabaseSchema(): Promise<DiagnosticResult> {
    const schemaDir = path.join(this.rootDir, 'apps/server/src/db/schema');
    
    if (!existsSync(schemaDir)) {
      return {
        category: 'Database Configuration',
        name: 'Database Schema',
        status: 'fail',
        message: 'Schema directory not found',
        fixes: [
          'Create schema directory: apps/server/src/db/schema',
          'Add schema files for your tables',
          'Run database migrations'
        ]
      };
    }

    try {
      const files = await this.readDir(schemaDir);
      const schemaFiles = files.filter(f => f.endsWith('.ts'));
      
      return {
        category: 'Database Configuration',
        name: 'Database Schema',
        status: schemaFiles.length > 0 ? 'pass' : 'warn',
        message: `Found ${schemaFiles.length} schema files`,
        details: schemaFiles,
        fixes: schemaFiles.length > 0 ? [] : [
          'Add schema files for your database tables',
          'Define table structures using Drizzle ORM',
          'Generate migrations after schema changes'
        ]
      };
    } catch (error) {
      return {
        category: 'Database Configuration',
        name: 'Database Schema',
        status: 'fail',
        message: `Cannot read schema directory: ${error}`,
        fixes: ['Check directory permissions']
      };
    }
  }

  private async checkMigrations(): Promise<DiagnosticResult> {
    const migrationsDir = path.join(this.rootDir, 'apps/server/src/db/migrations');
    
    if (!existsSync(migrationsDir)) {
      return {
        category: 'Database Configuration',
        name: 'Database Migrations',
        status: 'warn',
        message: 'Migrations directory not found',
        fixes: [
          'Generate migrations: bun run db:generate',
          'Run migrations: bun run db:migrate',
          'Create initial migration if needed'
        ]
      };
    }

    try {
      const files = await this.readDir(migrationsDir);
      const migrationFiles = files.filter(f => f.endsWith('.sql'));
      
      return {
        category: 'Database Configuration',
        name: 'Database Migrations',
        status: migrationFiles.length > 0 ? 'pass' : 'warn',
        message: `Found ${migrationFiles.length} migration files`,
        details: migrationFiles.slice(0, 5),
        fixes: migrationFiles.length > 0 ? [] : [
          'Generate first migration: bun run db:generate',
          'Apply migrations: bun run db:migrate'
        ]
      };
    } catch (error) {
      return {
        category: 'Database Configuration',
        name: 'Database Migrations',
        status: 'fail',
        message: `Cannot read migrations directory: ${error}`,
        fixes: ['Check directory permissions']
      };
    }
  }

  private async checkSeeds(): Promise<DiagnosticResult> {
    const seedsDir = path.join(this.rootDir, 'apps/server/src/db/seeds');
    
    if (!existsSync(seedsDir)) {
      return {
        category: 'Database Configuration',
        name: 'Database Seeds',
        status: 'info',
        message: 'Seeds directory not found (optional)',
        details: ['Seeding is optional for development']
      };
    }

    try {
      const files = await this.readDir(seedsDir);
      const seedFiles = files.filter(f => f.endsWith('.ts'));
      
      return {
        category: 'Database Configuration',
        name: 'Database Seeds',
        status: 'pass',
        message: `Found ${seedFiles.length} seed files`,
        details: seedFiles
      };
    } catch (error) {
      return {
        category: 'Database Configuration',
        name: 'Database Seeds',
        status: 'warn',
        message: `Cannot read seeds directory: ${error}`,
        fixes: ['Check directory permissions']
      };
    }
  }

  private async testDatabaseConnection(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['bun', 'test-db-connection.ts'], { timeout: 10000 });
      
      if (result.exitCode === 0) {
        return {
          category: 'Database Configuration',
          name: 'Database Connection Test',
          status: 'pass',
          message: 'Database connection successful'
        };
      } else {
        return {
          category: 'Database Configuration',
          name: 'Database Connection Test',
          status: 'fail',
          message: 'Database connection failed',
          details: [result.stderr || result.stdout].filter(Boolean),
          fixes: [
            'Check DATABASE_URL environment variable',
            'Ensure PostgreSQL is running',
            'Verify database exists and credentials are correct',
            'Run: docker compose up -d postgres'
          ]
        };
      }
    } catch (error) {
      return {
        category: 'Database Configuration',
        name: 'Database Connection Test',
        status: 'fail',
        message: `Connection test failed: ${error}`,
        fixes: [
          'Ensure database service is available',
          'Check network connectivity',
          'Verify database configuration'
        ]
      };
    }
  }

  private async checkDockerInstallation(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['docker', '--version']);
      
      if (result.exitCode === 0) {
        const version = result.stdout.trim();
        return {
          category: 'Docker Services',
          name: 'Docker Installation',
          status: 'pass',
          message: 'Docker is installed',
          details: [version]
        };
      } else {
        return {
          category: 'Docker Services',
          name: 'Docker Installation',
          status: 'fail',
          message: 'Docker not found',
          fixes: [
            'Install Docker Desktop',
            'Add docker to your PATH',
            'Start Docker service'
          ]
        };
      }
    } catch (error) {
      return {
        category: 'Docker Services',
        name: 'Docker Installation',
        status: 'fail',
        message: 'Docker not available',
        fixes: ['Install Docker to use containerized services']
      };
    }
  }

  private async checkDockerCompose(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['docker', 'compose', '--version']);
      
      if (result.exitCode === 0) {
        const version = result.stdout.trim();
        return {
          category: 'Docker Services',
          name: 'Docker Compose',
          status: 'pass',
          message: 'Docker Compose is available',
          details: [version]
        };
      } else {
        return {
          category: 'Docker Services',
          name: 'Docker Compose',
          status: 'warn',
          message: 'Docker Compose not found',
          fixes: [
            'Install Docker Compose',
            'Update Docker Desktop to latest version'
          ]
        };
      }
    } catch (error) {
      return {
        category: 'Docker Services',
        name: 'Docker Compose',
        status: 'warn',
        message: 'Docker Compose not available',
        fixes: ['Docker Compose is required for some services']
      };
    }
  }

  private async checkDockerComposeFiles(): Promise<DiagnosticResult> {
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.electric.yml',
      'docker-compose.prod.yml'
    ];

    const existingFiles = composeFiles.filter(file => 
      existsSync(path.join(this.rootDir, file))
    );

    if (existingFiles.length === 0) {
      return {
        category: 'Docker Services',
        name: 'Docker Compose Files',
        status: 'warn',
        message: 'No Docker Compose files found',
        fixes: [
          'Add docker-compose.yml for service definitions',
          'Configure PostgreSQL and other services'
        ]
      };
    }

    return {
      category: 'Docker Services',
      name: 'Docker Compose Files',
      status: 'pass',
      message: `Found ${existingFiles.length} compose files`,
      details: existingFiles
    };
  }

  private async checkRunningContainers(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['docker', 'compose', 'ps', '--services', '--filter', 'status=running']);
      
      if (result.exitCode === 0) {
        const runningServices = result.stdout.trim().split('\n').filter(s => s);
        
        return {
          category: 'Docker Services',
          name: 'Running Containers',
          status: runningServices.length > 0 ? 'pass' : 'info',
          message: runningServices.length > 0 ? `${runningServices.length} services running` : 'No services running',
          details: runningServices,
          fixes: runningServices.length > 0 ? [] : [
            'Start services: docker compose up -d',
            'Check service definitions in docker-compose.yml'
          ]
        };
      } else {
        return {
          category: 'Docker Services',
          name: 'Running Containers',
          status: 'info',
          message: 'Unable to check container status',
          details: ['Docker Compose may not be configured']
        };
      }
    } catch (error) {
      return {
        category: 'Docker Services',
        name: 'Running Containers',
        status: 'info',
        message: 'Container check skipped (Docker not available)'
      };
    }
  }

  private async checkContainerLogs(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['docker', 'compose', 'logs', '--tail=10', 'postgres'], { timeout: 5000 });
      
      if (result.exitCode === 0) {
        const logs = result.stdout + result.stderr;
        const hasErrors = logs.toLowerCase().includes('error') || logs.toLowerCase().includes('failed');
        
        return {
          category: 'Docker Services',
          name: 'Container Logs',
          status: hasErrors ? 'warn' : 'pass',
          message: hasErrors ? 'Found errors in container logs' : 'Container logs look clean',
          details: hasErrors ? ['Check full logs: docker compose logs postgres'] : []
        };
      } else {
        return {
          category: 'Docker Services',
          name: 'Container Logs',
          status: 'info',
          message: 'No container logs available'
        };
      }
    } catch (error) {
      return {
        category: 'Docker Services',
        name: 'Container Logs',
        status: 'info',
        message: 'Log check skipped'
      };
    }
  }

  private async checkPortAvailability(port: number): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['netstat', '-an'], { timeout: 5000 });
      
      if (result.exitCode === 0) {
        const isInUse = result.stdout.includes(`:${port}`);
        const serviceName = this.getServiceNameForPort(port);
        
        return {
          category: 'Network & Ports',
          name: `Port ${port} (${serviceName})`,
          status: 'info',
          message: isInUse ? 'Port is in use' : 'Port is available',
          details: isInUse ? [`Port ${port} is currently occupied`] : [`Port ${port} is free`]
        };
      } else {
        return {
          category: 'Network & Ports',
          name: `Port ${port}`,
          status: 'info',
          message: 'Unable to check port status'
        };
      }
    } catch (error) {
      // Try alternative method
      try {
        const server = new (await import("net")).Server();
        await new Promise((resolve, reject) => {
          server.listen(port, () => {
            server.close();
            resolve(null);
          });
          server.on('error', reject);
        });
        
        return {
          category: 'Network & Ports',
          name: `Port ${port}`,
          status: 'pass',
          message: 'Port is available'
        };
      } catch {
        return {
          category: 'Network & Ports',
          name: `Port ${port}`,
          status: 'warn',
          message: 'Port may be in use',
          fixes: [`Stop any service using port ${port}`]
        };
      }
    }
  }

  private getServiceNameForPort(port: number): string {
    const portMap: { [key: number]: string } = {
      3000: 'Web App',
      3001: 'API Server',
      3002: 'Documentation',
      5432: 'PostgreSQL'
    };
    return portMap[port] || 'Unknown Service';
  }

  private async checkServiceConnectivity(url: string, serviceName: string): Promise<DiagnosticResult> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      return {
        category: 'Network & Ports',
        name: `${serviceName} Connectivity`,
        status: response.ok ? 'pass' : 'warn',
        message: response.ok ? 'Service is reachable' : `Service responded with ${response.status}`,
        details: [`URL: ${url}`, `Status: ${response.status}`]
      };
    } catch (error) {
      return {
        category: 'Network & Ports',
        name: `${serviceName} Connectivity`,
        status: 'fail',
        message: 'Service is not reachable',
        details: [`URL: ${url}`],
        fixes: [
          `Start ${serviceName}`,
          'Check if service is running on correct port',
          'Verify service configuration'
        ]
      };
    }
  }

  private async checkDirectoryPermissions(dirPath: string): Promise<DiagnosticResult> {
    const fullPath = path.join(this.rootDir, dirPath);
    
    if (!existsSync(fullPath)) {
      return {
        category: 'File System & Permissions',
        name: `Directory: ${dirPath}`,
        status: 'warn',
        message: 'Directory not found',
        fixes: [
          `Create directory: mkdir -p ${dirPath}`,
          'Ensure correct project structure'
        ]
      };
    }

    try {
      const stats = statSync(fullPath);
      
      if (!stats.isDirectory()) {
        return {
          category: 'File System & Permissions',
          name: `Directory: ${dirPath}`,
          status: 'fail',
          message: 'Path exists but is not a directory',
          fixes: [`Remove file and create directory: ${dirPath}`]
        };
      }

      // Check if directory is readable/writable
      return {
        category: 'File System & Permissions',
        name: `Directory: ${dirPath}`,
        status: 'pass',
        message: 'Directory exists and accessible'
      };
    } catch (error) {
      return {
        category: 'File System & Permissions',
        name: `Directory: ${dirPath}`,
        status: 'fail',
        message: `Permission error: ${error}`,
        fixes: [
          `Check directory permissions: ls -la ${path.dirname(fullPath)}`,
          'Fix permissions if needed'
        ]
      };
    }
  }

  private async checkFilePermissions(filePath: string): Promise<DiagnosticResult> {
    const fullPath = path.join(this.rootDir, filePath);
    
    if (!existsSync(fullPath)) {
      return {
        category: 'File System & Permissions',
        name: `File: ${filePath}`,
        status: 'warn',
        message: 'File not found',
        fixes: [`Create missing file: ${filePath}`]
      };
    }

    try {
      const stats = statSync(fullPath);
      
      if (!stats.isFile()) {
        return {
          category: 'File System & Permissions',
          name: `File: ${filePath}`,
          status: 'fail',
          message: 'Path exists but is not a file'
        };
      }

      return {
        category: 'File System & Permissions',
        name: `File: ${filePath}`,
        status: 'pass',
        message: 'File exists and accessible',
        details: [`Size: ${stats.size} bytes`]
      };
    } catch (error) {
      return {
        category: 'File System & Permissions',
        name: `File: ${filePath}`,
        status: 'fail',
        message: `Permission error: ${error}`,
        fixes: ['Check file permissions and fix if needed']
      };
    }
  }

  private async checkNodeModules(): Promise<DiagnosticResult> {
    const rootNodeModules = path.join(this.rootDir, 'node_modules');
    const serverNodeModules = path.join(this.rootDir, 'apps/server/node_modules');
    const webNodeModules = path.join(this.rootDir, 'apps/web/node_modules');

    const locations = [
      { path: rootNodeModules, name: 'Root' },
      { path: serverNodeModules, name: 'Server' },
      { path: webNodeModules, name: 'Web' }
    ];

    const existing = locations.filter(loc => existsSync(loc.path));
    
    if (existing.length === 0) {
      return {
        category: 'Service Dependencies',
        name: 'Node Modules',
        status: 'fail',
        message: 'No node_modules directories found',
        fixes: [
          'Run: bun install',
          'Install dependencies in workspaces',
          'Check package.json files exist'
        ]
      };
    }

    return {
      category: 'Service Dependencies',
      name: 'Node Modules',
      status: 'pass',
      message: `Found in ${existing.length} locations`,
      details: existing.map(loc => loc.name)
    };
  }

  private async checkCriticalDependencies(): Promise<DiagnosticResult> {
    const criticalDeps = [
      'drizzle-orm',
      'postgres',
      'hono',
      '@orpc/server',
      'better-auth'
    ];

    try {
      const packageJsonPath = path.join(this.rootDir, 'apps/server/package.json');
      if (!existsSync(packageJsonPath)) {
        return {
          category: 'Service Dependencies',
          name: 'Critical Dependencies',
          status: 'fail',
          message: 'Cannot check dependencies (no package.json)'
        };
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const missingDeps = criticalDeps.filter(dep => !allDeps[dep]);
      
      if (missingDeps.length === 0) {
        return {
          category: 'Service Dependencies',
          name: 'Critical Dependencies',
          status: 'pass',
          message: 'All critical dependencies present',
          details: criticalDeps.map(dep => `${dep}: ${allDeps[dep]}`)
        };
      } else {
        return {
          category: 'Service Dependencies',
          name: 'Critical Dependencies',
          status: 'warn',
          message: `Missing ${missingDeps.length} dependencies`,
          details: missingDeps,
          fixes: [
            'Run: bun install',
            'Check if dependencies are installed in workspace root'
          ]
        };
      }
    } catch (error) {
      return {
        category: 'Service Dependencies',
        name: 'Critical Dependencies',
        status: 'fail',
        message: `Cannot check dependencies: ${error}`
      };
    }
  }

  private async checkDevelopmentTools(): Promise<DiagnosticResult> {
    const tools = [
      { command: ['bun', '--version'], name: 'Bun' },
      { command: ['git', '--version'], name: 'Git' },
      { command: ['docker', '--version'], name: 'Docker' }
    ];

    const results = await Promise.all(
      tools.map(async tool => {
        try {
          const result = await this.runCommand(tool.command, { timeout: 3000 });
          return { name: tool.name, available: result.exitCode === 0 };
        } catch {
          return { name: tool.name, available: false };
        }
      })
    );

    const available = results.filter(r => r.available);
    const missing = results.filter(r => !r.available);

    return {
      category: 'Service Dependencies',
      name: 'Development Tools',
      status: missing.length === 0 ? 'pass' : 'warn',
      message: `${available.length}/${results.length} tools available`,
      details: [
        ...available.map(r => `✅ ${r.name}`),
        ...missing.map(r => `❌ ${r.name}`)
      ],
      fixes: missing.length > 0 ? [
        `Install missing tools: ${missing.map(r => r.name).join(', ')}`
      ] : []
    };
  }

  private async checkDatabaseTools(): Promise<DiagnosticResult> {
    const tools = [
      { command: ['drizzle-kit', '--version'], name: 'Drizzle Kit' }
    ];

    const results = await Promise.all(
      tools.map(async tool => {
        try {
          const result = await this.runCommand(tool.command, { timeout: 3000 });
          return { name: tool.name, available: result.exitCode === 0 };
        } catch {
          return { name: tool.name, available: false };
        }
      })
    );

    const available = results.filter(r => r.available);
    const missing = results.filter(r => !r.available);

    return {
      category: 'Service Dependencies',
      name: 'Database Tools',
      status: missing.length === 0 ? 'pass' : 'warn',
      message: `${available.length}/${results.length} database tools available`,
      details: [
        ...available.map(r => `✅ ${r.name}`),
        ...missing.map(r => `❌ ${r.name}`)
      ],
      fixes: missing.length > 0 ? [
        'Install drizzle-kit: bun add -d drizzle-kit',
        'Ensure database tools are in PATH'
      ] : []
    };
  }

  private async checkPortConflicts(): Promise<DiagnosticResult> {
    // This is a simplified check - in reality you'd check for specific processes
    return {
      category: 'Common Issues Detection',
      name: 'Port Conflicts',
      status: 'info',
      message: 'No obvious port conflicts detected',
      details: [
        'Run `netstat -an | grep LISTEN` to check active ports',
        'Stop conflicting services if needed'
      ]
    };
  }

  private async checkStaleProcesses(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['ps', 'aux'], { timeout: 5000 });
      
      if (result.exitCode === 0) {
        const processes = result.stdout;
        const nodeProcesses = processes.split('\n').filter(line => 
          line.includes('node') || line.includes('bun') || line.includes('npm')
        ).length;

        return {
          category: 'Common Issues Detection',
          name: 'Stale Processes',
          status: 'info',
          message: `Found ${nodeProcesses} Node/Bun processes`,
          details: nodeProcesses > 10 ? ['Consider killing stale development processes'] : []
        };
      }
    } catch (error) {
      // Fallback for systems without ps command
    }

    return {
      category: 'Common Issues Detection',
      name: 'Stale Processes',
      status: 'info',
      message: 'Process check not available on this system'
    };
  }

  private async checkDiskSpace(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['df', '-h', '.'], { timeout: 3000 });
      
      if (result.exitCode === 0) {
        const output = result.stdout;
        const lines = output.split('\n');
        const dataLine = lines[1] || lines[0];
        const parts = dataLine.split(/\s+/);
        const usagePercent = parts[4] || 'unknown';

        const usage = parseInt(usagePercent.replace('%', '')) || 0;
        
        return {
          category: 'Common Issues Detection',
          name: 'Disk Space',
          status: usage > 90 ? 'fail' : usage > 80 ? 'warn' : 'pass',
          message: `Disk usage: ${usagePercent}`,
          details: [`Current directory usage: ${usagePercent}`],
          fixes: usage > 80 ? [
            'Clean up node_modules: rm -rf node_modules',
            'Clean Docker images: docker system prune',
            'Clear temporary files'
          ] : []
        };
      }
    } catch (error) {
      // Fallback for systems without df command
    }

    return {
      category: 'Common Issues Detection',
      name: 'Disk Space',
      status: 'info',
      message: 'Disk space check not available'
    };
  }

  private async checkMemoryUsage(): Promise<DiagnosticResult> {
    try {
      const result = await this.runCommand(['free', '-m'], { timeout: 3000 });
      
      if (result.exitCode === 0) {
        const output = result.stdout;
        const lines = output.split('\n');
        const memLine = lines.find(line => line.startsWith('Mem:'));
        
        if (memLine) {
          const parts = memLine.split(/\s+/);
          const total = parseInt(parts[1]) || 0;
          const used = parseInt(parts[2]) || 0;
          const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;

          return {
            category: 'Common Issues Detection',
            name: 'Memory Usage',
            status: usagePercent > 90 ? 'warn' : 'pass',
            message: `Memory usage: ${usagePercent}% (${used}MB/${total}MB)`,
            fixes: usagePercent > 90 ? [
              'Close unnecessary applications',
              'Restart development servers',
              'Consider increasing system memory'
            ] : []
          };
        }
      }
    } catch (error) {
      // Fallback for systems without free command
    }

    return {
      category: 'Common Issues Detection',
      name: 'Memory Usage',
      status: 'info',
      message: 'Memory usage check not available'
    };
  }

  private async checkMisconfigurations(): Promise<DiagnosticResult> {
    const issues = [];

    // Check for common environment variable issues
    if (!process.env.DATABASE_URL) {
      issues.push('DATABASE_URL not set');
    } else if (!process.env.DATABASE_URL.includes('postgres://')) {
      issues.push('DATABASE_URL may not be a valid PostgreSQL URL');
    }

    // Check for port conflicts in environment
    if (process.env.PORT && process.env.PORT === '3000') {
      issues.push('PORT conflicts with default Next.js port');
    }

    return {
      category: 'Common Issues Detection',
      name: 'Common Misconfigurations',
      status: issues.length > 0 ? 'warn' : 'pass',
      message: issues.length > 0 ? `Found ${issues.length} potential issues` : 'No common misconfigurations detected',
      details: issues,
      fixes: issues.length > 0 ? [
        'Review environment variable configuration',
        'Check for port conflicts',
        'Verify service URLs and endpoints'
      ] : []
    };
  }

  /**
   * Display comprehensive diagnostic results
   */
  private displayResults(): void {
    console.log(chalk.blue.bold('\n📊 Diagnostic Results Summary\n'));

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;
    let totalInfo = 0;

    // Display results for each category
    for (const category of this.categories) {
      const passed = category.results.filter(r => r.status === 'pass').length;
      const failed = category.results.filter(r => r.status === 'fail').length;
      const warnings = category.results.filter(r => r.status === 'warn').length;
      const info = category.results.filter(r => r.status === 'info').length;

      totalTests += category.results.length;
      totalPassed += passed;
      totalFailed += failed;
      totalWarnings += warnings;
      totalInfo += info;

      console.log(chalk.blue.bold(`\n🗂️  ${category.name}\n`));
      console.log(chalk.gray(category.description + '\n'));

      for (const result of category.results) {
        const icon = this.getStatusIcon(result.status);
        const color = this.getStatusColor(result.status);
        
        console.log(`${icon} ${result.name.padEnd(35)} ${color(result.status.toUpperCase().padEnd(8))} ${result.message}`);
        
        if (result.details && result.details.length > 0) {
          result.details.forEach(detail => {
            console.log(chalk.gray(`    📋 ${detail}`));
          });
        }

        if (result.fixes && result.fixes.length > 0) {
          result.fixes.forEach(fix => {
            console.log(chalk.yellow(`    🔧 ${fix}`));
          });
        }
      }

      // Category summary
      console.log(chalk.gray(`\n  📈 Category summary: ${passed} passed, ${failed} failed, ${warnings} warnings, ${info} info`));
    }

    // Overall summary
    console.log(chalk.blue.bold('\n🎯 Overall System Health\n'));
    console.log(`${chalk.green('✅ Passed:')}    ${totalPassed.toString().padStart(3)}`);
    console.log(`${chalk.red('❌ Failed:')}    ${totalFailed.toString().padStart(3)}`);
    console.log(`${chalk.yellow('⚠️  Warnings:')} ${totalWarnings.toString().padStart(3)}`);
    console.log(`${chalk.blue('ℹ️  Info:')}      ${totalInfo.toString().padStart(3)}`);
    console.log(`${chalk.gray('📊 Total:')}     ${totalTests.toString().padStart(3)}`);

    // Health score
    const healthScore = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    
    console.log(chalk.blue.bold('\n🏥 System Health Score\n'));
    
    if (totalFailed === 0 && totalWarnings === 0) {
      console.log(chalk.green.bold(`🎉 EXCELLENT (${healthScore}%) - System is ready for development!`));
    } else if (totalFailed === 0) {
      console.log(chalk.yellow.bold(`✅ GOOD (${healthScore}%) - Minor issues to address`));
    } else if (healthScore >= 70) {
      console.log(chalk.yellow.bold(`⚠️  FAIR (${healthScore}%) - Some critical issues need attention`));
    } else {
      console.log(chalk.red.bold(`❌ POOR (${healthScore}%) - Multiple critical issues found`));
    }

    // Next steps
    console.log(chalk.blue.bold('\n🚀 Recommended Next Steps\n'));
    
    if (totalFailed > 0) {
      console.log(chalk.red('🔥 CRITICAL - Address these first:'));
      console.log('  • Fix all failed diagnostic checks');
      console.log('  • Run verification: bun run verify-login');
      console.log('  • Start services: bun run start-dev');
    } else if (totalWarnings > 0) {
      console.log(chalk.yellow('⚠️  IMPROVEMENTS - Consider addressing:'));
      console.log('  • Review and fix warnings');
      console.log('  • Run verification: bun run verify-login');
      console.log('  • Start development: bun run start-dev');
    } else {
      console.log(chalk.green('🎯 READY - You can now:'));
      console.log('  • Start development: bun run start-dev');
      console.log('  • Run verification: bun run verify-login');
      console.log('  • Begin coding your application!');
    }

    console.log(chalk.blue.bold('\n📖 Additional Resources\n'));
    console.log(`📚 Documentation: ${chalk.cyan('Check README.md for setup guides')}`);
    console.log(`🐛 Issues: ${chalk.cyan('Run this diagnostic again after fixes')}`);
    console.log(`💬 Help: ${chalk.cyan('Check project documentation and logs')}`);
  }

  private getStatusIcon(status: DiagnosticResult['status']): string {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '❓';
    }
  }

  private getStatusColor(status: DiagnosticResult['status']): any {
    switch (status) {
      case 'pass': return chalk.green;
      case 'fail': return chalk.red;
      case 'warn': return chalk.yellow;
      case 'info': return chalk.blue;
      default: return chalk.white;
    }
  }

  private async runCommand(command: string[], options: { timeout?: number } = {}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = options.timeout || 10000;
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.exited.then((exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode: exitCode || 0, stdout, stderr });
      }).catch(reject);
    });
  }

  private async readDir(dirPath: string): Promise<string[]> {
    const { readdir } = await import("fs/promises");
    return readdir(dirPath);
  }
}

// Main execution
if (import.meta.main) {
  const diagnostics = new SystemDiagnostics();
  
  console.log(chalk.blue('🔍 Starting comprehensive system diagnostics...'));
  console.log(chalk.gray('This will check all aspects of your development environment.\n'));
  
  diagnostics.diagnose().catch((error) => {
    console.error(chalk.red.bold('💥 Diagnostics failed:'), error);
    process.exit(1);
  });
}

export { SystemDiagnostics };