# Docker Widget

Monitor and manage Docker containers directly from your dashboard.

## Requirements

- Docker host accessible from dashboard
- Docker credentials (if remote host)

## Setup

1. Add Docker widget to dashboard
2. Click settings icon
3. Configure:
   - **Docker Host**: Leave empty for local Docker, or provide remote host URL
   - **Credentials**: Select Docker credentials if connecting remotely
   - **Show All**: Toggle to show all containers or only running ones
   - **Refresh Interval**: Auto-update frequency (default: 10 seconds)

## Display

- Container name and status (running/stopped/paused)
- Image name and tag
- Uptime/status duration
- Port mappings
- Container actions (start/stop/restart/remove)

## Features

- Real-time container status
- Start/stop/restart containers
- View container logs
- View container details
- Color-coded status indicators (green=running, red=stopped, yellow=paused)
- Quick actions with confirmation dialogs

## Container Actions

- **Start**: Start a stopped container
- **Stop**: Gracefully stop a running container
- **Restart**: Restart a container
- **Remove**: Available only for remote Docker endpoints that permit deletion; the local socket proxy rejects it

## Requirements

- Docker Engine accessible through the included restricted socket proxy
- The `ping-server` and socket proxy connected to the private `docker_api` network
- For remote Docker: TLS certificates or credentials configured

## Troubleshooting

**"Cannot connect to Docker"**
- Verify Docker is running and accessible

**Permission denied**
- Confirm `stealth-docker-socket-proxy` is running and attached to `docker_api`
- Confirm the requested operation is one of: list, logs, start, stop, or restart

**Actions not working**
- Check the socket-proxy and backend logs
- The proxy intentionally rejects image, volume, exec, filesystem, secret, remove, and other Docker API paths

**Remote host not connecting**
- Verify host URL and credentials
