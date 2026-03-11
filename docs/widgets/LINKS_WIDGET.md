# Links Widget

A widget for managing and launching a personal collection of links — including websites, local network services, and local applications.

## Features

- **Add, edit, and delete** links with title, URL, category, and optional custom icon
- **Three display modes**: icon+text list, text-only list, or icon grid
- **Search** to filter links by title, URL, or category
- **Category filter** tabs for quick browsing
- **Sorting** by title, category, or manual drag-and-drop order
- **Favicon auto-detection** for `http://` and `https://` links
- **Protocol-aware icons** for local and special links (SSH, RDP, Steam, file paths, etc.)
- **Local/desktop app links** via custom URL protocols

---

## Display Modes

| Mode | Description |
|------|-------------|
| **Icon + Text** (default) | List view with favicon and title |
| **Text only** | Compact list, no icons |
| **Icons only** | Grid of favicons with small title labels below |

---

## Link URLs

Any URL scheme is supported. The browser or OS will handle protocol dispatch:

| Protocol | Example | Use case |
|----------|---------|----------|
| `https://` | `https://home-assistant.local` | Web services & dashboards |
| `http://` | `http://192.168.1.1` | Local network services |
| `ssh://` | `ssh://user@hostname` | SSH sessions |
| `rdp://` | `rdp://192.168.1.50` | Remote Desktop |
| `vnc://` | `vnc://192.168.1.50` | VNC sessions |
| `steam://` | `steam://rungameid/570` | Launch Steam games |
| `file://` | `file:///home/user/script.sh` | Local files (desktop app only) |
| `ftp://` | `ftp://nas.local` | FTP servers |
| `mailto:` | `mailto:user@example.com` | Email |

> **Tip:** Local protocol links (SSH, RDP, `file://`, Steam, etc.) work best in the **StealthDash Desktop App** where the OS can handle custom protocol handlers.

---

## Favicons

- **Auto-detected** for HTTP/HTTPS links using the site's `/favicon.ico`
- **Custom icon URL** can be specified per link (any image URL)
- **Fallback icons** (FontAwesome) are shown automatically when:
  - The favicon cannot be loaded
  - The link uses a non-web protocol

Protocol fallback icons:

| Protocol | Icon |
|----------|------|
| `ssh://`, `sftp://` | Terminal |
| `rdp://`, `vnc://` | Desktop |
| `steam://` | Gamepad |
| `file://` | Folder |
| `ftp://` | Server |
| `mailto:` | Envelope |
| other | Link |

---

## Categories

- Assign a **category** string to any link (e.g., `Work`, `Gaming`, `Media`, `Home Lab`)
- Category filter tabs are shown automatically when links have categories
- Categories are sorted alphabetically
- The **All** tab always shows every link

---

## Sorting

| Sort mode | Description |
|-----------|-------------|
| **Title A→Z** (default) | Alphabetical by title |
| **Category then Title** | Grouped by category, then alphabetically |
| **Manual** | Use ↑↓ buttons or drag-and-drop to set your own order |

In **Manual** mode, each link shows ↑ / ↓ reorder buttons on hover. You can also drag
link items up or down using the grip handle.

---

## Widget Settings

Open via the gear icon in the widget header:

| Setting | Options |
|---------|---------|
| Display Mode | Icon + Text / Text only / Icons only |
| Sort By | Title / Category / Manual |
| Show search bar | On / Off |
| Show category filter | On / Off |

---

## Storage

Links are stored **inside the widget content** as part of the dashboard state. Each Links widget maintains its own independent list — you can have multiple Links widgets with different collections (e.g., "Work", "Gaming", "Media").

Data is persisted automatically when you save or auto-save your dashboard.

---

## Example Use Cases

- **Home Lab launcher**: links to Portainer, Home Assistant, Pi-hole, Proxmox, etc.
- **Game library**: Steam deep links to launch specific games
- **Work bookmarks**: internal tools and documentation links
- **Media shortcuts**: Plex, Jellyfin, YouTube, Netflix
- **SSH quick-access**: one-click SSH sessions (with an SSH client that handles `ssh://`)
