# StealthDash

StealthDash is a self-hosted, multi-user dashboard with configurable widgets for infrastructure, home automation, remote desktops, calendars, weather, and other services. The browser frontend is built with TypeScript and Vite, served by Nginx, and backed by an Express API and PostgreSQL.

## Production quick start

```bash
cp .env.example .env

# Generate different values for these two settings:
openssl rand -hex 32  # ENCRYPTION_KEY
openssl rand -hex 64  # JWT_SECRET

# Set DASHBOARD_URL and the exact browser origin(s) in CORS_ALLOWED_ORIGINS.
chmod 600 .env

docker compose up -d --build
docker compose ps
```

The Dashboard is served on port `3000`; the backend API uses port `3001`. The base Compose file already builds the frontend with `Dockerfile.prod`. The optional `docker-compose.prod.yml` file is an overlay and must be combined with the base file when used.

`JWT_SECRET` is required at Compose-render time. `CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Changing the JWT secret invalidates existing sessions and requires users to sign in again.

Local Docker widget requests do not give the backend direct access to `/var/run/docker.sock`. A private, read-only socket-proxy container allows only container listing, logs, start, stop, and restart operations. Other Docker API paths return `403`.

## Documentation

- [Complete project guide](docs/README.md)
- [Production deployment and hardening](docs/DEPLOYMENT.md)
- [Widget guide](docs/WIDGETS.md)
- [VNC widget](docs/widgets/VNC_WIDGET.md)
- [Docker widget](docs/widgets/DOCKER_WIDGET.md)
- [Backend and plugin architecture](docs/PING_SERVER.md)
- [Testing and security checks](docs/TESTING.md)

Keep site-specific addresses, credentials, and generated secrets in `.env` or Credential Manager. Do not commit them to the repository.
