# Widget Documentation Index

Complete documentation for all dashboard widgets. Each widget has its own detailed documentation file with setup instructions, configuration options, and troubleshooting guidance.

## Overview

The dashboard ships with a comprehensive collection of widgets, each designed for specific purposes. Widgets are dynamically loaded, theme-aware, and fully configurable. This index provides quick access to individual widget documentation.

---

## Core Widgets

Basic widgets for content display and organization.

- **[Text Widget](widgets/TEXT_WIDGET.md)** - Simple text entry widget for notes
- **[Image Widget](widgets/IMAGE_WIDGET.md)** - Display images from URLs with various fit modes
- **[Embed Widget](widgets/EMBED_WIDGET.md)** - Embed external websites in sandboxed iframe

---

## Monitoring Widgets

Widgets for system and network monitoring.

- **[Uptime Widget](widgets/UPTIME_WIDGET.md)** - Monitor network connectivity with real-time ping
- **[Clock Widget](widgets/CLOCK_WIDGET.md)** - Display current time with timezone support
- **[Timezones Widget](widgets/TIMEZONES_WIDGET.md)** - Display multiple timezone clocks simultaneously
- **[Glances Widget](widgets/GLANCES_WIDGET.md)** - Comprehensive system monitoring (CPU, memory, disk, network, sensors)
- **[Speedtest Widget](widgets/SPEEDTEST_WIDGET.md)** - Internet speed testing with historical charts

---

## Integration Widgets

Widgets that integrate with external services and APIs.

- **[Weather Widget](widgets/WEATHER_WIDGET.md)** - Display current weather and forecast (no API key required)
- **[Weather Dash Widget](widgets/WEATHER_DASH_WIDGET.md)** - Weather dashboard using Open-Meteo API with coordinates
- **[RSS Feed Widget](widgets/RSS_WIDGET.md)** - Display RSS/Atom feed entries
- **[Google Calendar Widget](widgets/GOOGLE_CALENDAR_WIDGET.md)** - View upcoming calendar events
- **[Gmail Widget](widgets/GMAIL_WIDGET.md)** - Display and manage Gmail inbox ([Backend API Setup](GMAIL_WIDGET_API.md))
- **[Home Assistant Widget](widgets/HOME_ASSISTANT_WIDGET.md)** - Display sensor data from Home Assistant
- **[Pi-hole Widget](widgets/PIHOLE_WIDGET.md)** - Display Pi-hole DNS blocking statistics
- **[Docker Widget](widgets/DOCKER_WIDGET.md)** - Monitor and manage Docker containers

---

## Smart Home & IoT Widgets

Widgets for smart home and IoT device integration.

- **[UniFi Widget](widgets/UNIFI_WIDGET.md)** - Monitor UniFi network devices and clients
- **[UniFi Protect Widget](widgets/UNIFI_PROTECT_WIDGET.md)** - Display camera feeds and motion detection events
- **[UniFi Environmental Sensors Widget](widgets/UNIFI_SENSOR_WIDGET.md)** - Monitor temperature, humidity, and light levels ([API Details](UNIFI_SENSOR_API.md))
- **[Sensi Thermostat Widget](widgets/SENSI_WIDGET.md)** - Monitor and control Sensi WiFi thermostats
- **[Comet P8541 Widget](widgets/COMET_P8541_WIDGET.md)** - Display data from Comet P8541 temperature/humidity sensors

---

## Specialized Widgets

Widgets for specific use cases and legacy systems.

- **[Environment Canada Widget](widgets/ENVCANADA_WIDGET.md)** - Canadian weather data from Environment Canada
- **[MTN XML Widget](widgets/MTNXML_WIDGET.md)** - Display ski resort conditions from MTNXML feeds
- **[Tasks Widget](widgets/TASKS_WIDGET.md)** - Task management with priorities and due dates
- **[VNC Widget](widgets/VNC_WIDGET.md)** - Remote desktop access using VNC protocol

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
