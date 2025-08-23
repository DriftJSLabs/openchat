/**
 * CSRF Token endpoint for secure form submissions
 * Provides CSRF tokens for client-side requests
 */

import { NextRequest } from 'next/server';
import { generateCSRFToken, createCSRFHeaders } from '@/lib/csrf-protection';

/**
 * GET endpoint to retrieve a new CSRF token
 */
export async function GET(request: NextRequest) {
  try {
    // Generate a new CSRF token
    const token = generateCSRFToken();
    
    // Create secure headers
    const csrfHeaders = createCSRFHeaders(token);
    
    return new Response(
      JSON.stringify({
        token,
        expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          ...csrfHeaders
        },
      }
    );
  } catch (error) {
    console.error('[CSRF] Token generation failed:', error);
    
    return new Response(
      JSON.stringify({
        error: {
          message: 'Failed to generate CSRF token',
          type: 'csrf_generation_failed',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}