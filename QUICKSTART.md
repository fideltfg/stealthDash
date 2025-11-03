# Dashboard - Quick Start Guide

## 🚀 Getting Started in 30 Seconds

### Option 1: Automated Setup (Easiest)

```bash
cd /home/concordia/Dashboard
./setup.sh
```

Choose option 1 for development or option 2 for production.

### Option 2: Using Makefile

```bash
make dev-d      # Start development server
make logs       # View logs
make down       # Stop server
```

### Option 3: Direct Docker Commands

**Development:**
```bash
docker compose up -d
```

**Production:**
```bash
docker compose -f docker-compose.prod.yml up -d
```

## 📱 Access the Dashboard

- **Development**: [http://localhost:3000](http://localhost:3000)
- **Production**: [http://localhost:8080](http://localhost:8080)

## 🎯 First Steps

1. **Add a Widget**
   - Click the **+** button (bottom-right)
   - Select a widget type (Text, Image, Data, or Embed)
   - Widget appears at center - start editing!

2. **Move a Widget**
   - Drag the widget header or body
   - Or use keyboard: Arrow keys (Shift for 10x speed)

3. **Resize a Widget**
   - Hover to show resize handles (corners/edges)
   - Drag to resize
   - Or use keyboard: Alt+Arrow keys

4. **Change Theme**
   - Click **🌓** button (bottom-left)
   - Cycles: Light → Dark → System

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | `Cmd/Ctrl + Z` |
| Redo | `Cmd/Ctrl + Shift + Z` |
| Move widget | `Arrow Keys` |
| Move 10x faster | `Shift + Arrow` |
| Delete widget | `Delete` or `Backspace` |
| Deselect | `Escape` |

## 🛠️ Common Commands

### Development

```bash
# Start server
make dev-d
# or
docker compose up -d

# View logs
make logs
# or
docker compose logs -f

# Stop server
make down
# or
docker compose down

# Rebuild after code changes
make rebuild
# or
docker compose up --build -d
```

### Production

```bash
# Build and start
make prod
# or
docker compose -f docker-compose.prod.yml up -d

# View logs
make logs-prod

# Stop
docker compose -f docker-compose.prod.yml down
```

## 🐛 Troubleshooting

### Port Already in Use

Change port in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Use 3001 instead of 3000
```

### Code Changes Not Reflecting

```bash
make rebuild
# or
docker compose down
docker compose up --build -d
```

### View Container Logs

```bash
docker compose logs -f
```

### Reset Everything

```bash
make clean
# or
docker compose down -v
docker system prune -f
```

## 📚 Documentation

- **README.md** - Full feature documentation
- **DOCKER.md** - Complete Docker deployment guide
- **THEMING.md** - Theme customization guide

## 🎨 Features Implemented

✅ Zero-chrome UI (no menus)
✅ Drag & drop widgets
✅ Resize with handles
✅ Light/dark/system themes
✅ Keyboard navigation
✅ Undo/redo
✅ Auto-save to localStorage
✅ 4 widget types (Text, Image, Data, Embed)
✅ Docker development environment
✅ Docker production build
✅ Hot module reloading

## 📝 Widget Types

1. **Text** - Markdown editor
2. **Image** - Image display with URL
3. **Data** - JSON data viewer
4. **Embed** - Website iframe (sandboxed)

## 🔒 Data Persistence

All data is saved automatically to browser's localStorage.

**Reset dashboard:**
```javascript
// In browser console
localStorage.removeItem('dashboard.v1');
location.reload();
```

## 🏗️ Project Structure

```
Dashboard/
├── src/
│   ├── main.ts          # App entry
│   ├── types.ts         # TypeScript types
│   ├── storage.ts       # localStorage
│   ├── history.ts       # Undo/redo
│   ├── style.css        # Themes & styles
│   └── widgets/
│       └── widget.ts    # Widget components
├── Dockerfile           # Dev container
├── Dockerfile.prod      # Production container
├── docker-compose.yml   # Dev setup
├── docker-compose.prod.yml  # Prod setup
├── Makefile            # Helper commands
├── setup.sh            # Setup script
└── index.html          # Entry point
```

## 🚢 Deployment

See **DOCKER.md** for:
- Cloud deployment (Docker Hub, AWS, etc.)
- Kubernetes conversion
- Production optimization
- Security configuration

## 💡 Tips

1. **Snap to Grid**: Widgets automatically snap to 8px grid
2. **Z-order**: Select widget → toolbar → "Bring Forward"
3. **Multi-widgets**: Add multiple widgets for complex layouts
4. **Themes persist**: Your theme choice is saved
5. **Focus visible**: Tab through interface with keyboard

## 🤝 Need Help?

Check the full documentation:
- `README.md` for features
- `DOCKER.md` for deployment
- `THEMING.md` for customization

## ✨ Enjoy Your Dashboard!
