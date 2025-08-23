import { nanoid } from 'nanoid';

/**
 * Database Migration Manager
 * 
 * Handles versioned database schema migrations for local SQLite database.
 * Provides forward migration capabilities with rollback support and 
 * comprehensive error handling.
 */

export interface Migration {
  /** Unique migration version identifier */
  version: string;
  /** Human-readable migration description */
  description: string;
  /** SQL statements to apply the migration */
  up: string[];
  /** SQL statements to rollback the migration */
  down: string[];
  /** Dependencies on other migrations */
  dependencies?: string[];
  /** Timestamp when migration was created */
  createdAt: number;
}

export interface MigrationRecord {
  id: string;
  version: string;
  description: string;
  appliedAt: number;
  rollbackSql?: string;
}

export interface MigrationStatus {
  version: string;
  description: string;
  status: 'pending' | 'applied' | 'error';
  appliedAt?: number;
  error?: string;
}

/**
 * Migration execution context with database operations
 */
export interface MigrationContext {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowid: number }>;
  transaction: (operations: Array<{ sql: string; params?: any[] }>) => Promise<void>;
}

export class MigrationManager {
  private context: MigrationContext;
  private migrations: Map<string, Migration> = new Map();
  private applied: Set<string> = new Set();

  constructor(context: MigrationContext) {
    this.context = context;
  }

  /**
   * Registers a migration for execution
   */
  registerMigration(migration: Migration): void {
    // Validate migration structure
    this.validateMigration(migration);
    
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration ${migration.version} is already registered`);
    }

    this.migrations.set(migration.version, migration);
  }

  /**
   * Validates migration structure and dependencies
   */
  private validateMigration(migration: Migration): void {
    if (!migration.version || typeof migration.version !== 'string') {
      throw new Error('Migration version must be a non-empty string');
    }

    if (!migration.description || typeof migration.description !== 'string') {
      throw new Error('Migration description must be a non-empty string');
    }

    if (!Array.isArray(migration.up) || migration.up.length === 0) {
      throw new Error('Migration must have at least one UP statement');
    }

    if (!Array.isArray(migration.down)) {
      throw new Error('Migration must have DOWN statements array');
    }

    // Validate SQL statements are non-empty
    migration.up.forEach((sql, index) => {
      if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
        throw new Error(`Migration UP statement ${index + 1} is empty or invalid`);
      }
    });

    migration.down.forEach((sql, index) => {
      if (sql && (typeof sql !== 'string' || sql.trim().length === 0)) {
        throw new Error(`Migration DOWN statement ${index + 1} is invalid`);
      }
    });
  }

  /**
   * Initializes the migration system by creating the migrations table
   */
  async initialize(): Promise<void> {
    try {
      // Create migrations tracking table if it doesn't exist
      await this.context.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          version TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          applied_at INTEGER NOT NULL,
          rollback_sql TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Create index for faster version lookups
      await this.context.run(`
        CREATE INDEX IF NOT EXISTS idx_migrations_version ON migrations(version)
      `);

      // Load applied migrations
      await this.loadAppliedMigrations();
    } catch (error) {
      throw new Error(`Failed to initialize migration manager: ${error}`);
    }
  }

  /**
   * Loads the list of applied migrations from database
   */
  private async loadAppliedMigrations(): Promise<void> {
    try {
      const records = await this.context.query(`
        SELECT version FROM migrations ORDER BY applied_at ASC
      `);

      this.applied.clear();
      records.forEach(record => {
        this.applied.add(record.version);
      });
    } catch (error) {
      throw new Error(`Failed to load applied migrations: ${error}`);
    }
  }

  /**
   * Gets the current migration status for all registered migrations
   */
  async getStatus(): Promise<MigrationStatus[]> {
    await this.loadAppliedMigrations();
    
    const status: MigrationStatus[] = [];
    
    // Sort migrations by version for consistent ordering
    const sortedMigrations = Array.from(this.migrations.values())
      .sort((a, b) => a.version.localeCompare(b.version));

    for (const migration of sortedMigrations) {
      const isApplied = this.applied.has(migration.version);
      
      let appliedAt: number | undefined;
      if (isApplied) {
        try {
          const record = await this.context.query(
            'SELECT applied_at FROM migrations WHERE version = ?',
            [migration.version]
          );
          appliedAt = record[0]?.applied_at;
        } catch (error) {
          // Continue without applied_at timestamp
        }
      }

      status.push({
        version: migration.version,
        description: migration.description,
        status: isApplied ? 'applied' : 'pending',
        appliedAt
      });
    }

    return status;
  }

  /**
   * Runs all pending migrations in dependency order
   */
  async migrate(): Promise<void> {
    await this.loadAppliedMigrations();
    
    const pendingMigrations = this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to apply');
      return;
    }

    console.log(`Applying ${pendingMigrations.length} pending migration(s)...`);

    for (const migration of pendingMigrations) {
      try {
        await this.applyMigration(migration);
        console.log(`✓ Applied migration ${migration.version}: ${migration.description}`);
      } catch (error) {
        console.error(`✗ Failed to apply migration ${migration.version}: ${error}`);
        throw error;
      }
    }

    console.log('All migrations applied successfully');
  }

  /**
   * Gets pending migrations sorted by dependencies and version
   */
  private getPendingMigrations(): Migration[] {
    const pending = Array.from(this.migrations.values())
      .filter(migration => !this.applied.has(migration.version));

    // Sort by dependencies, then by version
    return this.topologicalSort(pending);
  }

  /**
   * Sorts migrations by dependencies using topological sort
   */
  private topologicalSort(migrations: Migration[]): Migration[] {
    const sorted: Migration[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const migrationMap = new Map(migrations.map(m => [m.version, m]));

    const visit = (migration: Migration): void => {
      if (visited.has(migration.version)) {
        return;
      }

      if (visiting.has(migration.version)) {
        throw new Error(`Circular dependency detected involving migration ${migration.version}`);
      }

      visiting.add(migration.version);

      // Visit dependencies first
      if (migration.dependencies) {
        for (const depVersion of migration.dependencies) {
          const dependency = migrationMap.get(depVersion);
          if (dependency) {
            visit(dependency);
          } else if (!this.applied.has(depVersion)) {
            throw new Error(`Migration ${migration.version} depends on ${depVersion} which is not registered or applied`);
          }
        }
      }

      visiting.delete(migration.version);
      visited.add(migration.version);
      sorted.push(migration);
    };

    migrations.forEach(visit);
    return sorted;
  }

  /**
   * Applies a single migration within a transaction
   */
  private async applyMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Execute migration statements in transaction
      const operations = migration.up.map(sql => ({ sql, params: [] }));
      
      // Add migration record operation
      const migrationRecord = {
        sql: `INSERT INTO migrations (id, version, description, applied_at, rollback_sql) 
              VALUES (?, ?, ?, ?, ?)`,
        params: [
          nanoid(),
          migration.version,
          migration.description,
          Math.floor(Date.now() / 1000),
          JSON.stringify(migration.down)
        ]
      };
      
      operations.push(migrationRecord);
      
      // Execute all operations in a single transaction
      await this.context.transaction(operations);
      
      // Update applied migrations cache
      this.applied.add(migration.version);
      
      const duration = Date.now() - startTime;
      console.log(`Migration ${migration.version} applied in ${duration}ms`);
      
    } catch (error) {
      throw new Error(`Failed to apply migration ${migration.version}: ${error}`);
    }
  }

  /**
   * Rolls back a specific migration
   */
  async rollback(version: string): Promise<void> {
    if (!this.applied.has(version)) {
      throw new Error(`Migration ${version} is not applied`);
    }

    try {
      // Get rollback SQL from database
      const record = await this.context.query(
        'SELECT rollback_sql FROM migrations WHERE version = ?',
        [version]
      );

      if (!record.length) {
        throw new Error(`Migration record for ${version} not found`);
      }

      const rollbackStatements: string[] = JSON.parse(record[0].rollback_sql || '[]');
      
      if (rollbackStatements.length === 0) {
        throw new Error(`No rollback statements defined for migration ${version}`);
      }

      // Execute rollback statements in transaction
      const operations = rollbackStatements.map(sql => ({ sql, params: [] }));
      
      // Remove migration record
      operations.push({
        sql: 'DELETE FROM migrations WHERE version = ?',
        params: [version]
      });

      await this.context.transaction(operations);
      
      // Update applied migrations cache
      this.applied.delete(version);
      
      console.log(`✓ Rolled back migration ${version}`);
      
    } catch (error) {
      throw new Error(`Failed to rollback migration ${version}: ${error}`);
    }
  }

  /**
   * Checks if all registered migrations are applied
   */
  async isUpToDate(): Promise<boolean> {
    await this.loadAppliedMigrations();
    
    const registeredVersions = new Set(this.migrations.keys());
    
    // Check if all registered migrations are applied
    for (const version of registeredVersions) {
      if (!this.applied.has(version)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Gets information about a specific migration
   */
  getMigration(version: string): Migration | undefined {
    return this.migrations.get(version);
  }

  /**
   * Lists all registered migrations
   */
  listMigrations(): Migration[] {
    return Array.from(this.migrations.values())
      .sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Validates that the database schema matches the expected state
   */
  async validateSchema(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Check that migrations table exists
      const tables = await this.context.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `);
      
      if (!tables.length) {
        errors.push('Migrations table does not exist');
      }
      
      // Additional schema validation can be added here
      // For example, checking that all expected tables exist
      
    } catch (error) {
      errors.push(`Schema validation failed: ${error}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Helper function to create a migration
 */
export function createMigration(options: {
  version: string;
  description: string;
  up: string[];
  down: string[];
  dependencies?: string[];
}): Migration {
  return {
    version: options.version,
    description: options.description,
    up: options.up,
    down: options.down,
    dependencies: options.dependencies,
    createdAt: Date.now()
  };
}