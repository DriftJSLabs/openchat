# openchat

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Convex, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Convex** - Reactive backend-as-a-service platform
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Environment Configuration

OpenChat requires several environment variables to be configured. Create a `.env.local` file in the `apps/web` directory:

```bash
# Copy the example environment file
cp apps/web/.env.example apps/web/.env.local

# Generate secure secrets for authentication
cd apps/web && npm run env:generate
```

### Required Environment Variables

- `NEXT_PUBLIC_CONVEX_URL` - Your Convex project URL (get from [Convex Dashboard](https://dashboard.convex.dev))
- `BETTER_AUTH_SECRET` - Authentication secret (auto-generated in development)
- `NEXT_PUBLIC_APP_URL` - Your application URL (required in production)

### Optional Environment Variables

- `OPENAI_API_KEY` - For direct OpenAI access (optional)
- `ANTHROPIC_API_KEY` - For direct Anthropic access (optional)
- `OPENROUTER_ENCRYPTION_SECRET` - For encrypting OpenRouter tokens

See `apps/web/.env.example` for complete documentation of all environment variables.

## Convex Setup

This project uses Convex as a backend. You'll need to set up Convex before running the app:

```bash
bun dev:setup
```

Follow the prompts to create a new Convex project and connect it to your application.

Then, run the development server:

```bash
bun dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.





## Project Structure

```
openchat/
├── apps/
│   ├── web/         # Frontend application (Next.js)
├── packages/
│   └── backend/     # Convex backend functions and schema
```

## Available Scripts

- `bun dev`: Start all applications in development mode
- `bun build`: Build all applications
- `bun dev:web`: Start only the web application
- `bun dev:setup`: Setup and configure your Convex project
- `bun check-types`: Check TypeScript types across all apps
# Authentication Setup Complete

## Tests (Auth + Env)

Run Bun-based tests to validate auth configuration and environment handling locally before you run servers:

- All tests: `bun run test`
- Server tests: `cd apps/server && bun test`
- Web tests: `cd apps/web && bun test`

What these cover:
- Ensures `CONVEX_SITE_URL` aligns with `NEXT_PUBLIC_CONVEX_URL` in development (issuer mismatch guard).
- Validates `apps/server/convex/auth.config.ts` fails fast without `CONVEX_SITE_URL` and `JWKS`, and loads correctly when present.
- Enforces `NEXT_PUBLIC_CONVEX_URL` in `apps/web/src/lib/env.ts`.
- AuthZ: Server-side tests for chats creation and listing ensure unauthenticated calls fail and per-user isolation holds.

## E2E Tests (Playwright)

- Install browsers once: `bunx playwright install --with-deps`
- Run against local dev (make sure `bun run dev:server` and `bun run dev:web` are running):
  - `cd apps/web && bun run e2e` (uses `E2E_BASE_URL=http://localhost:3001` by default)
- To point at another host: `E2E_BASE_URL=https://ochat.pro bun run e2e`

What they do:
- Sign up with a unique email, assert the UI shows “New Chat”, create a chat, then sign out and assert the unauthenticated CTA shows.

Before production, set Convex env vars to match your issuer and keys:

- `CONVEX_SITE_URL` — must equal the JWT `iss` (e.g. `https://dash.ochat.pro`).
- `JWKS` — public JWKS JSON matching your private signing key.
- To generate a dev keypair: `node scripts/generateKeys.mjs` (prints `JWT_PRIVATE_KEY` and `JWKS`).
