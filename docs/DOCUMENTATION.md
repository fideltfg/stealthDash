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
Detailed guide for all 25 widget types:
- Core widgets (Image, Embed)
- Monitoring widgets (Uptime, Clock, Glances, Speedtest)
- Integration widgets (Weather, RSS, Calendar, Gmail, Home Assistant, Pi-hole, Docker, Crypto, UniFi)
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

### [../stealthdash-desktop-app/README.md](../stealthdash-desktop-app/README.md) - Desktop App
Desktop app guide covering:
- Desktop wallpaper-style app behavior on Linux/Windows
- Prebuilt package install (`.exe` and `.deb`)
- Build commands for release artifacts
- Tray/settings usage and platform notes

## Technical Documentation

### [PING_SERVER.md](./PING_SERVER.md) - Backend API
Backend service documentation:
- API endpoints reference
- Authentication system
- Widget proxy services
- Session caching
- Device protocols (SNMP, Modbus)

### [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md) - Plugin Architecture
Widget plugin system documentation:
- Plugin structure and conventions
- Creating custom plugins
- Plugin helpers and utilities
- Plugin loading and registration

### [plugins/](./plugins/) - Individual Plugin Documentation
Detailed API docs for each of the 17 backend plugins:
- Route endpoints, parameters, and response formats
- Authentication and credential requirements
- Caching behavior and configuration
- Setup instructions and troubleshooting

## Customization

### [THEMING.md](./THEMING.md) - Theme Customization
Theme system documentation:
- Color tokens and CSS variables
- 15 built-in themes (Light, Dark, Gruvbox, Tokyo Night, Catppuccin, Forest, Sunset, Peachy, Stealth, Tactical, Futurist, Retro, Ethereal, Medieval, System)
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
- Widget development: [WIDGETS.md](./WIDGETS.md)
- API reference: [PING_SERVER.md](./PING_SERVER.md)
- Plugin system: [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md)
- Plugin API docs: [plugins/](./plugins/)
- Theming: [THEMING.md](./THEMING.md)
- CSS reference: [CSS-COMPONENT-REFERENCE.md](./CSS-COMPONENT-REFERENCE.md)
- Testing guide: [TESTING.md](./TESTING.md)
- Running tests: [TESTING.md#running-tests](./TESTING.md#running-tests)
- Security tests: [TESTING.md#security-tests](./TESTING.md#security-tests)

**For Production:**
- Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Security: [DEPLOYMENT.md#security-hardening](./DEPLOYMENT.md#security-hardening)
- Backup: [DEPLOYMENT.md#database-backup](./DEPLOYMENT.md#database-backup)

**Desktop App:**
- Desktop guide: [../stealthdash-desktop-app/README.md](../stealthdash-desktop-app/README.md)
- Install prebuilt packages: [../stealthdash-desktop-app/README.md#install-prebuilt-packages](../stealthdash-desktop-app/README.md#install-prebuilt-packages)

