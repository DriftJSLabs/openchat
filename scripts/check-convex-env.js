#!/usr/bin/env node

console.log(`
To fix the Convex deployment, you need to set the AUTH_SECRET_1 environment variable in Convex.

Option 1 - Via Convex Dashboard:
1. Go to https://dashboard.convex.dev
2. Select your project
3. Go to Settings → Environment Variables
4. Add AUTH_SECRET_1 with a secure value

Option 2 - Via CLI (requires local dev server):
1. Start local Convex: cd apps/server && npx convex dev
2. In another terminal: cd apps/server && npx convex env set AUTH_SECRET_1 "your-secret-value" --prod

Generate a secure secret with: openssl rand -base64 32

Note: Convex Auth may append a suffix to the AUTH_SECRET variable name internally.
If AUTH_SECRET_1 doesn't work, you may need to check the exact variable name in the deployment logs.
`);