# Railway PR Environment Setup

This guide helps you set up automatic deployment of preview environments for each pull request using Railway.

## Overview

The setup includes:
- **Web App** (Next.js) deployed to Railway for each PR
- **Server** (Hono API) deployed to Railway for each PR  
- Automatic cleanup when PR is closed
- Comments on PRs with deployment URLs

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install with `npm install -g @railway/cli`
3. **Railway Token**: Generate a token in Railway dashboard

## Setup Steps

### 1. Railway Project Setup

1. Login to Railway CLI:
   ```bash
   railway login
   ```

2. Create a new Railway project:
   ```bash
   railway new openchat
   ```

3. Link your local repository:
   ```bash
   railway link
   ```

### 2. GitHub Secrets Configuration

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

- `RAILWAY_TOKEN`: Your Railway API token from the Railway dashboard

### 3. GitHub Actions Workflow

**IMPORTANT**: Due to permissions, the workflow file needs to be manually moved:

1. Move `.github-workflows-railway-pr.yml` to `.github/workflows/railway-pr.yml`:
   ```bash
   mkdir -p .github/workflows
   mv .github-workflows-railway-pr.yml .github/workflows/railway-pr.yml
   ```

2. Commit and push the workflow file:
   ```bash
   git add .github/workflows/railway-pr.yml
   git commit -m "Add Railway PR environment workflow"
   git push
   ```

### 4. Railway Configuration

The following Railway configuration files have been created:

- `/railway.json` - Root project configuration
- `/apps/web/railway.json` - Web app specific config
- `/apps/server/railway.json` - Server specific config

### 5. Environment Variables

Configure these variables in Railway dashboard for each service:

#### Web App Service
- `NODE_ENV=preview`
- `NEXT_PUBLIC_API_URL` - URL of your server service
- Any other environment variables your web app needs

#### Server Service  
- `NODE_ENV=preview`
- Database connection strings
- API keys and secrets
- Any other environment variables your server needs

## How It Works

1. **PR Opened/Updated**: 
   - GitHub Action triggers
   - Builds both web and server applications
   - Deploys to Railway with PR-specific service names
   - Comments on PR with deployment URLs

2. **PR Closed**:
   - GitHub Action triggers cleanup job
   - Removes Railway services for that PR
   - Prevents resource waste

## Service Naming Convention

- Web app: `openchat-web-pr-{PR_NUMBER}`
- Server: `openchat-server-pr-{PR_NUMBER}`

## Deployment URLs

Preview deployments will be available at:
- Web: `https://openchat-web-pr-{PR_NUMBER}.up.railway.app`
- Server: `https://openchat-server-pr-{PR_NUMBER}.up.railway.app`

## Troubleshooting

### Common Issues

1. **Build failures**: Check Railway build logs in the dashboard
2. **Service not starting**: Verify start commands in railway.json files
3. **Environment variables**: Ensure all required vars are set in Railway dashboard
4. **Database connections**: Configure database URLs properly for preview environment

### Logs and Monitoring

- Railway Dashboard: View deployment logs and metrics
- GitHub Actions: Check workflow run logs for deployment status
- Service health checks: Configured via `healthcheckPath` in railway.json

## Cost Considerations

- Railway charges based on resource usage
- Preview deployments will consume additional resources
- Consider setting up automatic cleanup policies
- Monitor usage in Railway dashboard

## Next Steps

1. Test the setup by creating a test PR
2. Verify deployments work correctly
3. Configure database and external service connections for preview environments
4. Set up monitoring and alerts as needed