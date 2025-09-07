Convex Auth: Local Development Setup (Doc-Aligned)

This project uses @convex-dev/auth with JWTs that are generated and verified by Convex.
To run locally in the same way as production, configure Convex backend environment
variables explicitly. Do NOT rely on hardcoded defaults.

Requirements
- Convex CLI installed (`npm i -g convex`) or use `npx convex`
- Node/Bun installed

Steps
1) Start local Convex once to ensure a deployment exists
   cd apps/server
   npx convex dev

   Keep it running in a terminal. In another terminal, continue.

2) Generate JWT keys (one-time)
   npx auth generate-keys

   Copy the outputs:
   - JWT_PRIVATE_KEY (single-line PKCS8 key)
   - JWKS (JSON string)

3) Set Convex backend environment variables
   # Local backend URL used as issuer (matches @convex-dev/auth expectations)
   npx convex env set CONVEX_SITE_URL http://127.0.0.1:3210

   # JWT signing private key
   npx convex env set JWT_PRIVATE_KEY "<paste JWT_PRIVATE_KEY>"

   # JWKS JSON string (public key)
   npx convex env set JWKS '<paste JWKS JSON>'

   Optional: If you want a custom issuer, set AUTH_ISSUER as well and ensure
   @convex-dev/auth generates tokens with the same issuer.

4) Restart local Convex
   Stop the previous `npx convex dev` and start it again. The deploy summary
   should no longer complain about missing AUTH_ISSUER/JWKS.

5) Start the web app
   In repo root: bun run dev

Notes
- Production requires the same envs to be set for the deployment (via Convex dashboard).
- The web client uses NEXT_PUBLIC_CONVEX_URL to point to your Convex deployment.
- The ConvexAuthProvider token storage namespace is set to this URL to avoid
  any mismatch when reading local tokens.

