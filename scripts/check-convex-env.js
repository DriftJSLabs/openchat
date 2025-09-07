#!/usr/bin/env node

console.log(`
Convex Auth: Required backend environment variables (local + prod)

We use @convex-dev/auth with JWTs. Configure these envs in your Convex deployment:

1) CONVEX_SITE_URL
   - Local dev: http://127.0.0.1:3210
   - Convex Cloud sets this automatically in production (verify correctness)

2) JWT_PRIVATE_KEY
   - Generate with:  cd apps/server && npx auth generate-keys
   - Paste the single-line PKCS8 value

3) JWKS
   - From the same generator output (JSON string)

Set them via CLI (after starting local dev in another terminal):

  cd apps/server
  npx convex dev   # keep this running

  # In another terminal:
  npx convex env set CONVEX_SITE_URL http://127.0.0.1:3210
  npx convex env set JWT_PRIVATE_KEY "<paste private key>"
  npx convex env set JWKS '<paste jwks json>'

Verify JWKS is served:
  curl -sS http://127.0.0.1:3210/.well-known/jwks.json | jq .

Reset local data if needed via dashboard:
  http://127.0.0.1:6790

More detailed steps: apps/server/SETUP_AUTH.md
`);
