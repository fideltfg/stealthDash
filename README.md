# Dashboard

A web-based dashboard with draggable, resizable widgets. No menus, just widgets on an infinite canvas.

## Features

✨ **Zero Chrome UI** - No sidebars, headers, or footers. Only floating controls.

🎨 **Theming** - Light, dark, and system theme support with smooth transitions.

📦 **Widget Types** - Text (Markdown), Image, Data (JSON), and Web Embed widgets.

🖱️ **Drag & Resize** - Intuitive pointer-based and keyboard controls.

⌨️ **Keyboard Accessible** - Full keyboard navigation with visible focus rings.

↩️ **Undo/Redo** - Complete history management (Cmd/Ctrl+Z).

💾 **Auto-Save** - Persistent state in localStorage with debounced writes.

📱 **Responsive** - Works on desktop and tablet devices.

🏓 **Uptime Monitoring** - Real network ping monitoring with backend service.

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- No local Node.js installation required!

### Start with Ping Server (Recommended for Uptime Widget)

```bash
./start-with-ping.sh
```

This starts both the dashboard and the ping server for the uptime widget.

### Using the Setup Script (Recommended)

```bash
./setup.sh
```

Select option 1 for development or option 2 for production.

### Using Makefile (Quick Commands)

```bash
# Development
make dev          # Start dev server (foreground)
make dev-d        # Start dev server (background)
make logs-dev     # View logs

# Production  
make prod         # Build and start production
make logs-prod    # View logs

# Other commands
make help         # See all available commands
make down         # Stop containers
make clean        # Clean up everything
```

See all available commands: `make help`

### Manual Setup - Development

```bash
# Build and start development server
docker-compose up --build

# Or run in background
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Manual Setup - Production

```bash
# Build and start production server
docker-compose -f docker-compose.prod.yml up --build -d
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Docker Commands

```bash
# View logs
docker-compose logs -f

# Stop containers
docker-compose down

# Restart
docker-compose restart

# Rebuild after code changes
docker-compose up --build
```

### Local Development (without Docker)

If you prefer to run without Docker:

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Usage

### Adding Widgets

1. Click the **+** button (bottom-right)
2. Select a widget type
3. Widget appears at viewport center
4. Start editing immediately

### Moving Widgets

- **Mouse**: Drag the widget header or body
- **Keyboard**: Arrow keys (Shift+Arrow for 10x speed)
- Widgets snap to an 8px grid

### Resizing Widgets

- **Mouse**: Drag resize handles (corners/edges)
- **Keyboard**: Alt+Arrow keys
- Minimum size enforced automatically

### Keyboard Shortcuts

- `Cmd/Ctrl+Z` - Undo
- `Cmd/Ctrl+Shift+Z` - Redo
- `Arrow Keys` - Move selected widget
- `Shift+Arrow` - Move 10x faster
- `Delete/Backspace` - Delete selected widget
- `Escape` - Deselect widget
- `Tab` - Navigate UI elements

### Themes

Click the **🌓** button (bottom-left) to cycle through:

1. Light theme
2. Dark theme
3. System theme (follows OS preference)

Theme preference is saved automatically.

### Backgrounds

Click the **◫** button (bottom-left, above theme toggle) to cycle through background patterns:

1. **Grid** - Classic grid pattern (default)
2. **Dots** - Subtle dot pattern
3. **Lines** - Horizontal lines
4. **Solid** - Clean solid color

Background preference is saved automatically.

## Widget Types

### Text Widget

- Supports basic Markdown formatting
- Click to edit inline
- Auto-saves on change

**Markdown support:**
- Headers: `# H1`, `## H2`, `### H3`
- Bold: `**text**`
- Italic: `*text*`
- Code: `` `code` ``

### Image Widget

- Click placeholder to add image URL
- Supports `contain` and `cover` object-fit modes
- Includes alt text for accessibility

### Data Widget

- Displays JSON data in formatted view
- Read-only (paste JSON in the content)

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

## Data Persistence

Dashboard state is saved to `localStorage` under key `dashboard.v1`:

```json
{
  "widgets": [...],
  "theme": "dark",
  "grid": 8,
  "zoom": 1.0,
  "viewport": { "x": 0, "y": 0 },
  "version": 1
}
```

### Reset Dashboard

To reset to default state, clear localStorage:

```javascript
localStorage.removeItem('dashboard.v1');
```

Then refresh the page.

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
