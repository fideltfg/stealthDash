import type { Widget, MultiDashboardState } from '../types/types';

/**
 * Sanitizes widget content before saving to remove runtime data and cached responses.
 * Configuration data (including user-entered credentials) is kept so widgets work after reload.
 * 
 * What gets removed:
 * - Cached API responses (cachedData, data, stats)
 * - Conversation history (messages)
 * - Timestamps (lastUpdated, lastFetched)
 * - Ephemeral state (loading, error states)
 * 
 * What gets kept:
 * - User configuration (URLs, hosts, ports, settings)
 * - User-entered credentials (tokens, API keys stored in widget config)
 * - Display preferences (modes, formats, enabled features)
 */

// Define allowed fields for each widget type (configuration only, no runtime data)
const ALLOWED_WIDGET_FIELDS: Record<string, string[]> = {
  'text': ['markdown'],
  'image': ['src', 'objectFit', 'alt'],
  'embed': ['url', 'sandbox'],
  'weather': ['location', 'apiKey'], // Keep user-entered API key
  'clock': ['timezone', 'format24h', 'showTimezone'],
  'rss': ['feedUrl', 'maxItems', 'refreshInterval'],
  'uptime': ['target', 'interval', 'timeout'],
  'chatgpt': ['apiKey', 'model', 'systemPrompt'], // Keep apiKey, remove messages (conversation history)
  'home-assistant': ['url', 'token', 'entities', 'refreshInterval'], // Keep token and URL - user configuration
  'comet-p8541': ['host', 'port', 'unitId', 'refreshInterval', 'enabledChannels', 'channelNames', 'temperatureUnit', 'displayMode', 'showAlarms', 'deviceName'],
  'mtnxml': ['feedUrl', 'refreshInterval', 'displayMode', 'showLifts', 'showTrails', 'showSnow', 'showWeather'], // Remove cachedData only
  'envcanada': ['latitude', 'longitude', 'language', 'refreshInterval'], // Remove cachedData only
  'pihole': ['host', 'credentialId', 'displayMode', 'refreshInterval', 'showCharts'],
  'unifi': ['host', 'credentialId', 'site', 'displayMode', 'refreshInterval', 'showClients', 'showAlerts'],
  'google-calendar': ['credentialId', 'displayMode', 'maxEvents', 'daysAhead', 'refreshInterval', 'showTime'],
};

/**
 * Sanitize a single widget's content
 */
function sanitizeWidgetContent(widget: Widget): any {
  const allowedFields = ALLOWED_WIDGET_FIELDS[widget.type];
  
  // If widget type not in allowlist, return empty object (safest approach)
  if (!allowedFields) {
    console.warn(`Unknown widget type '${widget.type}' - saving with empty content for safety`);
    return {};
  }
  
  // Create sanitized content with only allowed fields
  const sanitized: any = {};
  const content = widget.content as any;
  
  for (const field of allowedFields) {
    if (content && content[field] !== undefined) {
      sanitized[field] = content[field];
    }
  }
  
  return sanitized;
}

/**
 * Sanitize a widget by removing sensitive and runtime data
 */
export function sanitizeWidget(widget: Widget): Widget {
  return {
    id: widget.id,
    type: widget.type,
    position: widget.position,
    size: widget.size,
    autoSize: widget.autoSize,
    z: widget.z,
    content: sanitizeWidgetContent(widget),
    meta: widget.meta
  };
}

/**
 * Sanitize all widgets in a dashboard state
 */
export function sanitizeDashboardState(state: MultiDashboardState): MultiDashboardState {
  return {
    ...state,
    dashboards: state.dashboards.map(dashboard => ({
      ...dashboard,
      state: {
        ...dashboard.state,
        widgets: dashboard.state.widgets.map(widget => sanitizeWidget(widget))
      }
    }))
  };
}
