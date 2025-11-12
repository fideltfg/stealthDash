# Dashboard

A minimalist web dashboard with draggable, resizable widgets. Built with TypeScript, featuring zero-chrome UI, multi-user authentication, and 15+ widget types.

## Features

- 🎯 **Zero-Chrome UI** - No sidebars or menus, just floating controls
- 🧩 **15+ Widget Types** - Text, Image, Uptime, RSS, Weather, ChatGPT, Clock, and more
- 👤 **Multi-User Auth** - Secure login, registration, and admin management
- 🎨 **Theming** - Light, dark, and system theme with custom backgrounds
- 🖱️ **Drag & Resize** - Intuitive controls with grid snapping
- ⌨️ **Keyboard Navigation** - Full accessibility support
- 💾 **Auto-Save** - Server-side persistence with PostgreSQL
- � **Credential Management** - Secure storage for API keys and secrets
- 🏓 **Network Monitoring** - Real-time uptime tracking with ping server

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stealthDash.git
   cd stealthDash/Dashboard
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (optional for basic setup)
   ```

3. **Start the application**
   ```bash
   docker compose up -d
   ```

4. **Access the dashboard**
   - Open [http://localhost:3000](http://localhost:3000)
   - Register your first user account
   - Start adding widgets!

### First User Setup

The first registered user needs admin privileges:

```bash
# Make first user an admin
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE id = 1;"
```

## Usage Guide


### Authentication

**Register**
- Click "Register" on login screen
- Enter username, email, password
- Login with your credentials

**Login**
- Enter username and password
- Dashboard loads with your saved layout

**Password Recovery**
- Click "Forgot Password?" on login screen
- Enter email to receive reset link
- Requires SMTP configuration in `.env`

### Managing Widgets

**Add Widget**
1. Click the **+** button (bottom-right)
2. Select widget type from the list
3. Configure widget settings
4. Widget appears on your canvas

**Move Widget**
- **Mouse**: Drag anywhere on the widget
- **Keyboard**: Select widget, use arrow keys (Shift+Arrow for 10x speed)

**Resize Widget**
- **Mouse**: Drag resize handles (corners/edges appear on hover)
- **Keyboard**: Select widget, Alt+Arrow keys

**Configure Widget**
- Click the settings icon on widget header
- Each widget type has unique configuration options
- Changes save automatically

**Delete Widget**
- Click the ✕ button on widget header

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo last change |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Arrow Keys` | Move selected widget |
| `Shift + Arrow` | Move widget 10x faster |
| `Alt + Arrow` | Resize selected widget |
| `Escape` | Deselect widget |
| `Tab` | Navigate UI controls |

### Themes & Backgrounds

**Change Theme**
- Click the **🌓** button (bottom-left menu)
- Cycles through: Light → Dark → System preference

**Change Background**
- Click the **◫** button (bottom-left menu)
- Options: Grid (default), Dots, Lines, Solid

**Lock Dashboard**
- Click the **🔒** button (top-right)
- Prevents accidental widget changes
- Hides edit controls

### Credential Management

Many widgets require API keys or credentials. Store them securely:

1. Click user menu (bottom-left avatar)
2. Select "Manage Credentials"
3. Add credential with name and value
4. Reference in widget settings using credential name

**Supported Types:**
- API Keys (ChatGPT, Weather, etc.)
- UniFi Controller credentials
- Home Assistant tokens
- Pi-hole API keys

## Available Widgets

### Core Widgets

**Image Widget**
- Display images from URL
- Object-fit modes: contain, cover
- Alt text support

**Embed Widget**
- Embed external websites
- Sandboxed iframe for security
- Click-to-activate for performance

### Monitoring Widgets

**Uptime Widget**
- Real-time ping monitoring
- Multiple target tracking
- Latency graphs and history
- Success/failure statistics

**Clock Widget**
- Digital and analog display modes
- 24h/12h format options
- Customizable colors

**Timezones Widget**
- Multiple timezone clocks
- Add/remove cities
- Real-time updates

### Integration Widgets

**ChatGPT Widget**
- Direct ChatGPT integration
- Requires OpenAI API key
- Conversation history
- Multiple model support

**Weather Widget**
- Current conditions and forecast
- Multiple location support
- Requires weather API key

**RSS Feed Widget**
- Display RSS/Atom feeds
- Auto-refresh
- Customizable update interval

**Google Calendar Widget**
- View upcoming events
- Requires Google Calendar API

**Home Assistant Widget**
- Display sensor data
- Control devices
- Requires Home Assistant token

**Pi-hole Widget**
- View blocking statistics
- DNS query metrics
- Requires Pi-hole API key

**UniFi Widget**
- Network device status
- Client connections
- Requires UniFi Controller access

### Specialized Widgets

**Environment Canada Widget**
- Canadian weather and alerts
- No API key required

**MTN XML Widget**
- Parse and display XML data
- Customizable XPath queries

**Comet P8541 Widget**
- Temperature/humidity sensor display
- Gauge visualization

See [WIDGETS.md](./WIDGETS.md) for detailed widget configuration guides.

## Administration

### Admin Dashboard

Admin users have access to user management:

1. Click user menu (bottom-left)
2. Select "Admin Dashboard" (only visible to admins)
3. Manage users, credentials, and system settings

**Admin Functions:**
- View all users
- Promote/demote admin status
- Reset user passwords
- Delete user accounts
- View system statistics

### Making Users Admin

**Via Database:**
```bash
docker exec -i dashboard-postgres psql -U dashboard -d dashboard -c \
  "UPDATE users SET is_admin = true WHERE username = 'username';"
```

**Via Admin UI:**
1. Login as admin
2. Open Admin Dashboard
3. Find user in list
4. Click "Make Admin" button

## Docker Commands

### Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after code changes
docker-compose up --build -d

# Stop services
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d
```

### Production

```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop
docker-compose -f docker-compose.prod.yml down
```

### Makefile Commands

```bash
make dev        # Start development
make dev-d      # Start development (background)
make prod       # Start production
make logs       # View logs
make down       # Stop containers
make clean      # Clean everything
make help       # Show all commands
```

## Configuration

### Environment Variables

Edit `.env` file for custom configuration:

```bash
# Database
POSTGRES_USER=dashboard
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=dashboard

# Security
JWT_SECRET=your-secret-key-change-this

# Email (for password recovery)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Dashboard <noreply@yourdomain.com>
DASHBOARD_URL=http://localhost:3000

# Server
VITE_ALLOWED_HOSTS=localhost,.local
```

### Email Setup for Password Recovery

**Gmail:**
1. Enable 2-Factor Authentication
2. Generate App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use App Password as `SMTP_PASS`

**Other Providers:**
See `.env.example` for Office 365, Outlook, Yahoo configurations.

### Port Configuration

Edit `docker-compose.yml` to change ports:

```yaml
services:
  dashboard:
    ports:
      - "3000:3000"  # Change 3000 to desired port
  
  ping-server:
    ports:
      - "3001:3001"  # Change 3001 to desired port
```

## Project Structure

```
Dashboard/
├── src/
│   ├── main.ts                  # Application entry point
│   ├── types.ts                 # TypeScript type definitions
│   ├── storage.ts               # API client for server persistence
│   ├── history.ts               # Undo/redo functionality
│   ├── css/
│   │   └── style.css           # Global styles and theming
│   ├── ui/                      # UI components (auth, admin, etc.)
│   └── widgets/
│       ├── widget.ts           # Widget base functionality
│       └── types/              # Widget implementations
│           ├── text.ts
│           ├── image.ts
│           ├── uptime.ts
│           └── ...
├── ping-server/                # Backend API server
│   ├── server.js              # Express server
│   ├── auth.js                # Authentication middleware
│   ├── db.js                  # Database connection
│   └── routes/                # API endpoints
├── http/                       # Static HTTP server files
├── docker-compose.yml          # Development Docker setup
├── docker-compose.prod.yml     # Production Docker setup
├── Dockerfile                  # Dashboard container
├── .env.example               # Environment template
└── README.md                  # This file
```

## Technology Stack

- **Frontend**: TypeScript, Vite, Vanilla JS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL 15
- **Libraries**: D3.js (graphs), JustGage (gauges), Marked (markdown)
- **Auth**: JWT tokens, bcrypt password hashing
- **Container**: Docker & Docker Compose

## Troubleshooting

### Port Already in Use

Change ports in `docker-compose.yml` or stop conflicting services:
```bash
# Check what's using port 3000
lsof -i :3000
# or
netstat -tuln | grep 3000
```

### Can't Login / Auth Issues

```bash
# Check ping-server logs
docker logs dashboard-ping-server --tail 50

# Verify database connection
docker exec -it dashboard-postgres psql -U dashboard -d dashboard -c "SELECT COUNT(*) FROM users;"
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# View database logs
docker logs dashboard-postgres

# Reset database
docker-compose down -v
docker-compose up -d
```

### Widget Not Loading

1. Check browser console (F12) for errors
2. Verify widget type is registered in `src/widgets/types/index.ts`
3. Check for missing credentials (if widget requires API keys)

### Email Not Sending

1. Verify SMTP credentials in `.env`
2. Check ping-server logs: `docker logs dashboard-ping-server`
3. Test SMTP connection manually
4. Ensure firewall allows outbound SMTP traffic

## Security Considerations

- **Change default passwords** in `.env` file
- **Use strong JWT_SECRET** (32+ random characters)
- **Enable HTTPS** in production (use reverse proxy like Nginx)
- **Regular backups** of PostgreSQL data
- **Keep dependencies updated**: `npm audit` and `docker pull`
- **Limit admin accounts** to trusted users only
- **Use credential manager** instead of hardcoding API keys in widgets

## Deployment

For production deployment:

1. Use `docker-compose.prod.yml`
2. Configure reverse proxy (Nginx/Traefik) with SSL
3. Set secure environment variables
4. Enable firewall rules
5. Setup automated backups
6. Monitor logs regularly

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment guide.

## Development

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# In separate terminal, start ping-server
cd ping-server
npm install
node server.js
```

### Adding New Widgets

1. Create widget file in `src/widgets/types/your-widget.ts`
2. Implement `WidgetRenderer` interface
3. Export widget plugin with metadata
4. Register in `src/widgets/types/index.ts`

See existing widgets for examples.

## Browser Support

Modern browsers with ES2020 support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/stealthDash/issues)
- **Documentation**: See `Docs/` folder for additional guides
- **Widget Guide**: [WIDGETS.md](./WIDGETS.md)
- **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

Built with ❤️ using TypeScript and Docker

## Widget Types

### Image Widget

- Click placeholder to add image URL
- Supports `contain` and `cover` object-fit modes
- Includes alt text for accessibility

### Embed Widget

- Embeds external websites in sandboxed iframe
- Security restrictions apply
- Click to set URL

## Architecture

```
Dashboard/
├── src/
│   ├── main.ts          # Application entry point
│   ├── types.ts         # TypeScript type definitions
│   ├── storage.ts       # localStorage persistence
│   ├── history.ts       # Undo/redo management
│   ├── style.css        # Global styles & theming
│   └── widgets/
│       └── widget.ts    # Widget rendering & utilities
├── index.html           # HTML entry point
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite bundler config
├── THEMING.md          # Theming documentation
└── README.md           # This file
```

## Technology Stack

- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Vanilla JS** - No framework dependencies
- **CSS Custom Properties** - Dynamic theming
- **Pointer Events** - Modern drag/resize
- **localStorage** - Client-side persistence

## Browser Support

Modern browsers with support for:
- ES2020
- CSS Custom Properties
- Pointer Events
- localStorage

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Accessibility

✅ **WCAG AA Compliant**

- Keyboard navigation for all features
- Visible focus indicators
- ARIA labels and roles
- Screen reader announcements
- High contrast ratios
- Reduced motion support

## Customization

See [THEMING.md](./THEMING.md) for details on:

- Customizing colors and tokens
- Adding new themes
- Creating custom widget styles
- Accessibility considerations

## Known Limitations

- No server-side persistence (v1)
- No real-time collaboration (v1)
- No widget templates/library (v1)
- Auto-size feature is placeholder (v1)
- Embed widgets require trusted URLs

## Future Enhancements

- [ ] Multi-select and group operations
- [ ] Export/import dashboard JSON
- [ ] Alignment guides (smart guides)
- [ ] Server persistence & sync
- [ ] Widget templates library
- [ ] Grid density controls
- [ ] Touch device optimization
- [ ] Collaborative editing

## License

MIT

## Contributing

This is a demonstration project. Feel free to fork and customize for your needs.

## Support

For issues or questions, please file an issue on the repository.
