# OpenChat Development Guide

This comprehensive guide covers the development workflow, setup, and best practices for contributing to OpenChat.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Development Environment Setup](#development-environment-setup)
- [Architecture Overview](#architecture-overview)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Database Management](#database-management)
- [API Development](#api-development)
- [Frontend Development](#frontend-development)
- [Security Guidelines](#security-guidelines)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

Get OpenChat running locally in under 5 minutes:

```bash
# Clone and install dependencies
git clone <repository-url>
cd openchat
bun install

# Set up development environment (with Docker services)
bun setup

# Start development servers
bun dev
```

Your application will be available at:
- **Web App**: http://localhost:3001
- **API Server**: http://localhost:3000
- **Database Studio**: http://localhost:5555 (run `bun db:studio`)

## 🛠 Development Environment Setup

### Prerequisites

- **Bun** >= 1.2.0 (recommended) or Node.js >= 18
- **Docker** and Docker Compose (for services)
- **PostgreSQL** >= 16 (if running locally)
- **Git** for version control

### Automated Setup

The project includes automated setup scripts:

```bash
# Full setup with services
bun setup

# Fast setup (minimal configuration)
bun setup:fast

# Setup with additional services
bun setup --redis --pgadmin

# Reset environment
bun setup --reset-data
```

### Manual Setup

If you prefer manual setup:

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Start Docker services**:
   ```bash
   docker compose up -d
   ```

3. **Configure environment**:
   ```bash
   # Copy environment templates
   cp .env.example .env.development
   cp apps/server/.env.example apps/server/.env
   cp apps/web/.env.example apps/web/.env.local
   
   # Edit with your configuration
   ```

4. **Run database migrations**:
   ```bash
   bun db:push
   bun db:seed:dev
   ```

### Environment Configuration

#### Core Environment Variables

```bash
# Database
DATABASE_URL=postgresql://openchat:openchat_dev@localhost:5432/openchat_dev

# Server
PORT=3000
HOST=localhost
NODE_ENV=development

# Authentication
BETTER_AUTH_SECRET=your-32-character-secret
BETTER_AUTH_URL=http://localhost:3000

# AI Services
OPENROUTER_API_KEY=your_openrouter_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key

# Real-time Sync
ELECTRIC_URL=http://localhost:5133
```

#### Environment Files

- `.env.development` - Development environment
- `.env.test` - Testing environment
- `.env.production` - Production environment
- `apps/server/.env` - Server-specific configuration
- `apps/web/.env.local` - Web app client configuration

## 🏗 Architecture Overview

OpenChat follows a modern TypeScript monorepo architecture:

```
openchat/
├── apps/
│   ├── server/          # Backend API (Bun + tRPC + Drizzle)
│   ├── web/             # Frontend app (Next.js + React)
│   └── fumadocs/        # Documentation site
├── packages/            # Shared packages (future)
├── scripts/             # Development and deployment scripts
├── docker-compose.yml   # Development services
└── turbo.json          # Monorepo build configuration
```

### Technology Stack

#### Backend
- **Runtime**: Bun.js
- **Framework**: tRPC + oRPC
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: Better Auth
- **Real-time**: ElectricSQL
- **Caching**: Redis (optional)

#### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + Tailwind CSS + shadcn/ui
- **State**: TanStack Query + Local-first with wa-sqlite
- **Real-time**: ElectricSQL client

## 🔄 Development Workflow

### Branch Strategy

We use a simplified Git workflow:

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - Feature development branches
- `hotfix/*` - Critical fixes

### Development Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes with tests**:
   ```bash
   # Run tests during development
   bun test:watch
   
   # Check types
   bun check-types
   
   # Lint code
   bun lint
   ```

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

4. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Quality Standards

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint + Prettier
- **Testing**: 80%+ coverage requirement
- **Security**: Automated security scanning
- **Performance**: Core Web Vitals monitoring

## 🧪 Testing

### Test Types

```bash
# Unit tests
bun test:unit

# Integration tests
bun test:integration

# Component tests
bun test:component

# End-to-end tests
bun test:e2e

# All tests with coverage
bun test:coverage
```

### Test Configuration

#### Unit Tests (Vitest)
- **Location**: `src/**/*.{test,spec}.{ts,tsx}`
- **Environment**: happy-dom
- **Coverage**: 80% threshold

#### Integration Tests
- **Location**: `src/**/*.integration.{test,spec}.{ts,tsx}`
- **Environment**: Real database + mocked services
- **Timeout**: 30 seconds

#### E2E Tests (Playwright)
- **Location**: `e2e/**/*.{test,spec}.{ts,js}`
- **Browsers**: Chrome, Firefox, Safari, Mobile
- **Environment**: Full application stack

### Writing Tests

```typescript
// Unit test example
import { describe, it, expect } from 'vitest';
import { calculateSomething } from './utils';

describe('utils', () => {
  it('should calculate correctly', () => {
    expect(calculateSomething(2, 3)).toBe(5);
  });
});

// Component test example
import { render, screen } from '@testing-library/react';
import { ChatMessage } from './ChatMessage';

it('renders message content', () => {
  render(
    <ChatMessage 
      message={{ content: 'Hello', role: 'user' }} 
    />
  );
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

## 🗄 Database Management

### Database Operations

```bash
# Generate migrations
bun db:generate

# Apply migrations
bun db:push

# Open database studio
bun db:studio

# Seed development data
bun db:seed:dev

# Reset database
bun db:reset
```

### Schema Changes

1. **Modify schema files** in `apps/server/src/db/schema/`
2. **Generate migration**: `bun db:generate`
3. **Review migration** in `apps/server/src/db/migrations/`
4. **Apply migration**: `bun db:push`
5. **Test changes** with seed data

### Seed Data

```bash
# Development data (5 users, 4 chats, 20 messages)
bun db:seed:dev

# Demo data (10 users, 8 chats, 50 messages)
bun db:seed:demo

# Test data (2 users, 1 chat, 3 messages)
bun db:seed:test
```

## 🌐 API Development

### tRPC Procedures

Create new API endpoints in `apps/server/src/routers/`:

```typescript
import { z } from 'zod';
import { publicProcedure, protectedProcedure } from '../lib/orpc';

export const chatRouter = {
  // Public endpoint
  list: publicProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input, context }) => {
      return await context.db.query.chats.findMany({
        limit: input.limit,
      });
    }),

  // Protected endpoint
  create: protectedProcedure
    .input(z.object({ title: z.string() }))
    .mutation(async ({ input, context }) => {
      return await context.db.insert(chats).values({
        title: input.title,
        userId: context.user.id,
      });
    }),
};
```

### Middleware

Apply middleware for security, logging, and validation:

```typescript
import { securityStack } from '../middleware/security';
import { rateLimit } from '../middleware/rate-limit';

export const protectedChatRouter = {
  create: publicProcedure
    .use(securityStack.inputValidator)
    .use(securityStack.enhancedAuth)
    .use(rateLimit({ maxRequests: 10, windowMs: 60000 }))
    .input(createChatSchema)
    .mutation(createChatHandler),
};
```

## 💻 Frontend Development

### Component Development

Follow these patterns for consistent, maintainable components:

```typescript
// components/ChatMessage.tsx
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant';
  };
  className?: string;
}

export const ChatMessage = memo<ChatMessageProps>(({ 
  message, 
  className 
}) => {
  return (
    <div 
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        message.role === 'user' ? 'bg-blue-50' : 'bg-gray-50',
        className
      )}
    >
      <div className="flex-1">
        <p className="text-sm text-gray-900">
          {message.content}
        </p>
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';
```

### State Management

Use TanStack Query for server state and local state for UI:

```typescript
// hooks/useChats.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: () => api.chats.list.query(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.chats.create.mutate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}
```

### Styling Guidelines

- Use **Tailwind CSS** for styling
- Follow **shadcn/ui** patterns for components
- Use **CSS variables** for theme colors
- Implement **responsive design** mobile-first

## 🔒 Security Guidelines

### Input Validation

All user inputs must be validated:

```typescript
import { z } from 'zod';

const createChatSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(100, 'Title too long')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid characters'),
});
```

### Authentication

Use Better Auth for secure authentication:

```typescript
// Protect API routes
export const protectedProcedure = publicProcedure
  .use(async ({ context, next }) => {
    if (!context.user) {
      throw new Error('Unauthorized');
    }
    return next({ context: { ...context, user: context.user } });
  });
```

### CORS Configuration

Configure CORS appropriately for your environment:

```typescript
// Environment-specific CORS
const corsConfig = {
  development: ['http://localhost:3001'],
  production: ['https://yourdomain.com'],
};
```

## ⚡ Performance Optimization

### Database Optimization

- Use **indexes** on frequently queried columns
- Implement **pagination** for large datasets  
- Use **database pooling** for connections
- Monitor **slow queries** with logging

### Frontend Optimization

```typescript
// Lazy load components
const ChatInterface = lazy(() => import('./ChatInterface'));

// Optimize images
import Image from 'next/image';

// Use React.memo for expensive components
const ExpensiveComponent = memo(({ data }) => {
  return <div>{/* Complex rendering */}</div>;
});
```

### Caching Strategy

- **Browser**: Leverage Next.js automatic caching
- **API**: Implement Redis caching for expensive operations
- **Database**: Use query result caching
- **CDN**: Use CDN for static assets

## 🔧 Troubleshooting

### Common Issues

#### Docker Services Won't Start

```bash
# Check Docker daemon
docker info

# Restart services
docker compose down
docker compose up -d

# Check logs
docker compose logs -f
```

#### Database Connection Issues

```bash
# Check PostgreSQL status
docker exec openchat-postgres pg_isready

# Reset database
bun db:reset

# Check environment variables
echo $DATABASE_URL
```

#### ElectricSQL Sync Issues

```bash
# Check ElectricSQL status
curl http://localhost:5133/api/status

# Restart Electric service
docker restart openchat-electric

# Check logs
docker logs openchat-electric
```

#### Build/Type Errors

```bash
# Clear caches
bun clean

# Reinstall dependencies
rm -rf node_modules bun.lockb
bun install

# Check types
bun check-types
```

### Debug Mode

Enable debug logging:

```bash
# Environment variables
DEBUG=true
LOG_LEVEL=debug

# Run with verbose output
bun dev --verbose
```

### Performance Debugging

```bash
# Profile bundle size
bun run build -- --analyze

# Check memory usage
node --inspect apps/server/src/index.ts

# Database query logging
LOG_LEVEL=debug bun dev
```

## 📚 Additional Resources

- [API Documentation](http://localhost:3000/docs) (when running)
- [Component Storybook](http://localhost:6006) (if configured)
- [Database Schema](./apps/server/src/db/schema/)
- [Environment Variables](./docs/environment-variables.md)
- [Deployment Guide](./DEPLOYMENT.md)

## 🤝 Contributing

1. Read the [Contributing Guidelines](./CONTRIBUTING.md)
2. Follow the development workflow above
3. Ensure all tests pass
4. Update documentation as needed
5. Submit a pull request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/openchat/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/openchat/discussions)
- **Documentation**: [Internal Docs](./docs/)

---

Happy coding! 🚀