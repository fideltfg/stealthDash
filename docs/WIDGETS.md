# Complete Widget Guide

Documentation for dashboard widgets including configuration, setup, and troubleshooting.

## Table of Contents

- [Overview](#overview)
- [Core Widgets](#core-widgets)
  - [Text Widget](#text-widget)
  - [Image Widget](#image-widget)
  - [Embed Widget](#embed-widget)
- [Monitoring Widgets](#monitoring-widgets)
  - [Uptime Widget](#uptime-widget)
  - [Clock Widget](#clock-widget)
  - [Timezones Widget](#timezones-widget)
  - [UniFi Protect Widget](#unifi-protect-widget)
  - [UniFi Environmental Sensors Widget](#unifi-environmental-sensors-widget)
- [Integration Widgets](#integration-widgets)
  - [ChatGPT Widget](#chatgpt-widget)
  - [Weather Widget](#weather-widget)
  - [RSS Feed Widget](#rss-feed-widget)
  - [Google Calendar Widget](#google-calendar-widget)
  - [Home Assistant Widget](#home-assistant-widget)
  - [Pi-hole Widget](#pi-hole-widget)
  - [UniFi Widget](#unifi-widget)
  - [Docker Widget](#docker-widget)
- [Specialized Widgets](#specialized-widgets)
  - [Environment Canada Widget](#environment-canada-widget)
  - [MTN XML Widget](#mtn-xml-widget)
  - [Comet P8541 Widget](#comet-p8541-widget)
- [Widget Development](#widget-development)
- [General Tips](#general-tips)

---

## Overview

The dashboard ships with anumber of widget types, each designed for specific purposes. Widgets are dynamically loaded, theme-aware, and fully configurable.

---

## Core Widgets

### Text Widget

Simple text editor with markdown support.

**Configuration:**
1. Add widget to dashboard
2. Click in widget to start typing
3. Supports markdown formatting
4. Auto-saves as you type

**Features:**
- Real-time editing
- Markdown support
- Auto-save
- Transparent background
- Theme-aware text color

**Use Cases:**
- Quick notes
- Task lists
- Reminders
- Documentation snippets
- Formatted text display

---

### Image Widget

Display images from URLs with various fit modes.

**Configuration:**
1. Click "Set Image URL" in widget
2. Enter image URL
3. Choose object-fit mode:
   - **Contain**: Image fits within bounds (default)
   - **Cover**: Image fills widget, may crop
4. Optional: Add alt text for accessibility

**Supported Formats:**
- JPG/JPEG
- PNG
- GIF
- WebP
- SVG

**Example URLs:**
```
https://example.com/image.jpg
https://picsum.photos/400/300
```

---

### Embed Widget

Embed external websites in sandboxed iframe.

**Configuration:**
1. Click "Set URL" in widget
2. Enter website URL
3. Widget loads content

**Security:**
- Sandboxed iframe for safety
- Some sites block embedding (X-Frame-Options)
- Click-to-activate reduces load

**Supported:**
- Most public websites
- YouTube embeds
- Google Maps
- Documentation pages

---

## Monitoring Widgets

### Uptime Widget

Monitor network connectivity with real-time ping.

**Features:**
- Multiple target monitoring
- Latency graphs
- Success/failure statistics
- Historical data
- Configurable intervals

**Configuration:**
1. Add widget to dashboard
2. Click settings icon
3. Add monitored targets:
   - Name: `Google DNS`
   - Host: `8.8.8.8` or `google.com`
   - Interval: `60` seconds (default)
4. View real-time ping status

**Targets Examples:**
```
Name: Primary Router
Host: 192.168.1.1
Interval: 30

Name: Google
Host: google.com
Interval: 60

Name: Cloudflare DNS
Host: 1.1.1.1
Interval: 60
```

**Display Modes:**
- **Table**: List of all targets with status
- **Graph**: Latency over time
- **Gauge**: Current latency visualization

**Requirements:**
- Ping server must be running
- Targets must be reachable from server

---

### Clock Widget

Display current time with multiple formats.

**Configuration:**
1. Add widget
2. Click settings
3. Choose options:
   - **Format**: 12-hour or 24-hour
   - **Display**: Digital or Analog
   - **Show Seconds**: On/Off
   - **Show Date**: On/Off

**Customization:**
- Font size
- Colors
- Timezone (uses browser timezone by default)

---

### Timezones Widget

Display multiple timezone clocks simultaneously.

**Configuration:**
1. Add widget
2. Click "Add Timezone"
3. Search for city or timezone
4. Repeat for multiple locations

**Example Timezones:**
```
America/New_York (EST)
Europe/London (GMT)
Asia/Tokyo (JST)
Australia/Sydney (AEST)
```

**Features:**
- Add unlimited timezones
- Real-time updates
- Shows offset from local time
- Day/night indicator

---

## Integration Widgets

### ChatGPT Widget

Direct integration with OpenAI's ChatGPT API.

**Requirements:**
- OpenAI API key
- Stored in Credential Manager

**Setup:**
1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Store in Credential Manager:
   - Name: `openai_api_key`
   - Value: `sk-...your-key...`
3. Add ChatGPT widget
4. Select credential from dropdown
5. Choose model (gpt-3.5-turbo, gpt-4, etc.)

**Configuration:**
- **Model**: GPT-3.5 Turbo, GPT-4, GPT-4 Turbo
- **Temperature**: 0.0 - 2.0 (creativity)
- **Max Tokens**: Response length limit

**Usage:**
- Type message in input field
- Press Enter or click Send
- View response in chat history
- Conversation persists in widget

**Note:** API usage incurs costs on your OpenAI account.

---

### Weather Widget

Display current weather and forecast.

**Requirements:**
- Weather API key (OpenWeatherMap, WeatherAPI, etc.)
- Location coordinates or city name

**Setup:**
1. Get API key from weather provider
2. Store in Credential Manager
3. Add widget
4. Configure:
   - API Key (from credentials)
   - Location: `New York, US` or `40.7128,-74.0060`
   - Units: Metric or Imperial
   - Update interval

**Display:**
- Current temperature
- Conditions (sunny, cloudy, etc.)
- Humidity
- Wind speed
- 5-day forecast

---

### RSS Feed Widget

Display RSS/Atom feed entries.

**Configuration:**
1. Add widget
2. Enter RSS feed URL
3. Set update interval (minutes)
4. Choose number of items to display

**Example Feeds:**
```
https://news.ycombinator.com/rss
https://www.reddit.com/r/programming/.rss
https://github.com/trending.atom
```

**Features:**
- Auto-refresh
- Clickable links
- Timestamps
- Excerpt display

---

### Google Calendar Widget

View upcoming calendar events.

**Requirements:**
- Google Calendar API credentials
- OAuth 2.0 setup

**Setup:**
1. Enable Google Calendar API in Google Cloud Console
2. Create OAuth 2.0 credentials
3. Store credentials in Credential Manager
4. Add widget
5. Authorize access
6. Select calendars to display

**Display:**
- Next 10 events
- Event time and title
- Color coding by calendar
- Refreshes every 15 minutes

---

### Home Assistant Widget

Display sensor data from Home Assistant.

**Requirements:**
- Home Assistant instance
- Long-lived access token

**Setup:**
1. In Home Assistant, create long-lived token:
   - Profile → Security → Long-Lived Access Tokens
2. Store in Credential Manager:
   - Name: `homeassistant_token`
   - Value: `your-token`
3. Add widget
4. Configure:
   - Home Assistant URL: `http://homeassistant.local:8123`
   - Token: Select from credentials
   - Entity IDs to display

**Example Entities:**
```
sensor.living_room_temperature
sensor.bedroom_humidity
light.kitchen
switch.fan
```

**Display:**
- Entity state and value
- Last updated time
- Unit of measurement
- Icon (if available)

---

### Pi-hole Widget

Display Pi-hole DNS blocking statistics.

**Requirements:**
- Pi-hole instance
- API key (optional but recommended)

**Setup:**
1. Get API key from Pi-hole:
   - Settings → API → Show API token
2. Store in Credential Manager
3. Add widget
4. Configure:
   - Pi-hole URL: `http://pi.hole/admin`
   - API Key: Select from credentials

**Display:**
- Total queries (24h)
- Queries blocked (24h)
- Percent blocked
- Domains on blocklist
- Status (enabled/disabled)

**Actions:**
- Enable/disable blocking
- Refresh statistics

---

### UniFi Widget

Monitor UniFi network devices and clients.

**Requirements:**
- UniFi Controller
- Controller credentials

**Setup:**
1. Store credentials in Credential Manager:
   - Name: `unifi_username`
   - Value: `admin`
   - Name: `unifi_password`
   - Value: `your-password`
2. Add widget
3. Configure:
   - Controller URL: `https://unifi.local:8443`
   - Username: Select credential
   - Password: Select credential
   - Site: `default`

**Display:**
- Connected clients count
- Device status (online/offline)
- Uplink status
- WAN IP
- Network traffic

---

### Docker Widget

Monitor and manage Docker containers directly from your dashboard.

**Requirements:**
- Docker host accessible from dashboard
- Docker credentials (if remote host)

**Setup:**
1. Add Docker widget to dashboard
2. Click settings icon
3. Configure:
   - **Docker Host**: Leave empty for local Docker, or provide remote host URL
   - **Credentials**: Select Docker credentials if connecting remotely
   - **Show All**: Toggle to show all containers or only running ones
   - **Refresh Interval**: Auto-update frequency (default: 10 seconds)

**Display:**
- Container name and status (running/stopped/paused)
- Image name and tag
- Uptime/status duration
- Port mappings
- Container actions (start/stop/restart/remove)

**Features:**
- Real-time container status
- Start/stop/restart containers
- Remove containers
- View container details
- Color-coded status indicators (green=running, red=stopped, yellow=paused)
- Quick actions with confirmation dialogs

**Container Actions:**
- **Start**: Start a stopped container
- **Stop**: Gracefully stop a running container
- **Restart**: Restart a container
- **Remove**: Delete a container (requires confirmation)

**Requirements:**
- Docker Engine accessible from ping-server
- Proper permissions to manage containers
- For remote Docker: TLS certificates or credentials configured

**Troubleshooting:**
- **"Cannot connect to Docker"**: Verify Docker is running and accessible
- **Permission denied**: Ensure user has Docker permissions
- **Actions not working**: Check Docker socket permissions
- **Remote host not connecting**: Verify host URL and credentials

---

## Specialized Widgets

### Environment Canada Widget

Canadian weather data from Environment Canada.

**Configuration:**
1. Add widget
2. Select province
3. Select city/location
4. Choose language (English/French)

**Features:**
- Current conditions
- Hourly forecast
- Weather warnings/alerts
- No API key required

**Available Locations:**
- All major Canadian cities
- Many smaller towns
- Automatic updates

---

### MTN XML Widget

Parse and display XML data with XPath queries.

**Configuration:**
1. Add widget
2. Enter XML data source URL
3. Configure XPath queries:
   - Path: `//item/title`
   - Label: `Title`
4. Set refresh interval

**Example:**
```xml
XPath: //weather/temperature
Label: Temperature

XPath: //weather/condition
Label: Conditions
```

**Use Cases:**
- Custom API responses
- XML feeds
- SOAP web services
- Legacy data sources

---

### Comet P8541 Widget

Display data from Comet P8541 temperature/humidity sensors.

**Requirements:**
- Comet P8541 sensor
- Network access to sensor

**Configuration:**
1. Add widget
2. Enter sensor IP address
3. Choose display mode:
   - Gauge (visual)
   - Text (numeric)
4. Set update interval

**Display:**
- Temperature (°C or °F)
- Humidity (%)
- Dewpoint
- Alarm status

**Features:**
- Real-time updates
- Alarm notifications
- Historical graphs
- Multi-sensor support

---

## UniFi Protect Widget

A comprehensive widget for displaying UniFi Protect camera feeds and motion detection events.

### Features

#### Camera Display
- **Live Camera Grid**: View all or selected cameras in a responsive grid layout
- **Snapshot View**: Display camera snapshots with automatic refresh
- **Live Streams**: Support for RTSP live streaming (coming soon)
- **Camera Status**: Real-time online/offline status indicators
- **Recording Indicator**: Visual indication when cameras are recording
- **Motion Detection Alert**: Highlights cameras detecting motion

#### Event Detection
- **Smart Detection Events**: View recent motion, person, and vehicle detections
- **Event Thumbnails**: Display captured images from detection events
- **Detection Confidence**: Show confidence scores for smart detections
- **Event Timeline**: Chronological list of recent events
- **Camera Association**: Each event shows which camera detected it
- **Time Stamps**: Display when events occurred with "time ago" format

#### Display Modes
1. **Both** (default): Shows cameras and recent detections together
2. **Cameras Only**: Focus on camera grid view
3. **Detections Only**: Focus on event list

#### View Modes
1. **Snapshots**: Display static camera images (refreshed automatically)
2. **Streams**: Live video feeds (requires RTSP support)
3. **Both**: Show both options where available

### Setup

#### Prerequisites
- UniFi Protect Console (Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR)
- Local admin account credentials
- Network access to the Protect console

#### Configuration Steps

1. **Create Credentials**
   - Go to Credentials Manager in your dashboard
   - Click Add New Credential
   - Fill in:
     - Name: "UniFi Protect Console"
     - Service Type: "UniFi Protect" or "Basic"
     - Username: Local admin username
     - Password: Local admin password
   - Save the credential

2. **Add Widget**
   - Click the + button or use Add Widget menu
   - Select UniFi Protect from the widget picker

3. **Configure Widget**
   - Console URL: Your UniFi Protect URL (e.g., `https://192.168.1.1`)
   - Credentials: Select the credential you created
   - Display Mode: Choose how to display content
   - View Mode: Choose camera view type
   - Max Detections: Number of recent events to show (default: 10)
   - Refresh Interval: Auto-refresh time in seconds (default: 30)

### Configuration Options

**Basic Settings:**
- UniFi Protect Console URL (HTTPS required)
- Credentials (from Credential Manager)

**Display Settings:**
- Display Mode: Both / Cameras Only / Detections Only
- View Mode: Snapshots / Streams / Both

**Event Settings:**
- Maximum Detections: 1-50 (default: 10)
- Refresh Interval: 5-300 seconds (default: 30)

### Troubleshooting

**"No credential configured"**
- Ensure you've created a credential in the Credentials Manager
- Select the credential in the widget configuration

**"Failed to load UniFi Protect data"**
- Verify the console URL is correct and accessible
- Check that credentials are valid
- Ensure the account has admin privileges
- Check network connectivity

**"Snapshot unavailable"**
- Camera might be offline
- Check camera connectivity in Protect console

**Events not showing**
- No recent detections in the last 24 hours
- Check event settings in Protect console
- Verify motion detection is enabled

### Known Limitations

1. RTSP stream support is planned for future release
2. UI for selecting specific cameras coming soon
3. Advanced filtering by detection type coming soon
4. Event video clips not yet supported (thumbnails only)
5. PTZ controls not implemented yet

---

## UniFi Environmental Sensors Widget

Monitor temperature, humidity, and light levels from UniFi USL-Environmental devices.

### Overview

Connects to UniFi Protect console and displays real-time environmental data from USL-Environmental devices with a clean, card-based interface.

### Features

#### Sensor Monitoring
- **Temperature**: Display in Celsius, Fahrenheit, or both
- **Humidity**: Show relative humidity percentage
- **Light Level**: Display ambient light in lux
- **Connection Status**: Real-time device status indicators
- **Last Seen**: Timestamp of last sensor update

#### Customization
- **Selective Display**: Choose which metrics to show
- **Temperature Units**: Pick your preferred temperature display
- **Auto-refresh**: Configurable refresh intervals (5-300 seconds)
- **Multi-sensor**: Display multiple sensors in a responsive grid

#### Visual Design
- **Card Layout**: Each sensor in its own card
- **Status Indicators**: Color-coded connection status
- **Responsive Grid**: Automatically adjusts to widget size
- **Theme Integration**: Follows dashboard theme colors

### Setup

#### Prerequisites

1. UniFi Protect Console (Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR)
2. USL-Environmental Device (adopted and connected in UniFi Protect)
3. Dashboard Credentials (saved in Credentials Manager)

#### Configuration Steps

1. **Create Credentials**
   - Open Credentials Manager in your dashboard
   - Click Add New Credential
   - Configure:
     - Name: "UniFi Protect Console"
     - Service Type: "UniFi" or "Basic"
     - Username: Local admin username
     - Password: Local admin password
   - Save the credential

2. **Add Widget**
   - Click + Add Widget button
   - Select UniFi Environmental Sensors

3. **Configure Widget**
   - Console URL: Your UniFi Protect address (e.g., `https://192.168.1.1`)
   - Credentials: Select the credential you created
   - Temperature Display: Choose Celsius, Fahrenheit, or Both
   - Show Temperature/Humidity/Light: Enable/disable metrics
   - Refresh Interval: Auto-update frequency (default: 30 seconds)
   - Click Save

### Configuration Options

**Basic Settings:**
- Console URL (HTTPS, e.g., `https://192.168.1.1`)
- Credentials (from Credential Manager)

**Display Settings:**
- Temperature Display: Both (°C / °F) / Celsius only / Fahrenheit only
- Show Temperature: Toggle
- Show Humidity: Toggle
- Show Light Level: Toggle

**Performance Settings:**
- Refresh Interval: 5-300 seconds (default: 30)

### Display Layout

Each sensor appears as a card:
```
[Sensor Name]
[Model]

Temperature  [23.5°C / 74.3°F]
Humidity     [45.2%]
Light Level  [125 lux]

Connected  |  2m ago
```

### Troubleshooting

**No Sensors Displayed**
- Verify USL-Environmental devices are adopted in UniFi Protect
- Check device connection status
- Test console URL in browser
- Verify credentials

**"Authentication required" Error**
- Log out and log back in
- Refresh the widget

**"Failed to fetch sensor data" Error**
- Verify console accessibility
- Check network connection
- Restart UniFi Protect service
- Update saved credentials

**Stale Data / Not Updating**
- Click Refresh button manually
- Check browser console for errors
- Try increasing refresh interval
- Save widget configuration again

**Data Shows "-- / --"**
- Sensor may not support that metric
- Sensor initializing
- Wait a few minutes or check in UniFi Protect dashboard

### Best Practices

**Refresh Intervals:**
- Real-time monitoring: 10-30 seconds
- Casual monitoring: 60-120 seconds
- Low bandwidth: 180-300 seconds

**Widget Sizing:**
- Single sensor: 300x350px minimum
- Two sensors: 600x350px minimum
- Three+ sensors: Use full width, adjust height

**Credential Security:**
- Use a dedicated UniFi Protect account
- Limit account to viewer permissions if possible
- Rotate passwords periodically

---

## Widget Development

### Architecture

Widgets use a modular, plugin-like architecture.

#### Structure
```
widgets/
├── widget.ts              # Main widget utilities
├── index.ts               # Widget registry and loader
├── base.ts                # Base interface
├── text.ts                # Text widget
├── image.ts               # Image widget
├── uptime.ts              # Uptime monitoring
└── ...                    # Other widgets
```

### Widget Registry

All widgets are registered in `index.ts`:

```typescript
const widgetModules: Record<string, () => Promise<any>> = {
  'image': () => import('./image'),
  'embed': () => import('./embed'),
  'weather': () => import('./weather'),
  'clock': () => import('./clock'),
  // ... more widgets
};
```

### Widget Renderer Interface

Each widget implements the `WidgetRenderer` interface:

```typescript
export interface WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void;
}
```

### Creating a New Widget

1. **Create widget file** in `src/widgets/types/` (e.g., `chart.ts`)

2. **Implement WidgetRenderer interface:**

```typescript
import type { Widget } from '../types';
import type { WidgetRenderer } from './base';

export class ChartWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    // Your widget rendering logic here
  }
  
  cleanup(): void {
    // Cleanup when widget is removed
  }
}
```

3. **Export widget plugin:**

```typescript
export const widget = {
  type: 'chart',
  name: 'Chart Widget',
  description: 'Display charts and graphs',
  icon: '📊',
  renderer: new ChartWidgetRenderer(),
  defaultSize: { w: 400, h: 300 },
  defaultContent: {},
  hasSettings: true
};
```

4. **Register in `src/widgets/types/index.ts`:**

```typescript
const widgetModules: Record<string, () => Promise<any>> = {
  // ... existing widgets
  'chart': () => import('./chart'),
};
```

5. **Add type to `src/types.ts`:**

```typescript
export type WidgetType = 'text' | 'image' | 'chart' | ...;
```

### Benefits

- **Modularity**: Each widget in its own file
- **Separation of Concerns**: Widget logic is isolated
- **Easy to Extend**: Add widgets without modifying existing code
- **Type Safety**: TypeScript ensures interface compliance
- **Maintainability**: Smaller, focused files
- **Plugin-like**: Add/remove by registering/unregistering

---

## General Tips

### Performance

- Limit update intervals for API widgets (≥60 seconds recommended)
- Use credential manager for API keys
- Disable unused widgets instead of deleting
- Keep widget count reasonable (<20 for best performance)

### Troubleshooting

**Widget Not Updating:**
1. Check API credentials
2. Verify network connectivity
3. Check browser console for errors
4. Increase update interval

**Widget Shows Error:**
1. Verify API key is valid
2. Check service status (external API may be down)
3. Review widget settings
4. Check ping-server logs

**Credential Not Found:**
1. Add credential in Credential Manager
2. Ensure credential name matches exactly
3. Refresh widget settings

### Security Best Practices

- Store all API keys in Credential Manager
- Never share credentials between users
- Use read-only API keys when possible
- Regularly rotate API keys
- Review credential usage in admin panel
- Delete unused credentials

### Customization

All widgets support:
- Custom titles
- Adjustable size
- Position anywhere on canvas
- Z-index control (bring forward/send back)
- Theme-aware styling

---

## Need Help?

- Check main [README.md](./README.md) for setup instructions
- Review [DEPLOYMENT.md](./DEPLOYMENT.md) for production configuration
- Check [PING_SERVER.md](./PING_SERVER.md) for backend API details
- Open issue on GitHub for bugs or feature requests
- Check browser console (F12) for error messages
