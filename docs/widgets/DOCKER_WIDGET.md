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
- Remove containers
- View container details
- Color-coded status indicators (green=running, red=stopped, yellow=paused)
- Quick actions with confirmation dialogs

## Container Actions

- **Start**: Start a stopped container
- **Stop**: Gracefully stop a running container
- **Restart**: Restart a container
- **Remove**: Delete a container (requires confirmation)

## Requirements

- Docker Engine accessible from ping-server
- Proper permissions to manage containers
- For remote Docker: TLS certificates or credentials configured

## Troubleshooting

**"Cannot connect to Docker"**
- Verify Docker is running and accessible

**Permission denied**
- Ensure user has Docker permissions

**Actions not working**
- Check Docker socket permissions

**Remote host not connecting**
- Verify host URL and credentials
