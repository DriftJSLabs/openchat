/**
 * Environment Configuration Test
 * 
 * Run this file to verify environment configuration is working correctly.
 * Usage: npx tsx src/lib/env.test.ts
 */

import { env } from './env';

console.log('🔍 Testing Environment Configuration...\n');

// Test required variables
console.log('✅ Required Variables:');
console.log(`   NEXT_PUBLIC_CONVEX_URL: ${env.NEXT_PUBLIC_CONVEX_URL ? '✓' : '✗'}`);
console.log(`   BETTER_AUTH_SECRET: ${env.BETTER_AUTH_SECRET ? '✓ (set or generated)' : '✗'}`);
console.log(`   BETTER_AUTH_DATABASE_URL: ${env.BETTER_AUTH_DATABASE_URL}`);
console.log(`   OPENROUTER_ENCRYPTION_SECRET: ${env.OPENROUTER_ENCRYPTION_SECRET ? '✓ (set or generated)' : '✗'}`);

console.log('\n📍 Application URLs:');
console.log(`   Base URL: ${env.getBaseURL()}`);
console.log(`   NEXT_PUBLIC_APP_URL: ${env.NEXT_PUBLIC_APP_URL || '(not set - using default)'}`);
console.log(`   NEXT_PUBLIC_OPENROUTER_APP_URL: ${env.NEXT_PUBLIC_OPENROUTER_APP_URL}`);

console.log('\n📂 Data Directories:');
console.log(`   AUTH_DATA_DIR: ${env.AUTH_DATA_DIR}`);
console.log(`   STREAM_DATA_DIR: ${env.STREAM_DATA_DIR}`);

console.log('\n🤖 AI Provider Keys:');
console.log(`   OpenAI: ${env.OPENAI_API_KEY ? '✓' : '✗ (optional)'}`);
console.log(`   Anthropic: ${env.ANTHROPIC_API_KEY ? '✓' : '✗ (optional)'}`);
console.log(`   Has any AI provider: ${env.hasAIProvider() ? '✓' : '✗'}`);

console.log('\n🎯 Environment Mode:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

// Check for production requirements
if (process.env.NODE_ENV === 'production') {
  console.log('\n⚠️  Production Requirements:');
  const issues = [];
  
  if (!env.NEXT_PUBLIC_APP_URL) {
    issues.push('NEXT_PUBLIC_APP_URL must be set in production');
  }
  
  if (!process.env.BETTER_AUTH_SECRET) {
    issues.push('BETTER_AUTH_SECRET should be explicitly set (not auto-generated) in production');
  }
  
  if (!process.env.OPENROUTER_ENCRYPTION_SECRET) {
    issues.push('OPENROUTER_ENCRYPTION_SECRET should be explicitly set (not auto-generated) in production');
  }
  
  if (issues.length > 0) {
    console.log('   ❌ Issues found:');
    issues.forEach(issue => console.log(`      - ${issue}`));
  } else {
    console.log('   ✅ All production requirements met!');
  }
} else {
  console.log('\n💡 Development mode - using auto-generated secrets where needed');
}

console.log('\n✨ Environment configuration test complete!');