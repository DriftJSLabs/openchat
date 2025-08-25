#!/usr/bin/env bun

/**
 * OpenChat Development Cleanup Script
 * 
 * This script cleans up the development environment by:
 * - Stopping and removing Docker containers
 * - Removing Docker volumes (optional)
 * - Cleaning up temporary files
 * - Resetting environment state
 * 
 * Usage: bun scripts/dev-cleanup.ts [options]
 */

import { $ } from "bun";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import chalk from "chalk";

interface CleanupOptions {
  verbose: boolean;
  keepData: boolean;
  keepNetwork: boolean;
  force: boolean;
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CleanupOptions = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  keepData: args.includes('--keep-data'),
  keepNetwork: args.includes('--keep-network'),
  force: args.includes('--force') || args.includes('-f')
};

/**
 * Display cleanup progress with consistent formatting
 */
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const icons = {
    info: '🧹',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };
  
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red
  };
  
  console.log(colors[type](`${icons[type]} ${message}`));
}

/**
 * Execute shell command with error handling
 */
async function exec(command: string, description: string, silent = !options.verbose) {
  try {
    if (options.verbose) {
      log(`Executing: ${command}`, 'info');
    }
    
    const result = silent ? await $(command.split(' ')).quiet() : await $(command.split(' '));
    return result;
  } catch (error) {
    if (!silent) {
      log(`Failed to ${description}: ${error.message}`, 'error');
    }
    throw error;
  }
}

/**
 * Confirm cleanup action with user
 */
async function confirmCleanup(): Promise<boolean> {
  if (options.force) {
    return true;
  }
  
  console.log(chalk.yellow('⚠️  This will stop and remove all OpenChat development services:'));
  console.log('  • PostgreSQL database');
  console.log('  • ElectricSQL service');
  console.log('  • Redis cache');
  console.log('  • PgAdmin interface');
  
  if (!options.keepData) {
    console.log('  • All database data and volumes');
  }
  
  console.log('\nPress Ctrl+C to cancel or Enter to continue...');
  
  // Wait for user input
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve(true);
    });
  });
}

/**
 * Stop all OpenChat Docker containers
 */
async function stopContainers(): Promise<void> {
  log('Stopping Docker containers...');
  
  const containers = [
    'openchat-postgres',
    'openchat-postgres-test',
    'openchat-electric',
    'openchat-redis',
    'openchat-pgadmin',
    'openchat-nginx',
    'openchat-prometheus',
    'openchat-grafana'
  ];
  
  let stoppedCount = 0;
  
  for (const container of containers) {
    try {
      await exec(`docker stop ${container}`, `stop ${container}`, true);
      stoppedCount++;
      if (options.verbose) {
        log(`Stopped ${container}`, 'success');
      }
    } catch (error) {
      // Container might not exist or already be stopped
    }
  }
  
  log(`Stopped ${stoppedCount} containers`, 'success');
}

/**
 * Remove all OpenChat Docker containers
 */
async function removeContainers(): Promise<void> {
  log('Removing Docker containers...');
  
  const containers = [
    'openchat-postgres',
    'openchat-postgres-test',
    'openchat-electric',
    'openchat-redis',
    'openchat-pgladmin',
    'openchat-nginx',
    'openchat-prometheus',
    'openchat-grafana'
  ];
  
  let removedCount = 0;
  
  for (const container of containers) {
    try {
      await exec(`docker rm -f ${container}`, `remove ${container}`, true);
      removedCount++;
      if (options.verbose) {
        log(`Removed ${container}`, 'success');
      }
    } catch (error) {
      // Container might not exist
    }
  }
  
  log(`Removed ${removedCount} containers`, 'success');
}

/**
 * Remove Docker volumes (if not keeping data)
 */
async function removeVolumes(): Promise<void> {
  if (options.keepData) {
    log('Keeping data volumes as requested', 'info');
    return;
  }
  
  log('Removing Docker volumes...');
  
  const volumes = [
    'openchat_postgres_data',
    'openchat_postgres_test_data',
    'openchat_electric_data',
    'openchat_electric_logs',
    'openchat_redis_data',
    'openchat_pgadmin_data',
    'openchat_nginx_logs',
    'openchat_prometheus_data',
    'openchat_grafana_data'
  ];
  
  let removedCount = 0;
  
  for (const volume of volumes) {
    try {
      await exec(`docker volume rm ${volume}`, `remove volume ${volume}`, true);
      removedCount++;
      if (options.verbose) {
        log(`Removed volume ${volume}`, 'success');
      }
    } catch (error) {
      // Volume might not exist
    }
  }
  
  log(`Removed ${removedCount} data volumes`, 'success');
}

/**
 * Remove Docker network (if not keeping network)
 */
async function removeNetwork(): Promise<void> {
  if (options.keepNetwork) {
    log('Keeping Docker network as requested', 'info');
    return;
  }
  
  log('Removing Docker network...');
  
  try {
    await exec('docker network rm openchat-network', 'remove Docker network', true);
    log('Docker network removed', 'success');
  } catch (error) {
    // Network might not exist or be in use
    if (options.verbose) {
      log('Failed to remove network (might not exist)', 'warning');
    }
  }
}

/**
 * Clean up local data directories
 */
async function cleanupLocalDirectories(): Promise<void> {
  if (options.keepData) {
    return;
  }
  
  log('Cleaning up local data directories...');
  
  const directories = [
    '.postgres-data',
    '.electric-data',
    '.redis-data'
  ];
  
  let cleanedCount = 0;
  
  for (const dir of directories) {
    const fullPath = join(process.cwd(), dir);
    if (existsSync(fullPath)) {
      try {
        rmSync(fullPath, { recursive: true, force: true });
        cleanedCount++;
        if (options.verbose) {
          log(`Removed directory ${dir}`, 'success');
        }
      } catch (error) {
        log(`Failed to remove directory ${dir}: ${error.message}`, 'warning');
      }
    }
  }
  
  if (cleanedCount > 0) {
    log(`Cleaned up ${cleanedCount} local directories`, 'success');
  }
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles(): Promise<void> {
  log('Cleaning up temporary files...');
  
  const tempFiles = [
    'apps/server/.env.temp',
    'apps/web/.env.temp',
    '.setup-state.json'
  ];
  
  let cleanedCount = 0;
  
  for (const file of tempFiles) {
    const fullPath = join(process.cwd(), file);
    if (existsSync(fullPath)) {
      try {
        rmSync(fullPath);
        cleanedCount++;
        if (options.verbose) {
          log(`Removed temp file ${file}`, 'success');
        }
      } catch (error) {
        log(`Failed to remove temp file ${file}: ${error.message}`, 'warning');
      }
    }
  }
  
  if (cleanedCount > 0) {
    log(`Cleaned up ${cleanedCount} temporary files`, 'success');
  }
}

/**
 * Prune Docker system (optional)
 */
async function pruneDockerSystem(): Promise<void> {
  if (!options.force) {
    return;
  }
  
  log('Pruning Docker system...');
  
  try {
    await exec('docker system prune -f', 'prune Docker system');
    log('Docker system pruned', 'success');
  } catch (error) {
    log('Failed to prune Docker system', 'warning');
  }
}

/**
 * Display cleanup summary
 */
function displaySummary(): void {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + chalk.green.bold('🧹 OpenChat development environment cleanup complete!') + '\n');
  
  if (options.keepData) {
    console.log(chalk.blue('📦 Data preserved:'));
    console.log('  • Database volumes kept');
    console.log('  • Local data directories kept');
  } else {
    console.log(chalk.red('🗑️  Data removed:'));
    console.log('  • All database data');
    console.log('  • Local data directories');
  }
  
  console.log('\n' + chalk.blue('🚀 To restart development environment:'));
  console.log(`  • Run setup: ${chalk.cyan('bun scripts/dev-setup.ts')}`);
  console.log(`  • Or use Docker Compose: ${chalk.cyan('docker compose up -d')}`);
  
  console.log('\n' + chalk.gray(`Cleanup completed in ${elapsed}s`));
}

/**
 * Main cleanup function
 */
async function main(): Promise<void> {
  console.log(chalk.blue.bold('🧹 OpenChat Development Environment Cleanup\n'));
  
  if (options.verbose) {
    log('Running in verbose mode', 'info');
  }
  
  try {
    // Confirm cleanup unless forced
    const confirmed = await confirmCleanup();
    if (!confirmed) {
      log('Cleanup cancelled by user', 'info');
      return;
    }
    
    // Perform cleanup steps
    await stopContainers();
    await removeContainers();
    await removeVolumes();
    await removeNetwork();
    await cleanupLocalDirectories();
    await cleanupTempFiles();
    await pruneDockerSystem();
    
    // Show summary
    displaySummary();
    
  } catch (error) {
    log(`Cleanup failed: ${error.message}`, 'error');
    console.log('\n' + chalk.red('Cleanup failed. Please check the errors above.'));
    console.log(chalk.blue('You may need to manually clean up Docker resources.'));
    process.exit(1);
  }
}

// Track cleanup start time
const startTime = Date.now();

// Handle script termination
process.on('SIGINT', () => {
  log('Cleanup interrupted by user', 'warning');
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('Cleanup terminated', 'warning');
  process.exit(1);
});

// Run main cleanup
main();