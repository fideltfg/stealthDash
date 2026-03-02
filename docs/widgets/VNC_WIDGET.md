# VNC Widget

Remote desktop access using VNC protocol with noVNC web client.

## Overview

View and control remote desktops directly in your dashboard using the VNC (Virtual Network Computing) protocol through a web-based noVNC client.

## Requirements

- VNC server running on remote machine
- Network access to VNC server
- VNC password (if authentication enabled)
- Ping server VNC proxy enabled

## Setup

1. Configure VNC server on remote machine:
   ```bash
   # Linux example (TightVNC)
   vncserver :1 -geometry 1920x1080 -depth 24
   
   # Set VNC password
   vncpasswd
   ```

2. Store VNC connection in Credential Manager:
   - Name: `My Desktop VNC`
   - Service Type: `VNC`
   - Host: `192.168.1.100`
   - Port: `5901` (5900 + display number)
   - Password: VNC password

3. Add VNC widget to dashboard

4. Configure:
   - Select credential from Credential Manager
   - Adjust display and quality settings
   - Enable auto-connect if desired

## Configuration Options

### Connection
- **Credential**: Stored VNC connection details
- **Auto Connect**: Automatically connect when widget loads
- **Reconnect Delay**: Seconds before auto-reconnect (0 = disabled)

### Display
- **Scale Mode**: 
  - Local: Scale to fit widget
  - Remote: Request remote resolution change
  - None: No scaling
- **Clip to Window**: Clip remote display to widget bounds
- **View Only**: Disable keyboard/mouse input (watch only)

### Quality
- **Quality Level**: JPEG quality (0-9, higher = better quality)
- **Compression Level**: Compression (0-9, higher = more compression)
- **Show Dot Cursor**: Display cursor as simple dot

## Features

- Full keyboard and mouse support
- Multiple simultaneous connections
- Clipboard sync (where supported)
- Resizable display
- Auto-reconnect on disconnect
- View-only mode for monitoring

## Usage

### Connecting
1. Click "Connect" button or enable auto-connect
2. Widget displays connection status
3. Once connected, interact with remote desktop

### Controls
- **Mouse**: Click and drag normally
- **Keyboard**: Type directly (widget must have focus)
- **Disconnect**: Click disconnect button
- **Fullscreen**: Resize widget to desired size

### Connection States
- **Disconnected**: Not connected
- **Connecting**: Establishing connection
- **Connected**: Active session
- **Failed**: Connection error

## Security Notes

- VNC transmits screen content
- Use VPN or SSH tunnel for internet connections
- Store credentials securely in Credential Manager
- Enable view-only mode for untrusted scenarios
- VNC traffic goes through ping-server proxy

## Troubleshooting

**Cannot connect**
- Verify VNC server is running
- Check host and port are correct
- Confirm firewall allows VNC port
- Test connection with standalone VNC client

**Poor performance**
- Reduce quality level
- Increase compression level
- Use smaller resolution
- Check network bandwidth

**Keyboard/mouse not working**
- Click in widget to focus
- Disable view-only mode
- Check browser keyboard permissions
- Try different browser

**Frequent disconnects**
- Increase reconnect delay
- Check network stability
- Verify VNC server stability
- Review ping-server logs

## Common VNC Ports

- **5900**: Display :0 (primary display)
- **5901**: Display :1
- **5902**: Display :2
- (Pattern continues: 5900 + display number)
