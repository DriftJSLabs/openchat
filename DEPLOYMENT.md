# OpenChat Deployment Guide

This guide covers deploying OpenChat to various production environments with security, scalability, and reliability best practices.

## 📋 Table of Contents

- [Deployment Overview](#deployment-overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Cloud Platform Deployments](#cloud-platform-deployments)
- [Database Setup](#database-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security Hardening](#security-hardening)
- [Performance Optimization](#performance-optimization)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## 🚀 Deployment Overview

OpenChat supports multiple deployment strategies:

- **Docker Compose** (Single server deployment)
- **Kubernetes** (Container orchestration)
- **Cloud Platforms** (Vercel, Railway, Render, etc.)
- **Traditional VPS** (Ubuntu/CentOS servers)

### Architecture Components

- **Web Application** (Next.js)
- **API Server** (Bun + tRPC)
- **Database** (PostgreSQL)
- **Real-time Sync** (ElectricSQL)
- **Cache** (Redis - optional)
- **Reverse Proxy** (Nginx)
- **Monitoring** (Prometheus + Grafana)

## 📋 Prerequisites

### System Requirements

**Minimum Requirements:**
- 2 CPU cores
- 4GB RAM
- 20GB storage
- Ubuntu 20.04+ or equivalent

**Recommended for Production:**
- 4+ CPU cores
- 8GB+ RAM
- 100GB+ SSD storage
- Load balancer
- CDN

### Required Software

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Bun (optional, for local builds)
curl -fsSL https://bun.sh/install | bash
```

## ⚙️ Environment Configuration

### Production Environment Variables

Create a `.env.production` file with production values:

```bash
# Application
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=OpenChat
NEXT_PUBLIC_APP_VERSION=1.0.0

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
WEB_PORT=3001

# Database (Use managed database service)
DATABASE_URL=postgresql://username:password@prod-db-host:5432/openchat_prod
DATABASE_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT=10000

# Authentication (Generate secure secrets)
BETTER_AUTH_SECRET=your-secure-64-character-secret-key
BETTER_AUTH_URL=https://api.yourdomain.com
BETTER_AUTH_TRUSTED_ORIGINS=https://yourdomain.com

# AI Services
OPENROUTER_API_KEY=your_production_openrouter_key
GOOGLE_GENERATIVE_AI_API_KEY=your_production_google_key

# ElectricSQL
ELECTRIC_URL=https://electric.yourdomain.com

# Security
CORS_ORIGIN=https://yourdomain.com
CORS_METHODS=GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
CORS_CREDENTIALS=true

# Logging
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_DIRECTORY=/app/logs

# Monitoring
PROMETHEUS_ENDPOINT=https://prometheus.yourdomain.com
GRAFANA_ENDPOINT=https://grafana.yourdomain.com

# CDN and Assets
NEXT_PUBLIC_CDN_URL=https://cdn.yourdomain.com
STATIC_FILE_MAX_AGE=31536000

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# Redis (if using)
REDIS_URL=redis://prod-redis-host:6379
REDIS_PASSWORD=your_redis_password
```

### Secret Management

**For Docker Compose:**
Create secret files in `./secrets/` directory:

```bash
mkdir -p secrets
echo "your_secure_password" > secrets/postgres_password.txt
echo "your_auth_secret" > secrets/better_auth_secret.txt
echo "your_api_key" > secrets/openrouter_api_key.txt
```

**For Kubernetes:**
```bash
kubectl create secret generic openchat-secrets \
  --from-literal=postgres-password="your_secure_password" \
  --from-literal=auth-secret="your_auth_secret" \
  --from-literal=openrouter-key="your_api_key"
```

## 🐳 Docker Deployment

### Quick Production Deployment

```bash
# Clone repository
git clone <your-repo-url>
cd openchat

# Set up secrets
mkdir -p secrets
# Add your secrets to secret files

# Deploy with production configuration
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

### Custom Docker Deployment

1. **Build production images:**

```bash
# Build server image
docker build -f apps/server/Dockerfile.prod -t openchat-server:latest apps/server/

# Build web image  
docker build -f apps/web/Dockerfile.prod -t openchat-web:latest apps/web/
```

2. **Create production docker-compose.override.yml:**

```yaml
version: '3.8'

services:
  openchat-server:
    image: openchat-server:latest
    environment:
      - DATABASE_URL_FILE=/run/secrets/database_url
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
        
  openchat-web:
    image: openchat-web:latest
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 1G

  nginx:
    volumes:
      - ./nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### Nginx Configuration

Create `nginx.prod.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream openchat_server {
        server openchat-server-prod:3000;
    }
    
    upstream openchat_web {
        server openchat-web-prod:3001;
    }
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=web:10m rate=30r/s;
    
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }
    
    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;
        
        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
        
        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        
        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://openchat_server;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Static files and web app
        location / {
            limit_req zone=web burst=50 nodelay;
            proxy_pass http://openchat_web;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## ☁️ Cloud Platform Deployments

### Vercel Deployment

1. **Configure `vercel.json`:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "NEXT_PUBLIC_SERVER_URL": "https://api.yourdomain.com",
    "NEXT_PUBLIC_ELECTRIC_URL": "https://electric.yourdomain.com"
  },
  "functions": {
    "apps/web/pages/api/**/*.ts": {
      "runtime": "nodejs18.x"
    }
  }
}
```

2. **Deploy:**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Railway Deployment

1. **Create `railway.json`:**

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "bun install && bun run build"
  },
  "deploy": {
    "startCommand": "bun start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300
  }
}
```

2. **Deploy:**

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway deploy
```

### Render Deployment

Create `render.yaml`:

```yaml
services:
  - type: web
    name: openchat-web
    runtime: node
    plan: starter
    buildCommand: bun install && bun run build
    startCommand: bun start
    envVars:
      - key: NODE_ENV
        value: production
        
  - type: web
    name: openchat-server
    runtime: node
    plan: starter
    buildCommand: cd apps/server && bun install && bun run build
    startCommand: cd apps/server && bun start
    
databases:
  - name: openchat-postgres
    plan: starter
    databaseName: openchat
    user: openchat
```

## 🗄️ Database Setup

### Managed Database Services

**PostgreSQL (Recommended providers):**
- **Neon** - Serverless PostgreSQL
- **Supabase** - Full-stack PostgreSQL platform
- **PlanetScale** - Serverless MySQL (requires schema changes)
- **AWS RDS** - Managed PostgreSQL
- **Google Cloud SQL** - Managed PostgreSQL

### Database Configuration

```bash
# Production database setup
DATABASE_URL="postgresql://username:password@host:5432/database?sslmode=require"
DATABASE_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT=10000
DATABASE_CONNECTION_TIMEOUT=5000
```

### Migrations

```bash
# Run migrations in production
NODE_ENV=production bun db:push

# Seed production data (if needed)
NODE_ENV=production bun db:seed:prod
```

## 🔄 CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Run tests
        run: bun test
        
      - name: Type check
        run: bun check-types
        
      - name: Lint
        run: bun lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Build applications
        run: bun build:prod
        
      - name: Build Docker images
        run: |
          docker build -f apps/server/Dockerfile.prod -t openchat-server:${{ github.sha }} apps/server/
          docker build -f apps/web/Dockerfile.prod -t openchat-web:${{ github.sha }} apps/web/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: |
          # Your deployment commands here
          echo "Deploying to production..."
```

### Deployment Scripts

Create `scripts/deploy-production.ts`:

```typescript
#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";

console.log(chalk.blue.bold('🚀 Deploying OpenChat to Production\n'));

async function deployToProduction() {
  try {
    // Pre-deployment checks
    console.log(chalk.yellow('🔍 Running pre-deployment checks...'));
    await $`bun test`;
    await $`bun lint`;
    await $`bun check-types`;
    
    // Build applications
    console.log(chalk.yellow('🏗️  Building applications...'));
    await $`bun build:prod`;
    
    // Build Docker images
    console.log(chalk.yellow('🐳 Building Docker images...'));
    await $`docker compose -f docker-compose.prod.yml build`;
    
    // Deploy to production
    console.log(chalk.yellow('🚀 Deploying to production...'));
    await $`docker compose -f docker-compose.prod.yml up -d`;
    
    // Health checks
    console.log(chalk.yellow('🏥 Running health checks...'));
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    
    const healthCheck = await fetch('https://yourdomain.com/api/health');
    if (!healthCheck.ok) {
      throw new Error('Health check failed');
    }
    
    console.log(chalk.green.bold('\n✅ Deployment successful!'));
    console.log(chalk.blue('🌐 Application: https://yourdomain.com'));
    console.log(chalk.blue('📊 Monitoring: https://monitoring.yourdomain.com'));
    
  } catch (error) {
    console.error(chalk.red.bold('\n❌ Deployment failed!'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

deployToProduction();
```

## 📊 Monitoring and Logging

### Prometheus Monitoring

Deploy with monitoring stack:

```bash
# Deploy with monitoring
docker compose -f docker-compose.prod.yml --profile monitoring up -d

# Access monitoring
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3010
```

### Application Metrics

Add metrics collection to your applications:

```typescript
// apps/server/src/lib/metrics.ts
import prometheus from 'prom-client';

export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
});

export const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});
```

### Log Aggregation

Configure structured logging:

```typescript
// Production logging configuration
const logger = new Logger({
  level: 'warn',
  format: 'json',
  outputs: ['console', 'file', 'remote'],
  remoteConfig: {
    endpoint: 'https://logs.yourdomain.com/api/logs',
    apiKey: process.env.LOG_API_KEY,
    batchSize: 100,
  },
});
```

## 🔒 Security Hardening

### Security Checklist

- [ ] Use HTTPS everywhere
- [ ] Configure security headers
- [ ] Enable CORS protection
- [ ] Set up rate limiting
- [ ] Use environment secrets
- [ ] Enable audit logging
- [ ] Configure firewall rules
- [ ] Use least privilege access
- [ ] Enable database encryption
- [ ] Set up intrusion detection

### Firewall Configuration

```bash
# UFW configuration
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### SSL/TLS Setup

```bash
# Let's Encrypt with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## ⚡ Performance Optimization

### Database Optimization

```sql
-- Create indexes for better performance
CREATE INDEX CONCURRENTLY idx_messages_chat_id ON messages(chat_id);
CREATE INDEX CONCURRENTLY idx_messages_created_at ON messages(created_at);
CREATE INDEX CONCURRENTLY idx_chats_user_id ON chats(user_id);

-- Analyze tables
ANALYZE messages;
ANALYZE chats;
ANALYZE users;
```

### Application Optimization

```bash
# Build with optimizations
NODE_ENV=production bun build --minify --sourcemap

# Enable compression
ENABLE_COMPRESSION=true

# Configure caching
CACHE_TTL=300000
REDIS_URL=redis://redis-host:6379
```

## 💾 Backup and Recovery

### Database Backups

Create automated backup script:

```bash
#!/bin/bash
# scripts/backup-database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Create backup
pg_dump $DATABASE_URL > $BACKUP_DIR/openchat_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/openchat_$DATE.sql

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/openchat_$DATE.sql.gz s3://your-backup-bucket/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "openchat_*.sql.gz" -mtime +30 -delete
```

### Application Backups

```bash
# Backup configuration and uploads
tar -czf /backups/openchat_config_$(date +%Y%m%d).tar.gz \
  /app/config \
  /app/uploads \
  /app/logs
```

## 🔧 Troubleshooting

### Common Production Issues

#### Application Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs openchat-server
docker compose -f docker-compose.prod.yml logs openchat-web

# Check resource usage
docker stats

# Check disk space
df -h
```

#### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Check connection pool
# Monitor active connections in database
```

#### Performance Issues

```bash
# Check application metrics
curl https://yourdomain.com/metrics

# Monitor resource usage
htop
iostat -x 1

# Check logs for errors
tail -f /var/log/openchat/error.log
```

### Emergency Procedures

#### Rollback Deployment

```bash
# Quick rollback using Docker tags
docker compose -f docker-compose.prod.yml down
docker tag openchat-server:previous openchat-server:latest
docker tag openchat-web:previous openchat-web:latest
docker compose -f docker-compose.prod.yml up -d
```

#### Database Recovery

```bash
# Restore from backup
gunzip -c /backups/openchat_20231201_120000.sql.gz | psql $DATABASE_URL
```

## 📞 Support and Maintenance

### Health Monitoring

Set up automated health checks:

```bash
# Cron job for health monitoring
*/5 * * * * curl -f https://yourdomain.com/api/health || echo "Health check failed" | mail admin@yourdomain.com
```

### Update Procedures

1. **Test in staging environment**
2. **Create database backup**
3. **Deploy to production during low-traffic hours**
4. **Monitor logs and metrics**
5. **Verify functionality**
6. **Update monitoring dashboards**

### Documentation

Keep production documentation updated:
- Server configurations
- Environment variables
- Backup procedures
- Monitoring setup
- Emergency contacts

---

## 📚 Additional Resources

- [Security Best Practices](./docs/security.md)
- [Performance Monitoring](./docs/monitoring.md)
- [Backup Strategies](./docs/backup.md)
- [Incident Response](./docs/incident-response.md)

---

**Need help?** Contact the development team or create an issue in the repository.

Happy deploying! 🚀