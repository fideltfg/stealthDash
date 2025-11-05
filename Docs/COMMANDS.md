# Dashboard - Command Reference

Quick reference for all available commands.

---

## 🚀 Setup & Start

### Quick Start (Recommended)

```bash
./setup.sh
```

Interactive setup - choose dev or prod mode.

---

## 📦 Using Makefile

### Development

```bash
make dev          # Start dev server (foreground, see logs)
make dev-d        # Start dev server (background/detached)
make build-dev    # Build dev image
make up-dev       # Build + start dev
make logs-dev     # View dev logs
make shell        # Open shell in dev container
make restart      # Restart dev container
```

### Production

```bash
make prod         # Build + start production
make build-prod   # Build prod image only
make up-prod      # Build + start prod
make logs-prod    # View prod logs
make shell-prod   # Open shell in prod container
make restart-prod # Restart prod container
```

### Maintenance

```bash
make down         # Stop all containers
make down-v       # Stop all + remove volumes
make clean        # Clean up Docker resources
make rebuild      # Rebuild dev without cache
make rebuild-prod # Rebuild prod without cache
make ps           # Show running containers
make help         # Show all commands with descriptions
```

---

## 🐳 Using Docker Compose Directly

### Development

```bash
# Start (foreground)
docker compose up

# Start (background)
docker compose up -d

# Start with rebuild
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove volumes
docker compose down -v

# Restart
docker compose restart

# Show running containers
docker compose ps

# Execute command in container
docker compose exec dashboard sh
docker compose exec dashboard npm install
```

### Production

```bash
# Start production
docker compose -f docker-compose.prod.yml up -d

# Build production
docker compose -f docker-compose.prod.yml build

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.prod.yml down

# Rebuild
docker compose -f docker-compose.prod.yml up --build -d
```

---

## 🛠️ Using Docker CLI Directly

### Build Images

```bash
# Build dev image
docker build -t dashboard:dev .

# Build prod image
docker build -f Dockerfile.prod -t dashboard:prod .
```

### Run Containers

```bash
# Run dev container
docker run -d -p 3000:3000 -v $(pwd)/src:/app/src --name dashboard-dev dashboard:dev

# Run prod container
docker run -d -p 8080:80 --name dashboard-prod dashboard:prod
```

### Container Management

```bash
# List running containers
docker ps

# List all containers
docker ps -a

# View logs
docker logs -f dashboard-app

# Stop container
docker stop dashboard-app

# Start container
docker start dashboard-app

# Restart container
docker restart dashboard-app

# Remove container
docker rm dashboard-app

# Execute command
docker exec -it dashboard-app sh
```

### Image Management

```bash
# List images
docker images

# Remove image
docker rmi dashboard:dev

# Remove unused images
docker image prune

# Remove all unused
docker system prune -a
```

---

## 📦 NPM Commands (if not using Docker)

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🌐 Access URLs

| Mode | URL | Port |
|------|-----|------|
| Development | http://localhost:3000 | 3000 |
| Production | http://localhost:8080 | 8080 (→80) |

---

## 🔍 Debugging

### View Container Logs

```bash
# Using make
make logs-dev
make logs-prod

# Using docker compose
docker compose logs -f
docker compose -f docker-compose.prod.yml logs -f

# Using docker
docker logs -f dashboard-app
```

### Shell Into Container

```bash
# Using make
make shell          # Dev
make shell-prod     # Prod

# Using docker compose
docker compose exec dashboard sh

# Using docker
docker exec -it dashboard-app sh
```

### Check Container Status

```bash
# Using make
make ps

# Using docker compose
docker compose ps

# Using docker
docker ps
docker inspect dashboard-app
```

### Network Debugging

```bash
# Check if port is listening
netstat -tlnp | grep 3000
lsof -i :3000

# Test HTTP response
curl http://localhost:3000
curl -I http://localhost:3000  # Headers only
```

---

## 🧹 Cleanup

### Stop Everything

```bash
# Using make
make down

# Using docker compose
docker compose down
docker compose -f docker-compose.prod.yml down
```

### Remove Volumes

```bash
# Using make
make down-v

# Using docker compose
docker compose down -v
```

### Clean Docker System

```bash
# Using make
make clean

# Manual cleanup
docker container prune -f
docker image prune -f
docker volume prune -f
docker network prune -f
docker system prune -af  # Remove everything (careful!)
```

---

## 🔄 Updates & Rebuilds

### After Code Changes

```bash
# Development (auto-reloads)
# Just save files - changes reflect automatically

# Production
make rebuild-prod
# or
docker compose -f docker-compose.prod.yml up --build -d
```

### Update Dependencies

```bash
# Using docker compose
docker compose run --rm dashboard npm install package-name

# Or rebuild entire image
make rebuild
```

### Force Rebuild (No Cache)

```bash
# Using make
make rebuild
make rebuild-prod

# Using docker compose
docker compose build --no-cache
docker compose -f docker-compose.prod.yml build --no-cache

# Using docker
docker build --no-cache -t dashboard:dev .
```

---

## 📊 Monitoring

### Resource Usage

```bash
# CPU, Memory, Network I/O
docker stats

# Specific container
docker stats dashboard-app
```

### Disk Usage

```bash
# Docker disk usage
docker system df

# Detailed breakdown
docker system df -v
```

---

## 🔐 Production Deployment

### Build for Production

```bash
make prod
```

### Push to Registry (Docker Hub)

```bash
# Tag image
docker tag dashboard-dashboard username/dashboard:latest
docker tag dashboard-dashboard username/dashboard:v1.0.0

# Login
docker login

# Push
docker push username/dashboard:latest
docker push username/dashboard:v1.0.0
```

### Deploy to Server

```bash
# On server
docker pull username/dashboard:latest
docker run -d -p 80:80 --name dashboard username/dashboard:latest
```

---

## 🆘 Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "3001:3000"
```

### Container Won't Start

```bash
# Check logs
docker compose logs

# Rebuild from scratch
docker compose down -v
docker compose up --build --force-recreate
```

### Hot Reload Not Working

```bash
# Ensure polling is enabled in vite.config.ts
# Rebuild
docker compose down
docker compose up --build
```

### Out of Disk Space

```bash
# Clean up Docker
docker system prune -a -f
docker volume prune -f
```

---

## 📚 More Help

- `make help` - List all make targets
- `./setup.sh` - Interactive setup
- `README.md` - Full documentation
- `DOCKER.md` - Docker guide
- `QUICKSTART.md` - Quick start guide

---

## 💡 Tips

1. **Use make commands** for simplicity
2. **Dev logs** with `make logs-dev`
3. **Rebuild** after dependency changes
4. **Clean regularly** to save disk space
5. **Check status** with `make ps`
6. **Hot reload** works in dev mode automatically

---

**Remember:** Development has hot reload, production is optimized.
