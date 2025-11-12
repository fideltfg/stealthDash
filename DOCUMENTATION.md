# Dashboard Documentation Index

Complete documentation for the StealthDash monitoring system.

## 📚 Main Documentation

### [README.md](./README.md) - Start Here
Complete guide covering:
- Quick start installation
- Authentication and user management
- Widget usage and keyboard shortcuts
- Administration features
- Docker commands and configuration
- Troubleshooting and support

### [WIDGETS.md](./WIDGETS.md) - Widget Configuration
Detailed guide for all 15+ widget types:
- Core widgets (Text, Image, Data, Embed)
- Monitoring widgets (Uptime, Clock, Timezones)
- Integration widgets (ChatGPT, Weather, RSS, Calendar, Home Assistant, Pi-hole, UniFi)
- Specialized widgets (Environment Canada, MTN XML, Comet P8541)
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

## 🔧 Technical Documentation

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

## 🎨 Customization

### [Docs/THEMING.md](./Docs/THEMING.md) - Theme Customization
Theme system documentation:
- Color tokens and CSS variables
- Light/dark/system themes
- Creating custom themes
- Accessibility guidelines

## �� Integration Examples

### [Docs/SENSOR_GRAPH_API_EXAMPLE.md](./Docs/SENSOR_GRAPH_API_EXAMPLE.md)
PHP API endpoint examples for sensor data integration.

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

**For Production:**
- Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Security: [DEPLOYMENT.md#security-hardening](./DEPLOYMENT.md#security-hardening)
- Backup: [DEPLOYMENT.md#database-backup](./DEPLOYMENT.md#database-backup)

---

## Documentation Statistics

- **Main Guides**: 3 files (2,116 lines)
- **Technical Docs**: 2 files
- **Customization**: 2 files
- **Total**: 8 documentation files

**Clean, Focused, Complete** ✨
