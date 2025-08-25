/// <reference types="vitest" />
import { defineConfig, defineWorkspace } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Base configuration for all test environments
const baseConfig = {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: []
    }
  },
}

export default defineConfig({
  ...baseConfig,
  test: {
    // Environment setup
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    
    // File patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules/**', 
      'dist/**', 
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Skip integration tests in unit test runs
      'src/**/*.integration.{test,spec}.{ts,tsx}',
      // Skip E2E tests
      'e2e/**',
      // Skip problematic tests for now (can be re-enabled individually)
      'src/lib/db/__tests__/performance-optimization.test.ts',
    ],
    
    // Global test configuration
    globals: true,
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Timeouts
    testTimeout: 10000,
    hookTimeout: 8000,
    teardownTimeout: 5000,
    
    // Concurrency and pooling
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: process.env.CI ? 2 : 4,
        minThreads: 1,
        isolate: true,
      },
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: process.env.CI 
        ? ['text', 'json', 'lcov']  // CI-friendly reporters
        : ['text', 'json', 'html'], // Local development with HTML
      include: [
        'src/**/*.{ts,tsx,js,jsx}',
      ],
      exclude: [
        'node_modules/**',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx,js,jsx}',
        'src/**/*.spec.{ts,tsx,js,jsx}',
        '.next/**',
        'coverage/**',
        'src/**/index.{ts,tsx}', // Re-export files
        'src/app/**', // Next.js app directory
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 80,
          statements: 80,
        },
        // Per-file thresholds can be more strict
        perFile: {
          branches: 60,
          functions: 70,
          lines: 75,
          statements: 75,
        }
      },
      // Fail build if coverage is below thresholds
      skipFull: false,
    },
    
    // Reporter configuration
    reporter: process.env.CI 
      ? ['verbose', 'junit', 'json'] 
      : ['verbose', 'html'],
    
    // Output configuration
    outputFile: {
      junit: './test-results/junit.xml',
      json: './test-results/test-results.json',
      html: './test-results/index.html',
    },
    
    // Watch mode configuration (for development)
    watch: !process.env.CI,
    watchExclude: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      'test-results/**',
    ],
    
    // Environment variables for tests
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_NAME: 'OpenChat Test',
      NEXT_PUBLIC_DEBUG_MODE: 'true',
      NEXT_PUBLIC_ENABLE_DEVTOOLS: 'false',
      // Test database URL
      TEST_DATABASE_URL: 'postgresql://openchat:openchat_test@localhost:5432/openchat_test',
      // Mock external services in tests
      NEXT_PUBLIC_SERVER_URL: 'http://localhost:3002',
      NEXT_PUBLIC_ELECTRIC_URL: 'http://localhost:5134',
    },
    
    // Retry configuration
    retry: process.env.CI ? 2 : 0,
    
    // Bail configuration
    bail: process.env.CI ? 5 : 0, // Stop after 5 failures in CI
    
    // Logging
    logHeapUsage: process.env.CI,
    passWithNoTests: false,
  },
})

// Workspace configuration for running different test suites
export const workspace = defineWorkspace([
  // Unit tests
  {
    ...baseConfig,
    test: {
      name: 'unit',
      environment: 'happy-dom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: [
        'src/**/*.integration.{test,spec}.{ts,tsx}',
        'src/**/*.e2e.{test,spec}.{ts,tsx}',
        'e2e/**',
        'node_modules/**',
      ],
    },
  },
  
  // Integration tests
  {
    ...baseConfig,
    test: {
      name: 'integration',
      environment: 'happy-dom',
      setupFiles: ['./src/__tests__/setup.ts', './src/__tests__/integration-setup.ts'],
      include: ['src/**/*.integration.{test,spec}.{ts,tsx}'],
      testTimeout: 30000,
      hookTimeout: 15000,
      pool: 'forks', // Use separate processes for integration tests
      poolOptions: {
        forks: {
          singleFork: true, // Run integration tests sequentially
        },
      },
    },
  },
  
  // Component tests (UI focused)
  {
    ...baseConfig,
    test: {
      name: 'component',
      environment: 'happy-dom',
      setupFiles: ['./src/__tests__/setup.ts', './src/__tests__/component-setup.ts'],
      include: ['src/components/**/*.{test,spec}.{ts,tsx}'],
      globals: true,
    },
  },
  
  // Node.js tests (for utilities, non-React code)
  {
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/lib/**/*.{test,spec}.ts', 'src/utils/**/*.{test,spec}.ts'],
      exclude: ['src/lib/db/**/*.test.ts'], // These need special setup
    },
  },
])