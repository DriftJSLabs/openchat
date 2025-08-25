/**
 * Playwright End-to-End Testing Configuration
 * 
 * This configuration sets up comprehensive E2E testing for OpenChat
 * across multiple browsers and devices.
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Use different ports for E2E testing to avoid conflicts
const E2E_SERVER_PORT = 3010;
const E2E_WEB_PORT = 3011;
const E2E_ELECTRIC_PORT = 5135;

export default defineConfig({
  // Test directory
  testDir: './e2e',
  
  // Test file patterns
  testMatch: '**/*.{test,spec}.{ts,js}',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
        ['json', { outputFile: 'test-results/e2e-results.json' }],
      ]
    : [
        ['html'],
        ['line'],
      ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    
    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Record video on failure
    video: process.env.CI ? 'retain-on-failure' : 'off',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Test timeout
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
  
  // Global setup and teardown
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  
  // Test timeout
  timeout: 30000,
  
  // Expect timeout for assertions
  expect: {
    timeout: 5000,
  },
  
  // Configure projects for major browsers
  projects: [
    // Setup project that starts the dev servers
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /.*\.teardown\.ts/,
    },
    
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },
    
    // Mobile devices
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },
    
    // Tablet
    {
      name: 'tablet',
      use: { ...devices['iPad Pro'] },
      dependencies: ['setup'],
    },
    
    // Branded browsers (for compatibility testing)
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      dependencies: ['setup'],
    },
    {
      name: 'chrome-branded',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      dependencies: ['setup'],
    },
  ],
  
  // Web server configuration
  webServer: [
    // Start the OpenChat server
    {
      command: `NODE_ENV=test PORT=${E2E_SERVER_PORT} bun dev`,
      port: E2E_SERVER_PORT,
      cwd: path.resolve(__dirname, '../../server'),
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        DATABASE_URL: 'postgresql://openchat:openchat_test@localhost:5432/openchat_test',
        ELECTRIC_URL: `http://localhost:${E2E_ELECTRIC_PORT}`,
        CORS_ORIGIN: `http://localhost:${E2E_WEB_PORT}`,
        BETTER_AUTH_URL: `http://localhost:${E2E_SERVER_PORT}`,
        NODE_ENV: 'test',
      },
    },
    
    // Start the web application
    {
      command: `NODE_ENV=test PORT=${E2E_WEB_PORT} bun dev`,
      port: E2E_WEB_PORT,
      cwd: path.resolve(__dirname),
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        NEXT_PUBLIC_SERVER_URL: `http://localhost:${E2E_SERVER_PORT}`,
        NEXT_PUBLIC_ELECTRIC_URL: `http://localhost:${E2E_ELECTRIC_PORT}`,
        NODE_ENV: 'test',
      },
    },
  ],
  
  // Output directories
  outputDir: 'test-results/',
  
  // Test artifacts
  testDir: './e2e',
});