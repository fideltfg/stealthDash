# Widget Plugin Architecture

This directory contains a modular, plugin-like architecture for dashboard widgets.

## Structure

```
widgets/
├── widget.ts              # Main widget utilities and orchestration
└── types/                 # Widget type implementations
    ├── index.ts           # Widget registry and plugin loader
    ├── base.ts            # Base interface for widget renderers
    ├── text.ts            # Text widget renderer
    ├── image.ts           # Image widget renderer
    ├── data.ts            # JSON data widget renderer
    ├── embed.ts           # Embed (iframe) widget renderer
    ├── weather.ts         # Weather widget renderer
    ├── clock.ts           # Clock widget renderer
    └── timezones.ts       # IANA timezone database
```

## How It Works

### Widget Registry

All widget renderers are registered in `types/index.ts`:

```typescript
const widgetRenderers: Record<WidgetType, WidgetRenderer> = {
  text: new TextWidgetRenderer(),
  image: new ImageWidgetRenderer(),
  data: new DataWidgetRenderer(),
  embed: new EmbedWidgetRenderer(),
  weather: new WeatherWidgetRenderer(),
  clock: new ClockWidgetRenderer(),
};
```

### Widget Renderer Interface

Each widget type implements the `WidgetRenderer` interface from `base.ts`:

```typescript
export interface WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void;
}
```

### Adding a New Widget Type

1. Create a new file in `types/` (e.g., `chart.ts`)
2. Implement the `WidgetRenderer` interface:

```typescript
import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export class ChartWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    // Your widget rendering logic here
  }
}
```

3. Register it in `types/index.ts`:

```typescript
import { ChartWidgetRenderer } from './chart';

const widgetRenderers: Record<WidgetType, WidgetRenderer> = {
  // ... existing widgets
  chart: new ChartWidgetRenderer(),
};
```

4. Add the type to `src/types.ts`:

```typescript
export type WidgetType = 'text' | 'image' | 'data' | 'embed' | 'weather' | 'clock' | 'chart';
```

## Benefits

- **Modularity**: Each widget type is in its own file
- **Separation of Concerns**: Widget logic is isolated
- **Easy to Extend**: Add new widgets without modifying existing code
- **Type Safety**: TypeScript ensures all widgets implement the interface
- **Maintainability**: Smaller, focused files are easier to maintain
- **Plugin-like**: Widgets can be added/removed by simply registering/unregistering them

## Widget Types

### Text Widget
Markdown-enabled text editor with live editing.

### Image Widget
Displays images from URLs with configurable object-fit.

### Data Widget
JSON data viewer/editor with syntax validation.

### Embed Widget
Embeds external websites via iframe with sandbox controls.

### Weather Widget  
Shows current weather and 5-day forecast using Open-Meteo API.

### Clock Widget
Displays time in any timezone with configurable format (12h/24h) and timezone visibility.

### RSS Feed Widget
Displays RSS/Atom feeds with auto-refresh capability. Features include:
- Configurable number of items to display
- Auto-refresh at specified intervals
- Clickable items that open in new tabs
- Shows title, date, author, and description for each item
- Uses RSS2JSON service as a CORS proxy

### Uptime Monitor Widget
Monitors target uptime by pinging a URL or IP address. Features include:
- Visual bar chart showing last 20 ping results
- Color-coded bars (green < 100ms, yellow < 300ms, orange < 1s, red > 1s or timeout)
- Real-time statistics (uptime %, average response time, sample count)
- Configurable ping interval (5-300 seconds)
- Configurable timeout (1-30 seconds)
- Hover tooltips showing timestamp and response time
- Uses HTTP HEAD requests to check availability
