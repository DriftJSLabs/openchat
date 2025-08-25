# openchat

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **workers** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **SQLite/Turso** - Database engine
- **Authentication** - Email & password authentication with Better Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```
## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database:
Local development for a Cloudflare D1 database will already be running as part of the `wrangler dev` command.

2. Update your `.env` file in the `apps/server` directory with the appropriate connection details if needed.

3. Apply the schema to your database:
```bash
bun db:push
```


Then, run the development server:

```bash
bun dev
```

The API is running at [http://localhost:3000](http://localhost:3000).



## Project Structure

```
openchat/
├── apps/
│   ├── web/         # Frontend web application (Next.js)
│   └── server/      # Backend API (Hono, ORPC)
```

## Available Scripts

### Core Development
- `bun dev`: Start all applications in development mode
- `bun build`: Build all applications
- `bun dev:web`: Start only the web application
- `bun dev:server`: Start only the server
- `bun check-types`: Check TypeScript types across all apps

### Database Management
- `bun db:push`: Push schema changes to database
- `bun db:studio`: Open database studio UI
- `bun db:migrate`: Run database migrations
- `bun db:seed`: Seed database with sample data
- `bun db:reset`: Reset database and reseed

### Development Tools
- `bun start-dev`: **Master startup script** - Start entire dev environment with health checks
- `bun verify-login`: **Verify dev-login system** - Test authentication flow
- `bun diagnose`: **System diagnostics** - Check configuration and identify issues
- `bun dev:quick`: Quick development server startup
- `bun debug:auth`: Debug authentication issues
- `bun debug:env`: Debug environment configuration

### Docker & Services
- `bun docker:up`: Start Docker services (PostgreSQL, etc.)
- `bun docker:down`: Stop Docker services
- `bun docker:logs`: View Docker container logs
- `bun docker:clean`: Clean up Docker containers and volumes

## 🚀 Quick Start Guide

The fastest way to get started with OpenChat development:

```bash
# 1. Install dependencies
bun install

# 2. Start the complete development environment
bun start-dev
```

This single command will:
- ✅ Check and start PostgreSQL (if needed)
- ✅ Run database migrations and seeding
- ✅ Start all development servers (API, Web, Docs)
- ✅ Perform health checks on all services
- ✅ Display service URLs and status
- ✅ Monitor services for issues

## 🔐 Development Authentication System

OpenChat includes a streamlined development authentication system that bypasses traditional login flows for faster development.

### How Dev-Login Works

The dev-login system provides instant authentication for development by:

1. **Automatic User Creation**: Creates a development user on first use
2. **Instant Login**: No passwords or signup forms required
3. **Session Management**: Maintains proper authentication sessions
4. **API Integration**: Works seamlessly with all protected endpoints

### Using Dev-Login

#### Option 1: Direct API Access
```bash
curl -X POST http://localhost:3001/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@example.com"}'
```

#### Option 2: Web Interface
Visit `http://localhost:3001/dev-login` in your browser for a simple login form.

#### Option 3: Automated Testing
```bash
# Test the entire authentication flow
bun verify-login
```

### Authentication Flow

1. **Request**: Send POST to `/dev-login` with email
2. **User Creation**: System creates user if not exists
3. **Session**: Returns session cookie or JWT token
4. **Access**: Use session for subsequent API calls

### Development User

- **Email**: `dev@example.com`
- **Name**: `Development User`
- **Auto-created**: First time you run dev-login
- **Persistent**: Stored in database for consistent development

## 🛠️ Troubleshooting Guide

### Quick Diagnostics

If something isn't working, start with the diagnostic script:

```bash
bun diagnose
```

This will check:
- ✅ Environment configuration
- ✅ Database connectivity
- ✅ Docker services
- ✅ Port availability
- ✅ File permissions
- ✅ Common misconfigurations

### Common Issues & Solutions

#### 🔴 "Database connection failed"

**Symptoms**: Cannot connect to PostgreSQL
**Solutions**:
```bash
# Start PostgreSQL with Docker
bun docker:up

# Check if PostgreSQL is running
docker ps

# Test connection directly
bun test-db-connection.ts
```

#### 🔴 "Port already in use"

**Symptoms**: Error starting development servers
**Solutions**:
```bash
# Find what's using the port
netstat -an | grep :3001

# Kill conflicting processes
pkill -f "node.*3001"

# Use different ports if needed
PORT=3005 bun dev:server
```

#### 🔴 "Dev-login not working"

**Symptoms**: Authentication fails in development
**Solutions**:
```bash
# Verify the dev-login system
bun verify-login

# Reset development database
bun db:reset

# Check server logs
bun docker:logs
```

#### 🔴 "Environment variables missing"

**Symptoms**: Configuration errors
**Solutions**:
```bash
# Copy example environment files
cp .env.example .env
cp apps/server/.env.example apps/server/.env

# Check what variables are missing
bun diagnose
```

#### 🔴 "Services not starting"

**Symptoms**: Development servers fail to start
**Solutions**:
```bash
# Use the master startup script
bun start-dev

# Check system resources
bun diagnose

# Start services individually
bun dev:server
bun dev:web
```

### Advanced Troubleshooting

#### Debug Mode
```bash
# Enable debug logging
DEBUG=* bun start-dev

# Check specific service logs
bun docker:logs postgres
```

#### Clean Reset
```bash
# Complete environment reset
bun docker:down
bun clean
rm -rf node_modules
bun install
bun docker:up
bun start-dev
```

#### Health Monitoring
```bash
# Continuous health monitoring
bun start-dev  # Includes automatic monitoring

# Manual health checks
curl http://localhost:3001/health
curl http://localhost:3000
```

### Performance Optimization

#### Memory Usage
- Close unnecessary applications
- Restart development servers periodically
- Use `bun dev:server` instead of full stack if only testing API

#### Startup Time
- Use `bun dev:quick` for faster startup
- Skip verification with direct `bun dev`
- Use Docker containers for consistent performance

### Getting Help

1. **Run Diagnostics**: `bun diagnose` for comprehensive system check
2. **Check Logs**: `bun docker:logs` for service-specific issues
3. **Verify Auth**: `bun verify-login` for authentication problems
4. **Reset Environment**: Complete clean setup if issues persist

## 🏗️ Development Workflow

### Recommended Daily Workflow

```bash
# Morning startup
bun start-dev          # Start everything with health checks

# During development
bun verify-login       # Test auth when needed
bun diagnose          # Check system health if issues arise

# End of day
Ctrl+C                # Stop dev servers
# Docker services continue running
```

### Code Changes Workflow

```bash
# After pulling changes
bun install           # Update dependencies
bun db:migrate        # Apply any new migrations
bun start-dev         # Restart with health checks

# Before committing
bun check-types       # Verify TypeScript
bun test             # Run tests
bun lint             # Check code style
```

### Database Development

```bash
# Schema changes
bun db:generate       # Generate migrations
bun db:migrate        # Apply migrations
bun db:seed          # Add sample data

# Reset database
bun db:reset         # Complete reset with fresh data
```

## 🔧 Configuration

### Environment Variables

#### Required Variables
- `DATABASE_URL`: PostgreSQL connection string
- `NODE_ENV`: Development environment setting

#### Optional Variables
- `PORT`: Custom server port (default: 3001)
- `WEB_URL`: Web application URL (default: http://localhost:3000)
- `API_URL`: API server URL (default: http://localhost:3001)

### Service Ports

| Service | Port | URL |
|---------|------|-----|
| Web App | 3000 | http://localhost:3000 |
| API Server | 3001 | http://localhost:3001 |
| Documentation | 3002 | http://localhost:3002 |
| PostgreSQL | 5432 | postgresql://localhost:5432 |
| DB Studio | Dynamic | Run `bun db:studio` |

### Docker Configuration

Services defined in `docker-compose.yml`:
- **postgres**: PostgreSQL database
- **redis**: Caching (optional)
- **electric**: Real-time sync (optional)

## 📊 Monitoring & Health Checks

The development environment includes comprehensive monitoring:

### Automatic Health Monitoring
- Service availability checks every 30 seconds
- Automatic failure detection and reporting
- Real-time status updates in console

### Manual Health Checks
```bash
# Overall system health
bun diagnose

# Authentication system
bun verify-login

# Individual service health
curl http://localhost:3001/health
curl http://localhost:3000
```

### Status Indicators
- ✅ **Green**: Service running and healthy
- ⚠️ **Yellow**: Service running with warnings
- ❌ **Red**: Service failed or unreachable
- 🔄 **Blue**: Service starting up
