# Production Deployment Guide

Complete guide for deploying the Dashboard to production environments.

## Table of Contents

- [Quick Production Start](#quick-production-start)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Database Backup](#database-backup)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Cloud Deployment](#cloud-deployment)
- [Security Hardening](#security-hardening)

---

## Quick Production Start

### Minimal Production Setup

```bash
# Clone repository
git clone https://github.com/yourusername/stealthDash.git
cd stealthDash/Dashboard

# Configure environment
cp .env.example .env
nano .env  # Edit with production values

# Start production containers
docker-compose -f docker-compose.prod.yml up -d

# Make first user admin
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE id = 1;"

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

Access: `http://your-server-ip:8080`

---

## Environment Configuration

### Required Variables

Edit `.env` file with production values:

```bash
# Database (use strong passwords)
POSTGRES_USER=dashboard
POSTGRES_PASSWORD=ChangeMeToSecurePassword123!
POSTGRES_DB=dashboard

# Security (generate with: openssl rand -base64 32)
JWT_SECRET=your-very-long-random-secret-key-change-this-in-production

# Email for Password Recovery
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Dashboard <noreply@yourdomain.com>

# Dashboard URL (your public URL)
DASHBOARD_URL=https://dashboard.yourdomain.com

# Vite server (for development mode only)
VITE_ALLOWED_HOSTS=localhost,.yourdomain.com
```

### Generate Secure JWT Secret

```bash
# Generate 32-byte random key
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Email Provider Configuration

**Gmail:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

**Office 365:**
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
```

**Custom SMTP:**
```bash
SMTP_HOST=smtp.yourserver.com
SMTP_PORT=587
SMTP_SECURE=true  # Use true for port 465 (SSL)
```

---

## Docker Deployment

### Production Docker Compose

The `docker-compose.prod.yml` file is optimized for production:

```yaml
# Key differences from development:
# - Optimized build with multi-stage Dockerfile
# - No volume mounts (code baked into image)
# - Production Nginx config
# - Health checks enabled
# - Restart policies set
# - Resource limits configured
```

### Build and Deploy

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up --build -d

# Clean old images
docker image prune -f
```

### Resource Limits

Add resource constraints to `docker-compose.prod.yml`:

```yaml
services:
  dashboard:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

---

## Reverse Proxy Setup

### Nginx Reverse Proxy

Recommended setup with SSL termination at proxy level.

**Install Nginx:**
```bash
sudo apt update
sudo apt install nginx
```

**Create site configuration:**
```bash
sudo nano /etc/nginx/sites-available/dashboard
```

**Basic Nginx config:**
```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.yourdomain.com;
    
    # SSL certificates (from Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/dashboard.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.yourdomain.com/privkey.pem;
    
    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Dashboard app
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # API / Ping server
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Logging
    access_log /var/log/nginx/dashboard_access.log;
    error_log /var/log/nginx/dashboard_error.log;
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Traefik Reverse Proxy

Alternative modern reverse proxy with automatic SSL.

**docker-compose with Traefik:**
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
      - "--certificatesresolvers.myresolver.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    
  dashboard:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`dashboard.yourdomain.com`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls.certresolver=myresolver"
      - "traefik.http.services.dashboard.loadbalancer.server.port=8080"
```

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

**Install Certbot:**
```bash
sudo apt install certbot python3-certbot-nginx
```

**Obtain certificate:**
```bash
sudo certbot --nginx -d dashboard.yourdomain.com
```

**Auto-renewal:**
```bash
# Certbot automatically sets up renewal
# Test renewal:
sudo certbot renew --dry-run

# Manual renewal:
sudo certbot renew
```

**Certificate locations:**
```
/etc/letsencrypt/live/dashboard.yourdomain.com/fullchain.pem
/etc/letsencrypt/live/dashboard.yourdomain.com/privkey.pem
```

### Self-Signed Certificate (Development/Testing)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/dashboard.key \
  -out /etc/ssl/certs/dashboard.crt \
  -subj "/CN=dashboard.local"
```

---

## Database Backup

### Automated Backup Script

Create `/opt/dashboard-backup.sh`:

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/backup/dashboard"
CONTAINER_NAME="dashboard-postgres"
DB_NAME="dashboard"
DB_USER="dashboard"
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup filename with timestamp
BACKUP_FILE="$BACKUP_DIR/dashboard_$(date +%Y%m%d_%H%M%S).sql.gz"

# Create backup
docker exec $CONTAINER_NAME pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_FILE

# Remove old backups
find $BACKUP_DIR -type f -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_FILE"
```

**Make executable:**
```bash
chmod +x /opt/dashboard-backup.sh
```

**Schedule with cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/dashboard-backup.sh >> /var/log/dashboard-backup.log 2>&1
```

### Manual Backup

```bash
# Backup database
docker exec dashboard-postgres pg_dump -U dashboard dashboard > backup.sql

# Compress backup
gzip backup.sql

# Backup with timestamp
docker exec dashboard-postgres pg_dump -U dashboard dashboard | \
  gzip > dashboard_backup_$(date +%Y%m%d).sql.gz
```

### Restore from Backup

```bash
# Stop services
docker-compose -f docker-compose.prod.yml down

# Start only database
docker-compose -f docker-compose.prod.yml up -d postgres

# Restore backup
gunzip -c backup.sql.gz | docker exec -i dashboard-postgres \
  psql -U dashboard -d dashboard

# Start all services
docker-compose -f docker-compose.prod.yml up -d
```

### Backup Docker Volumes

```bash
# Backup PostgreSQL data volume
docker run --rm \
  -v dashboard_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data_backup.tar.gz -C /data .

# Restore volume
docker run --rm \
  -v dashboard_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_data_backup.tar.gz -C /data
```

---

## Monitoring & Maintenance

### Health Checks

**Check container status:**
```bash
docker-compose -f docker-compose.prod.yml ps
```

**View resource usage:**
```bash
docker stats
```

**Check logs:**
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker logs dashboard-app -f --tail 100
docker logs dashboard-ping-server -f --tail 100
docker logs dashboard-postgres -f --tail 100
```

### Database Monitoring

**Connection count:**
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT COUNT(*) FROM pg_stat_activity;"
```

**Database size:**
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT pg_size_pretty(pg_database_size('dashboard'));"
```

**User statistics:**
```bash
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c \
  "SELECT COUNT(*) as total_users,
   COUNT(*) FILTER (WHERE is_admin) as admins
   FROM users;"
```

### Log Rotation

Configure Docker log rotation in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker:
```bash
sudo systemctl restart docker
```

### Automated Updates

Create update script `/opt/dashboard-update.sh`:

```bash
#!/bin/bash

cd /opt/dashboard

# Pull latest code
git pull origin main

# Backup database
/opt/dashboard-backup.sh

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up --build -d

# Clean up
docker image prune -f

echo "Update completed: $(date)"
```

---

## Cloud Deployment

### AWS EC2

**1. Launch EC2 instance:**
- AMI: Ubuntu 22.04 LTS
- Instance type: t3.medium (recommended)
- Security group: Allow ports 80, 443, 22

**2. Install Docker:**
```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker ubuntu
```

**3. Deploy:**
```bash
git clone https://github.com/yourusername/stealthDash.git
cd stealthDash/Dashboard
cp .env.example .env
nano .env  # Configure
docker-compose -f docker-compose.prod.yml up -d
```

**4. Configure security group:**
- Inbound: 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Outbound: All traffic

### DigitalOcean Droplet

**1. Create droplet:**
- Image: Docker on Ubuntu
- Size: 2GB RAM minimum
- Enable monitoring

**2. Deploy:**
```bash
git clone https://github.com/yourusername/stealthDash.git
cd stealthDash/Dashboard
./setup.sh  # Select production option
```

**3. Configure firewall:**
```bash
ufw allow 80
ufw allow 443
ufw allow 22
ufw enable
```

### Google Cloud Platform

**1. Create VM instance:**
```bash
gcloud compute instances create dashboard \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --machine-type=e2-medium \
  --tags=http-server,https-server
```

**2. SSH and deploy:**
```bash
gcloud compute ssh dashboard
# Then follow standard deployment steps
```

### Docker Registry Deployment

**1. Build and tag image:**
```bash
docker build -t yourusername/dashboard:latest .
docker push yourusername/dashboard:latest
```

**2. Deploy on any server:**
```bash
docker pull yourusername/dashboard:latest
docker run -d -p 8080:80 yourusername/dashboard:latest
```

---

## Security Hardening

### Firewall Configuration

**UFW (Ubuntu):**
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22

# Allow HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Check status
sudo ufw status
```

**Firewalld (CentOS/RHEL):**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### Fail2Ban for SSH Protection

**Install:**
```bash
sudo apt install fail2ban
```

**Configure `/etc/fail2ban/jail.local`:**
```ini
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600
```

**Start:**
```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Security Best Practices

1. **Strong passwords:**
   - Use password manager
   - Minimum 16 characters
   - Mix of characters, numbers, symbols

2. **JWT Secret:**
   - Generate 32+ byte random key
   - Never commit to git
   - Rotate periodically

3. **Database:**
   - Strong password
   - Limit connections to localhost
   - Regular backups
   - Keep PostgreSQL updated

4. **HTTPS only:**
   - Force HTTPS redirect
   - Use HSTS header
   - Valid SSL certificate

5. **Rate limiting:**
   - Already implemented in ping-server
   - 100 requests per 15 minutes per IP
   - Adjust if needed

6. **Regular updates:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade
   
   # Update Docker images
   docker-compose pull
   docker-compose up -d
   ```

7. **Admin accounts:**
   - Limit number of admins
   - Use strong passwords
   - Monitor admin actions

8. **Network segmentation:**
   - Use Docker networks
   - Isolate database
   - Expose only necessary ports

### Environment Security

**Protect .env file:**
```bash
chmod 600 .env
chown root:root .env
```

**Never commit secrets:**
```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo "*.pem" >> .gitignore
echo "*.key" >> .gitignore
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs dashboard-app
docker logs dashboard-ping-server
docker logs dashboard-postgres

# Check ports
sudo netstat -tuln | grep -E '3000|3001|5432|8080'

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Database Connection Issues

```bash
# Test database connection
docker exec -it dashboard-postgres psql -U dashboard -d dashboard

# Check environment variables
docker exec dashboard-ping-server env | grep DB_

# Recreate containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Restart specific container
docker restart dashboard-app

# Add resource limits to docker-compose.prod.yml
```

### SSL Certificate Issues

```bash
# Test SSL
openssl s_client -connect dashboard.yourdomain.com:443

# Renew certificate
sudo certbot renew

# Check certificate expiry
sudo certbot certificates
```

---

## Performance Optimization

### Database Tuning

Add to `docker-compose.prod.yml`:

```yaml
postgres:
  command: 
    - "postgres"
    - "-c"
    - "shared_buffers=256MB"
    - "-c"
    - "max_connections=100"
    - "-c"
    - "work_mem=4MB"
```

### Nginx Caching

Add to Nginx config:

```nginx
# Cache static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Enable gzip
gzip on;
gzip_vary on;
gzip_types text/plain text/css text/xml text/javascript 
           application/x-javascript application/xml+rss 
           application/json application/javascript;
```

### Docker Image Optimization

- Use multi-stage builds
- Minimize layers
- Use .dockerignore
- Regular cleanup: `docker system prune`

---

## Rollback Procedure

If update causes issues:

```bash
# Stop current version
docker-compose -f docker-compose.prod.yml down

# Restore database backup
gunzip -c backup.sql.gz | docker exec -i dashboard-postgres \
  psql -U dashboard -d dashboard

# Checkout previous version
git log --oneline  # Find commit
git checkout <commit-hash>

# Rebuild and start
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## Support & Resources

- **Main Documentation**: [README.md](./README.md)
- **Widget Guide**: [WIDGETS.md](./WIDGETS.md)
- **GitHub Issues**: Report bugs and request features
- **Docker Documentation**: [docs.docker.com](https://docs.docker.com)
- **Let's Encrypt**: [letsencrypt.org](https://letsencrypt.org)

---

**Last Updated:** November 2025
