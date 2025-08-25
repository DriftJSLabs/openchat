/**
 * Main types export file for OpenChat server
 * Import from this file to get all server-side types
 */

// Export all API types
export * from './api';

// Re-export database types
export * from '../db';

// Export commonly used utility types
export type JSONValue = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Context type for request handlers
 */
export interface RequestContext {
  session?: {
    user: {
      id: string;
      email: string;
      name: string;
    };
  };
  userId?: string;
  deviceId?: string;
}

/**
 * Middleware context extension
 */
export interface MiddlewareContext {
  requestId: string;
  startTime: number;
  userAgent?: string;
  ipAddress?: string;
}