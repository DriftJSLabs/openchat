#!/usr/bin/env bun

/**
 * Master Development Server Startup Script
 * 
 * This script provides comprehensive startup orchestration for the OpenChat development environment.
 * It handles PostgreSQL initialization, database setup, service health checks, and development server
 * startup with real-time status monitoring and user-friendly feedback.
 * 
 * Features:
 * - Automatic PostgreSQL detection and startup
 * - Database initialization and migration
 * - Service health monitoring with retry logic
 * - Real-time status updates with colored output
 * - Graceful shutdown handling
 * - Clear service URLs and endpoints
 */

import { spawn } from "bun";
import { existsSync } from "fs";
import chalk from "chalk";

interface ServiceStatus {
  name: string;
  status: 'starting' | 'running' | 'failed' | 'stopped';
  port?: number;
  url?: string;
  pid?: number;
  lastCheck?: Date;
}

interface HealthCheckConfig {
  url: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

class DevEnvironmentManager {
  private services: Map<string, ServiceStatus> = new Map();
  private processes: Map<string, any> = new Map();
  private healthChecks: Map<string, HealthCheckConfig> = new Map();
  private isShuttingDown = false;

  constructor() {
    // Initialize service configurations
    this.initializeServices();
    this.setupHealthChecks();
    this.setupShutdownHandlers();
  }

  /**
   * Initialize service status tracking
   */
  private initializeServices(): void {
    const serviceConfigs = [
      { name: 'PostgreSQL', port: 5432, url: 'postgresql://localhost:5432' },
      { name: 'Server', port: 3001, url: 'http://localhost:3001' },
      { name: 'Web App', port: 3000, url: 'http://localhost:3000' },
      { name: 'Documentation', port: 3002, url: 'http://localhost:3002' }
    ];

    serviceConfigs.forEach(config => {
      this.services.set(config.name, {
        name: config.name,
        status: 'stopped',
        port: config.port,
        url: config.url
      });
    });
  }

  /**
   * Setup health check configurations for each service
   */
  private setupHealthChecks(): void {
    this.healthChecks.set('Server', {
      url: 'http://localhost:3001/health',
      timeout: 5000,
      retries: 10,
      retryDelay: 2000
    });

    this.healthChecks.set('Web App', {
      url: 'http://localhost:3000',
      timeout: 5000,
      retries: 15,
      retryDelay: 2000
    });

    this.healthChecks.set('Documentation', {
      url: 'http://localhost:3002',
      timeout: 5000,
      retries: 10,
      retryDelay: 2000
    });
  }

  /**
   * Setup graceful shutdown handlers for cleanup
   */
  private setupShutdownHandlers(): void {
    const shutdown = () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      console.log(chalk.yellow('\n🛑 Shutting down development environment...'));
      this.shutdownAllServices();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);
  }

  /**
   * Main startup orchestration method
   */
  async start(): Promise<void> {
    console.log(chalk.blue.bold('🚀 Starting OpenChat Development Environment\n'));
    
    try {
      // Step 1: Check and start PostgreSQL
      await this.handlePostgreSQL();
      
      // Step 2: Initialize database
      await this.initializeDatabase();
      
      // Step 3: Start development servers
      await this.startDevelopmentServers();
      
      // Step 4: Perform health checks
      await this.performHealthChecks();
      
      // Step 5: Display final status
      this.displayFinalStatus();
      
      // Step 6: Monitor services
      this.startHealthMonitoring();
      
    } catch (error) {
      console.error(chalk.red.bold(`❌ Startup failed: ${error}`));
      await this.shutdownAllServices();
      process.exit(1);
    }
  }

  /**
   * Handle PostgreSQL startup and connection
   */
  private async handlePostgreSQL(): Promise<void> {
    console.log(chalk.blue('📊 Checking PostgreSQL status...'));
    
    this.updateServiceStatus('PostgreSQL', 'starting');
    
    // Check if PostgreSQL is already running
    const isRunning = await this.checkPostgreSQLConnection();
    
    if (isRunning) {
      console.log(chalk.green('✅ PostgreSQL is already running'));
      this.updateServiceStatus('PostgreSQL', 'running');
      return;
    }

    // Try to start PostgreSQL using Docker
    console.log(chalk.yellow('🔄 Starting PostgreSQL with Docker...'));
    
    try {
      const dockerUp = spawn(['docker', 'compose', 'up', '-d', 'postgres'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      await dockerUp.exited;

      // Wait for PostgreSQL to be ready
      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        if (await this.checkPostgreSQLConnection()) {
          console.log(chalk.green('✅ PostgreSQL started successfully'));
          this.updateServiceStatus('PostgreSQL', 'running');
          return;
        }
        await this.sleep(2000);
      }
      
      throw new Error('PostgreSQL failed to start within 30 seconds');
      
    } catch (error) {
      this.updateServiceStatus('PostgreSQL', 'failed');
      throw new Error(`Failed to start PostgreSQL: ${error}`);
    }
  }

  /**
   * Check PostgreSQL connection
   */
  private async checkPostgreSQLConnection(): Promise<boolean> {
    try {
      const testConnection = spawn(['bun', 'test-db-connection.ts'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      await testConnection.exited;
      return testConnection.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Initialize database with migrations and seeds
   */
  private async initializeDatabase(): Promise<void> {
    console.log(chalk.blue('🗄️  Initializing database...'));
    
    try {
      // Run database migrations
      console.log(chalk.yellow('  📋 Running migrations...'));
      const migrate = spawn(['bun', 'run', 'db:migrate'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      await migrate.exited;
      
      if (migrate.exitCode !== 0) {
        throw new Error('Database migration failed');
      }

      // Seed development data
      console.log(chalk.yellow('  🌱 Seeding development data...'));
      const seed = spawn(['bun', 'run', 'db:seed:dev'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      await seed.exited;
      
      if (seed.exitCode !== 0) {
        console.log(chalk.yellow('⚠️  Database seeding completed with warnings (this is usually OK)'));
      } else {
        console.log(chalk.green('✅ Database initialized successfully'));
      }
      
    } catch (error) {
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * Start all development servers concurrently
   */
  private async startDevelopmentServers(): Promise<void> {
    console.log(chalk.blue('🖥️  Starting development servers...'));
    
    // Start server
    this.startService('Server', ['bun', 'run', 'dev:server'], './apps/server');
    
    // Start web app
    this.startService('Web App', ['bun', 'run', 'dev:web'], './apps/web');
    
    // Start documentation (if available)
    if (existsSync('./apps/fumadocs')) {
      this.startService('Documentation', ['bun', 'run', 'dev'], './apps/fumadocs');
    }

    // Give services time to start
    await this.sleep(3000);
  }

  /**
   * Start an individual service
   */
  private startService(serviceName: string, command: string[], cwd?: string): void {
    console.log(chalk.yellow(`  🔄 Starting ${serviceName}...`));
    
    this.updateServiceStatus(serviceName, 'starting');
    
    try {
      const process = spawn(command, {
        cwd: cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Store process for cleanup
      this.processes.set(serviceName, process);
      
      // Handle process events
      process.exited.then((exitCode) => {
        if (!this.isShuttingDown && exitCode !== 0) {
          console.log(chalk.red(`❌ ${serviceName} exited with code ${exitCode}`));
          this.updateServiceStatus(serviceName, 'failed');
        } else if (!this.isShuttingDown) {
          this.updateServiceStatus(serviceName, 'stopped');
        }
      });

      // Capture process ID if available
      if (process.pid) {
        const service = this.services.get(serviceName);
        if (service) {
          service.pid = process.pid;
        }
      }

    } catch (error) {
      console.log(chalk.red(`❌ Failed to start ${serviceName}: ${error}`));
      this.updateServiceStatus(serviceName, 'failed');
    }
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    console.log(chalk.blue('🏥 Performing health checks...'));
    
    const healthCheckPromises = Array.from(this.healthChecks.keys()).map(async (serviceName) => {
      const config = this.healthChecks.get(serviceName)!;
      const isHealthy = await this.performHealthCheck(serviceName, config);
      
      if (isHealthy) {
        console.log(chalk.green(`✅ ${serviceName} is healthy`));
        this.updateServiceStatus(serviceName, 'running');
      } else {
        console.log(chalk.red(`❌ ${serviceName} health check failed`));
        this.updateServiceStatus(serviceName, 'failed');
      }
    });

    await Promise.all(healthCheckPromises);
  }

  /**
   * Perform health check for a specific service
   */
  private async performHealthCheck(serviceName: string, config: HealthCheckConfig): Promise<boolean> {
    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        const response = await fetch(config.url, {
          method: 'GET',
          signal: AbortSignal.timeout(config.timeout)
        });

        if (response.ok) {
          return true;
        }
      } catch (error) {
        if (attempt === config.retries) {
          console.log(chalk.yellow(`  ⚠️  ${serviceName} health check failed after ${config.retries} attempts`));
          return false;
        }
        
        if (attempt % 3 === 0) {
          console.log(chalk.gray(`    🔄 ${serviceName} health check attempt ${attempt}/${config.retries}...`));
        }
        
        await this.sleep(config.retryDelay);
      }
    }

    return false;
  }

  /**
   * Display final status of all services
   */
  private displayFinalStatus(): void {
    console.log(chalk.blue.bold('\n🎯 Development Environment Status\n'));
    
    this.services.forEach((service) => {
      const statusIcon = this.getStatusIcon(service.status);
      const statusColor = this.getStatusColor(service.status);
      
      console.log(`${statusIcon} ${service.name.padEnd(15)} ${statusColor(service.status.toUpperCase().padEnd(10))} ${service.url || ''}`);
    });

    // Display key endpoints
    console.log(chalk.blue.bold('\n🔗 Key Endpoints\n'));
    console.log(`📱 Web App:          ${chalk.cyan('http://localhost:3000')}`);
    console.log(`🔧 API Server:       ${chalk.cyan('http://localhost:3001')}`);
    console.log(`📚 Documentation:    ${chalk.cyan('http://localhost:3002')}`);
    console.log(`🔐 Dev Login:        ${chalk.cyan('http://localhost:3001/dev-login')}`);
    console.log(`🏥 Health Check:     ${chalk.cyan('http://localhost:3001/health')}`);
    console.log(`🗄️  Database Studio:  ${chalk.cyan('Run `bun run db:studio`')}`);

    // Display useful commands
    console.log(chalk.blue.bold('\n⚡ Quick Commands\n'));
    console.log(`📊 Check Status:     ${chalk.green('bun run diagnose')}`);
    console.log(`🔍 Verify Login:     ${chalk.green('bun run verify-login')}`);
    console.log(`🔄 Restart Services: ${chalk.green('bun run start-dev')}`);
    console.log(`🛑 Stop All:         ${chalk.green('Ctrl+C or bun run docker:down')}`);
  }

  /**
   * Start continuous health monitoring
   */
  private startHealthMonitoring(): void {
    console.log(chalk.blue.bold('\n🔍 Starting health monitoring (Ctrl+C to stop)...\n'));
    
    // Monitor every 30 seconds
    const monitorInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(monitorInterval);
        return;
      }

      let anyFailures = false;
      
      for (const [serviceName, config] of this.healthChecks) {
        const service = this.services.get(serviceName);
        if (service && service.status === 'running') {
          const isHealthy = await this.performHealthCheck(serviceName, { ...config, retries: 1 });
          
          if (!isHealthy && !anyFailures) {
            console.log(chalk.red(`⚠️  ${serviceName} appears to be unhealthy`));
            this.updateServiceStatus(serviceName, 'failed');
            anyFailures = true;
          } else if (isHealthy && service.status === 'failed') {
            console.log(chalk.green(`✅ ${serviceName} is healthy again`));
            this.updateServiceStatus(serviceName, 'running');
          }
        }
      }
    }, 30000);
  }

  /**
   * Shutdown all services gracefully
   */
  private async shutdownAllServices(): Promise<void> {
    console.log(chalk.yellow('🧹 Cleaning up services...'));
    
    // Kill all spawned processes
    for (const [serviceName, process] of this.processes) {
      try {
        if (process && !process.killed) {
          console.log(chalk.gray(`  🛑 Stopping ${serviceName}...`));
          process.kill('SIGTERM');
          
          // Give process time to shutdown gracefully
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
          }, 5000);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to stop ${serviceName}: ${error}`));
      }
    }

    // Update all service statuses
    this.services.forEach((service) => {
      service.status = 'stopped';
    });

    console.log(chalk.green('✅ All services stopped'));
  }

  /**
   * Update service status and timestamp
   */
  private updateServiceStatus(serviceName: string, status: ServiceStatus['status']): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = status;
      service.lastCheck = new Date();
    }
  }

  /**
   * Get status icon for display
   */
  private getStatusIcon(status: ServiceStatus['status']): string {
    switch (status) {
      case 'running': return '✅';
      case 'starting': return '🔄';
      case 'failed': return '❌';
      case 'stopped': return '⭕';
      default: return '❓';
    }
  }

  /**
   * Get status color function
   */
  private getStatusColor(status: ServiceStatus['status']): any {
    switch (status) {
      case 'running': return chalk.green;
      case 'starting': return chalk.yellow;
      case 'failed': return chalk.red;
      case 'stopped': return chalk.gray;
      default: return chalk.white;
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
if (import.meta.main) {
  const manager = new DevEnvironmentManager();
  
  console.log(chalk.blue('Starting OpenChat Development Environment...'));
  console.log(chalk.gray('This may take a few minutes on first run.\n'));
  
  manager.start().catch((error) => {
    console.error(chalk.red.bold('💥 Fatal error during startup:'), error);
    process.exit(1);
  });
}

export { DevEnvironmentManager };