/**
 * Database Migration Registry
 * 
 * Centralized registration of all database migrations. This file imports
 * and registers all migration files to ensure they are available to the
 * migration manager in the correct order.
 */

import { MigrationManager, type MigrationContext } from './migration-manager';
import { migration001 } from './001-initial-schema';
import { migration002 } from './002-enhanced-features';
import { migration003 } from './003-advanced-messaging';
import { migration004 } from './004-analytics-suggestions';

/**
 * Registers all available migrations with the migration manager
 */
export function registerMigrations(manager: MigrationManager): void {
  // Register migrations in chronological order
  manager.registerMigration(migration001);
  manager.registerMigration(migration002);
  manager.registerMigration(migration003);
  manager.registerMigration(migration004);
}

/**
 * Creates a configured migration manager with all migrations registered
 */
export function createMigrationManager(context: MigrationContext): MigrationManager {
  const manager = new MigrationManager(context);
  registerMigrations(manager);
  return manager;
}

/**
 * Available migration versions for reference
 */
export const MIGRATION_VERSIONS = {
  INITIAL_SCHEMA: '001',
  ENHANCED_FEATURES: '002',
  ADVANCED_MESSAGING: '003',
  ANALYTICS_SUGGESTIONS: '004',
} as const;

/**
 * Migration descriptions for user-friendly display
 */
export const MIGRATION_DESCRIPTIONS = {
  [MIGRATION_VERSIONS.INITIAL_SCHEMA]: 'Initial schema setup with core tables',
  [MIGRATION_VERSIONS.ENHANCED_FEATURES]: 'Add enhanced chat features and analytics',
  [MIGRATION_VERSIONS.ADVANCED_MESSAGING]: 'Add advanced messaging features with versioning and attachments',
  [MIGRATION_VERSIONS.ANALYTICS_SUGGESTIONS]: 'Add detailed analytics and smart suggestions',
} as const;

/**
 * Utility function to get the latest migration version
 */
export function getLatestMigrationVersion(): string {
  const versions = Object.values(MIGRATION_VERSIONS);
  return versions[versions.length - 1];
}

/**
 * Utility function to check if a version is valid
 */
export function isValidMigrationVersion(version: string): boolean {
  return Object.values(MIGRATION_VERSIONS).includes(version as any);
}

// Re-export types and utilities for convenience
export type { Migration, MigrationRecord, MigrationStatus, MigrationContext } from './migration-manager';
export { MigrationManager, createMigration } from './migration-manager';