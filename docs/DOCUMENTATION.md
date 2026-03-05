# Dashboard Documentation Index

Documentation for the StealthDash monitoring system.

## Main Documentation

### [README.md](./README.md) - Start Here
Complete guide covering:
- Quick start installation
- Authentication and user management
- Widget usage and keyboard shortcuts
- Administration features
- Docker commands and configuration
- Troubleshooting and support

### [WIDGETS.md](./WIDGETS.md) - Widget Configuration
Detailed guide for all 23 widget types:
- Core widgets (Text, Image, Embed)
- Monitoring widgets (Uptime, Clock, Glances, Speedtest)
- Integration widgets (Weather, RSS, Calendar, Gmail, Home Assistant, Pi-hole, Docker, UniFi)
- Smart Home & IoT widgets (UniFi Protect, UniFi Sensor, Sensi, Comet P8541)
- Specialized widgets (Environment Canada, MTN XML, Tasks, VNC)
- Configuration examples and troubleshooting

### [DEPLOYMENT.md](./DEPLOYMENT.md) - Production Deployment
Production deployment guide:
- Environment configuration
- Docker production setup
- Reverse proxy (Nginx/Traefik) with SSL
- Database backup and restore
- Monitoring and maintenance
- Cloud deployment (AWS, DigitalOcean, GCP)
- Security hardening

## Technical Documentation

### [src/widgets/README.md](./src/widgets/README.md) - Widget Architecture
Developer guide for widget system:
- Plugin architecture overview
- Creating custom widgets
- Widget renderer interface
- Registration and loading

### [ping-server/README.md](./ping-server/README.md) - Backend API
Backend service documentation:
- API endpoints reference
- Authentication system
- Widget proxy services
- Session caching
- Device protocols (SNMP, Modbus)

## Customization

### [Docs/THEMING.md](./Docs/THEMING.md) - Theme Customization
Theme system documentation:
- Color tokens and CSS variables
- Light/dark/system themes
- Creating custom themes
- Background patterns (Grid, Dots, Lines, Solid)
- Custom backgrounds (Images and Videos)
- Accessibility guidelines

---

## Quick Navigation

**Getting Started:**
1. Read [README.md](./README.md) Quick Start section
2. Follow installation steps
3. Register first user and make admin
4. Explore [WIDGETS.md](./WIDGETS.md) for widget types

**For Developers:**
- Widget development: [src/widgets/README.md](./src/widgets/README.md)
- API reference: [ping-server/README.md](./ping-server/README.md)
- Theming: [Docs/THEMING.md](./Docs/THEMING.md)
- Testing guide: [TESTING.md](./TESTING.md)
- Running tests: [TESTING.md#running-tests](./TESTING.md#running-tests)
- Security tests: [TESTING.md#security-tests](./TESTING.md#security-tests)

**For Production:**
- Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Security: [DEPLOYMENT.md#security-hardening](./DEPLOYMENT.md#security-hardening)
- Backup: [DEPLOYMENT.md#database-backup](./DEPLOYMENT.md#database-backup)

