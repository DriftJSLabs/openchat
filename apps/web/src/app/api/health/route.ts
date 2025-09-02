import { NextRequest } from 'next/server';

export const runtime = 'edge';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const startTime = Date.now();
  const checks: HealthCheck['checks'] = {};
  let overallStatus: 'healthy' | 'unhealthy' = 'healthy';

  // Check environment variables
  checks.environment = {
    status: process.env.NODE_ENV ? 'pass' : 'fail',
    message: process.env.NODE_ENV ? `Environment: ${process.env.NODE_ENV}` : 'NODE_ENV not set'
  };

  // Check Convex URL
  checks.convex = {
    status: process.env.NEXT_PUBLIC_CONVEX_URL ? 'pass' : 'fail',
    message: process.env.NEXT_PUBLIC_CONVEX_URL ? 'Convex URL configured' : 'Convex URL missing'
  };

  // Check API keys availability
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  checks.api_keys = {
    status: (hasOpenAI || hasAnthropic) ? 'pass' : 'fail',
    message: `OpenAI: ${hasOpenAI ? 'configured' : 'missing'}, Anthropic: ${hasAnthropic ? 'configured' : 'missing'}`
  };

  // Check storage configuration
  const hasKV = !!process.env.KV_URL;
  checks.storage = {
    status: 'pass', // Always pass since we have memory fallback
    message: hasKV ? 'Using Vercel KV' : 'Using memory storage (development only)'
  };

  // Basic memory usage check (for Edge Runtime, this is limited)
  try {
    const memoryUsage = process.memoryUsage?.();
    if (memoryUsage) {
      const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      checks.memory = {
        status: memoryMB < 100 ? 'pass' : 'fail', // Arbitrary limit for demo
        message: `Heap used: ${memoryMB}MB`
      };
    } else {
      checks.memory = {
        status: 'pass',
        message: 'Memory usage not available in Edge Runtime'
      };
    }
  } catch (error) {
    checks.memory = {
      status: 'pass',
      message: 'Memory check not available'
    };
  }

  // Response time check
  const responseTime = Date.now() - startTime;
  checks.response_time = {
    status: responseTime < 1000 ? 'pass' : 'fail',
    message: `${responseTime}ms`
  };

  // Determine overall status
  const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
  if (failedChecks.length > 0) {
    overallStatus = 'unhealthy';
  }

  const healthCheck: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 503;

  return new Response(JSON.stringify(healthCheck, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  });
}