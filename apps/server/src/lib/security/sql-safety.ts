/**
 * OpenChat Security: SQL Safety Utilities
 * 
 * This module provides utilities to prevent SQL injection vulnerabilities
 * when working with dynamic queries and parameters.
 * 
 * Features:
 * - Safe dynamic IN clause generation
 * - Parameter validation and sanitization
 * - Query pattern validation
 * - SQL injection pattern detection
 */

import { sql, SQL } from "drizzle-orm";
import { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Dangerous SQL patterns that should be detected and blocked
 */
const SQL_INJECTION_PATTERNS = [
  /;\s*(drop|delete|update|insert|create|alter|truncate)/i,
  /union\s+select/i,
  /\/\*.*\*\//,
  /--\s*.*/,
  /xp_cmdshell/i,
  /sp_executesql/i,
  /';\s*(drop|delete|update|insert)/i,
  /\b(or|and)\s+1\s*=\s*1/i,
  /\b(or|and)\s+['"]1['"]?\s*=\s*['"]1/i
] as const;

/**
 * Safe alternatives for common SQL operations that are prone to injection
 */
export class SQLSafetyUtils {
  
  /**
   * Create a safe IN clause for an array of values
   * SECURITY: Uses proper parameterization instead of string concatenation
   */
  static createSafeInClause<T extends string | number>(
    column: AnyPgColumn,
    values: T[]
  ): SQL {
    if (values.length === 0) {
      // Return a condition that will never match
      return sql`1 = 0`;
    }

    // Validate that all values are safe (basic type checking)
    const validatedValues = values.filter(value => this.isValidValue(value));
    
    if (validatedValues.length !== values.length) {
      throw new Error('Some values in the IN clause are not safe');
    }

    // Use proper parameterized query with placeholders
    const placeholders = validatedValues.map(() => sql`?`);
    return sql`${column} IN (${sql.join(placeholders, sql`, `)})`.append(...validatedValues);
  }

  /**
   * Create a safe NOT IN clause for an array of values  
   * SECURITY: Uses proper parameterization instead of string concatenation
   */
  static createSafeNotInClause<T extends string | number>(
    column: AnyPgColumn,
    values: T[]
  ): SQL {
    if (values.length === 0) {
      // Return a condition that always matches (no exclusions)
      return sql`1 = 1`;
    }

    // Validate that all values are safe
    const validatedValues = values.filter(value => this.isValidValue(value));
    
    if (validatedValues.length !== values.length) {
      throw new Error('Some values in the NOT IN clause are not safe');
    }

    // Use proper parameterized query with placeholders
    const placeholders = validatedValues.map(() => sql`?`);
    return sql`${column} NOT IN (${sql.join(placeholders, sql`, `)})`.append(...validatedValues);
  }

  /**
   * Create safe LIKE condition with proper escaping
   * SECURITY: Prevents wildcard injection and SQL injection via LIKE patterns
   */
  static createSafeLikeCondition(
    column: AnyPgColumn,
    searchTerm: string,
    options: {
      caseSensitive?: boolean;
      wildcardPosition?: 'start' | 'end' | 'both' | 'none';
      escapeExistingWildcards?: boolean;
    } = {}
  ): SQL {
    const {
      caseSensitive = false,
      wildcardPosition = 'both',
      escapeExistingWildcards = true
    } = options;

    // Validate and sanitize the search term
    let sanitizedTerm = this.sanitizeLikePattern(searchTerm, escapeExistingWildcards);

    // Add wildcards based on position
    switch (wildcardPosition) {
      case 'start':
        sanitizedTerm = `%${sanitizedTerm}`;
        break;
      case 'end':
        sanitizedTerm = `${sanitizedTerm}%`;
        break;
      case 'both':
        sanitizedTerm = `%${sanitizedTerm}%`;
        break;
      case 'none':
        // No wildcards added
        break;
    }

    // Use appropriate LIKE or ILIKE
    if (caseSensitive) {
      return sql`${column} LIKE ${sanitizedTerm}`;
    } else {
      return sql`${column} ILIKE ${sanitizedTerm}`;
    }
  }

  /**
   * Validate that a value is safe for use in SQL queries
   */
  private static isValidValue(value: any): boolean {
    // Check type safety
    if (typeof value !== 'string' && typeof value !== 'number') {
      return false;
    }

    // For strings, check for SQL injection patterns
    if (typeof value === 'string') {
      return !this.containsSQLInjection(value);
    }

    // For numbers, ensure they're finite
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    return true;
  }

  /**
   * Check if a string contains potential SQL injection patterns
   */
  static containsSQLInjection(input: string): boolean {
    return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
  }

  /**
   * Sanitize LIKE patterns to prevent wildcard injection
   */
  private static sanitizeLikePattern(pattern: string, escapeWildcards: boolean): string {
    if (!escapeWildcards) {
      return pattern;
    }

    // Escape existing SQL wildcards and escape characters
    return pattern
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/%/g, '\\%')    // Escape % wildcards
      .replace(/_/g, '\\_');   // Escape _ wildcards
  }

  /**
   * Create a safe ORDER BY clause from user input
   * SECURITY: Prevents injection via ORDER BY clauses
   */
  static createSafeOrderBy(
    allowedColumns: Record<string, AnyPgColumn>,
    orderBy: string,
    direction: 'asc' | 'desc' = 'asc'
  ): SQL | null {
    // Validate that the column is in the allowed list
    const column = allowedColumns[orderBy];
    if (!column) {
      console.warn(`Attempted to order by disallowed column: ${orderBy}`);
      return null;
    }

    // Validate direction
    if (direction !== 'asc' && direction !== 'desc') {
      throw new Error(`Invalid sort direction: ${direction}`);
    }

    if (direction === 'desc') {
      return sql`${column} DESC`;
    } else {
      return sql`${column} ASC`;
    }
  }

  /**
   * Create safe date range conditions
   * SECURITY: Validates date inputs to prevent injection via date strings
   */
  static createSafeDateRange(
    dateColumn: AnyPgColumn,
    startDate?: string | Date,
    endDate?: string | Date
  ): SQL[] {
    const conditions: SQL[] = [];

    if (startDate) {
      const validatedStartDate = this.validateDate(startDate);
      if (validatedStartDate) {
        conditions.push(sql`${dateColumn} >= ${validatedStartDate}`);
      }
    }

    if (endDate) {
      const validatedEndDate = this.validateDate(endDate);
      if (validatedEndDate) {
        conditions.push(sql`${dateColumn} <= ${validatedEndDate}`);
      }
    }

    return conditions;
  }

  /**
   * Validate and convert date input to safe Date object
   */
  private static validateDate(input: string | Date): Date | null {
    try {
      let date: Date;
      
      if (typeof input === 'string') {
        // Basic validation for common date formats
        if (!/^\d{4}-\d{2}-\d{2}/.test(input)) {
          throw new Error('Invalid date format');
        }
        date = new Date(input);
      } else {
        date = input;
      }

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }

      // Check for reasonable date range (prevent extremely old/future dates)
      const year = date.getFullYear();
      if (year < 1900 || year > 2100) {
        throw new Error('Date out of reasonable range');
      }

      return date;
    } catch (error) {
      console.warn(`Date validation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Create safe full-text search condition
   * SECURITY: Uses proper parameterization for text search
   */
  static createSafeTextSearch(
    searchColumns: AnyPgColumn[],
    searchTerm: string,
    options: {
      useFullTextSearch?: boolean;
      caseSensitive?: boolean;
    } = {}
  ): SQL | null {
    const { useFullTextSearch = false, caseSensitive = false } = options;

    // Sanitize search term
    if (this.containsSQLInjection(searchTerm)) {
      console.warn('Potential SQL injection detected in search term');
      return null;
    }

    if (searchTerm.trim().length === 0) {
      return null;
    }

    if (useFullTextSearch) {
      // Use PostgreSQL full-text search (requires tsvector setup)
      const searchQuery = searchTerm.trim().split(/\s+/).join(' & ');
      return sql`to_tsvector('english', ${searchColumns[0]}) @@ to_tsquery('english', ${searchQuery})`;
    } else {
      // Use LIKE/ILIKE search across multiple columns
      const likePattern = `%${this.sanitizeLikePattern(searchTerm, true)}%`;
      const operator = caseSensitive ? sql`LIKE` : sql`ILIKE`;
      
      const conditions = searchColumns.map(column => 
        sql`${column} ${operator} ${likePattern}`
      );
      
      return sql`(${sql.join(conditions, sql` OR `)})`;
    }
  }

  /**
   * Validate UUID format to prevent injection via ID parameters
   */
  static validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Create safe limit and offset for pagination
   * SECURITY: Validates pagination parameters to prevent resource exhaustion
   */
  static createSafePagination(
    limit?: number,
    offset?: number,
    maxLimit: number = 1000
  ): { safeLimit: number; safeOffset: number } {
    // Validate and sanitize limit
    let safeLimit = 50; // default limit
    if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
      safeLimit = Math.min(limit, maxLimit);
    }

    // Validate and sanitize offset
    let safeOffset = 0;
    if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) {
      safeOffset = Math.min(offset, 1000000); // Prevent extremely large offsets
    }

    return { safeLimit, safeOffset };
  }
}

/**
 * Convenience functions for common safe SQL operations
 */

/**
 * Create safe IN clause - convenience function
 */
export function safeIn<T extends string | number>(
  column: AnyPgColumn,
  values: T[]
): SQL {
  return SQLSafetyUtils.createSafeInClause(column, values);
}

/**
 * Create safe NOT IN clause - convenience function
 */
export function safeNotIn<T extends string | number>(
  column: AnyPgColumn,
  values: T[]
): SQL {
  return SQLSafetyUtils.createSafeNotInClause(column, values);
}

/**
 * Create safe LIKE condition - convenience function
 */
export function safeLike(
  column: AnyPgColumn,
  searchTerm: string,
  options?: Parameters<typeof SQLSafetyUtils.createSafeLikeCondition>[2]
): SQL {
  return SQLSafetyUtils.createSafeLikeCondition(column, searchTerm, options);
}

/**
 * Create safe ORDER BY - convenience function
 */
export function safeOrderBy(
  allowedColumns: Record<string, AnyPgColumn>,
  orderBy: string,
  direction?: 'asc' | 'desc'
): SQL | null {
  return SQLSafetyUtils.createSafeOrderBy(allowedColumns, orderBy, direction);
}

export { SQLSafetyUtils };