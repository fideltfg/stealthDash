# Docker Deployment Guide

This guide covers deploying the Dashboard application using Docker.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
- [Docker Architecture](#docker-architecture)
- [Volume Mounts](#volume-mounts)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## Quick Start

### Prerequisites

- Docker 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose 1.29+ (usually included with Docker Desktop)

### One-Command Setup

```bash
./setup.sh
```

Follow the prompts to choose development or production mode.

## Development Setup

Development mode includes:
- Hot module reloading (HMR)
- Source maps for debugging
- Volume mounts for live code updates
- Port 3000 exposed

### Start Development Server

```bash
docker-compose up
```

Or in detached mode:

```bash
docker-compose up -d
```

### Access the Application

Open [http://localhost:3000](http://localhost:3000)

### View Logs

```bash
docker-compose logs -f
```

### Stop Development Server

```bash
docker-compose down
```

## Production Setup

Production mode includes:
- Optimized build with minification
- Nginx web server
- Static file caching
- Gzip compression
- Security headers
- Port 80 (mapped to 8080 on host)

### Build and Start Production Server

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

### Access the Application

Open [http://localhost:8080](http://localhost:8080)

### View Logs

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### Stop Production Server

```bash
docker-compose -f docker-compose.prod.yml down
```

## Docker Architecture

### Development Container

```
┌─────────────────────────────────┐
│   Node.js 20 Alpine             │
│                                 │
│   /app                          │
│   ├── src/          (mounted)   │
│   ├── index.html    (mounted)   │
│   ├── vite.config   (mounted)   │
│   └── node_modules  (volume)    │
│                                 │
│   Vite Dev Server               │
│   Port: 3000                    │
└─────────────────────────────────┘
```

### Production Container (Multi-stage)

**Stage 1: Builder**
```
┌─────────────────────────────────┐
│   Node.js 20 Alpine             │
│                                 │
│   npm run build                 │
│   → dist/                       │
└─────────────────────────────────┘
```

**Stage 2: Web Server**
```
┌─────────────────────────────────┐
│   Nginx Alpine                  │
│                                 │
│   /usr/share/nginx/html         │
│   └── (dist/ contents)          │
│                                 │
│   Nginx Server                  │
│   Port: 80                      │
└─────────────────────────────────┘
```

## Volume Mounts

### Development Volumes

The following directories are mounted for hot reload:

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./src` | `/app/src` | Source code |
| `./index.html` | `/app/index.html` | HTML entry point |
| `./vite.config.ts` | `/app/vite.config.ts` | Vite configuration |

**Note:** `node_modules` is kept in a Docker volume to prevent host overwrites.

### Production Volumes

No volumes are mounted in production. The built files are baked into the image.

## Environment Variables

### Development

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Node environment |

### Production

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |

### Custom Environment Variables

Add to `docker-compose.yml`:

```yaml
services:
  dashboard:
    environment:
      - CUSTOM_VAR=value
```

Or use an `.env` file:

```bash
# .env
CUSTOM_VAR=value
```

Then reference in docker-compose.yml:

```yaml
env_file:
  - .env
```

## Troubleshooting

### Port Already in Use

**Error:** `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution:** Change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Hot Reload Not Working

**Issue:** Changes to code don't trigger reload.

**Solutions:**

1. Ensure volumes are mounted correctly:
   ```bash
   docker-compose down
   docker-compose up --build
   ```

2. Check Vite config has `usePolling: true`:
   ```typescript
   // vite.config.ts
   server: {
     watch: {
       usePolling: true
     }
   }
   ```

3. On Windows with WSL2, ensure files are in WSL filesystem, not `/mnt/c/`.

### Container Keeps Restarting

**Check logs:**
```bash
docker-compose logs
```

**Common causes:**
- Port conflict
- Missing dependencies (rebuild with `--no-cache`)
- Configuration error

**Solution:**
```bash
docker-compose down
docker-compose up --build --force-recreate
```

### Out of Disk Space

**Clean up Docker resources:**

```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove unused volumes
docker volume prune

# Remove everything (careful!)
docker system prune -a
```

### Permission Issues

**On Linux, if you get permission errors:**

```bash
# Fix ownership
sudo chown -R $USER:$USER .

# Or run with current user
docker-compose run --user $(id -u):$(id -g) dashboard npm install
```

## Advanced Usage

### Custom Build Arguments

Pass build arguments:

```bash
docker-compose build --build-arg NODE_VERSION=18
```

Modify `Dockerfile`:

```dockerfile
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine
```

### Multi-Container Setup

Add additional services to `docker-compose.yml`:

```yaml
services:
  dashboard:
    # ... existing config
  
  api:
    image: my-api:latest
    ports:
      - "3001:3001"
  
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: dashboard
```

### Health Checks

Add health check to `docker-compose.yml`:

```yaml
services:
  dashboard:
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Resource Limits

Limit container resources:

```yaml
services:
  dashboard:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

### Production Optimizations

#### Enable BuildKit

```bash
export DOCKER_BUILDKIT=1
docker-compose -f docker-compose.prod.yml build
```

#### Multi-Platform Builds

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t dashboard:latest .
```

#### Layer Caching

The Dockerfile is optimized for layer caching:

1. Dependencies installed first (changes less often)
2. Source code copied last (changes frequently)

This speeds up rebuilds significantly.

## Docker Compose Commands Reference

```bash
# Start services
docker-compose up
docker-compose up -d                 # Detached mode
docker-compose up --build            # Rebuild before starting

# Stop services
docker-compose stop                  # Stop without removing
docker-compose down                  # Stop and remove containers
docker-compose down -v               # Also remove volumes

# View status
docker-compose ps                    # List containers
docker-compose logs                  # View logs
docker-compose logs -f               # Follow logs
docker-compose logs -f dashboard     # Follow logs for specific service

# Execute commands
docker-compose exec dashboard sh     # Shell into container
docker-compose exec dashboard npm install  # Run npm command

# Rebuild
docker-compose build                 # Build images
docker-compose build --no-cache      # Build without cache

# Scale services
docker-compose up -d --scale dashboard=3  # Run 3 instances
```

## Deployment to Cloud

### Docker Hub

```bash
# Build and tag
docker build -f Dockerfile.prod -t yourusername/dashboard:latest .

# Push
docker push yourusername/dashboard:latest

# Pull and run on server
docker pull yourusername/dashboard:latest
docker run -d -p 80:80 yourusername/dashboard:latest
```

### Docker Swarm

```bash
docker stack deploy -c docker-compose.prod.yml dashboard
```

### Kubernetes

Convert docker-compose to Kubernetes:

```bash
# Install kompose
curl -L https://github.com/kubernetes/kompose/releases/download/v1.31.2/kompose-linux-amd64 -o kompose
chmod +x kompose
sudo mv kompose /usr/local/bin/

# Convert
kompose convert -f docker-compose.prod.yml
```

## Best Practices

1. **Use .dockerignore**: Exclude unnecessary files from build context
2. **Multi-stage builds**: Keep production images small
3. **Non-root user**: Run containers as non-root (already done in Nginx)
4. **Health checks**: Monitor container health
5. **Resource limits**: Prevent resource exhaustion
6. **Secrets management**: Use Docker secrets for sensitive data
7. **Regular updates**: Keep base images updated for security patches

## Security Considerations

### Nginx Security Headers (Production)

Already configured:
- `X-Frame-Options: SAMEORIGIN` - Prevent clickjacking
- `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection

### Additional Recommendations

1. **Use HTTPS** in production (add reverse proxy like Traefik or Caddy)
2. **Scan images** for vulnerabilities:
   ```bash
   docker scan dashboard:latest
   ```
3. **Update dependencies** regularly:
   ```bash
   npm audit fix
   ```

## Support

For issues related to Docker deployment, check:
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- Project README.md for application-specific help
