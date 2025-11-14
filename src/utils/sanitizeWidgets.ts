import type { Widget, MultiDashboardState } from '../types/types';

/**
 * Sanitizes widget content before saving to remove sensitive credentials and runtime data.
 * 
 * IMPORTANT: All widgets should use the credential management system (credentialId) 
 * instead of storing credentials directly in widget content.
 * 
 * What gets removed:
 * - Direct credentials (apiKey, token, password) - Use credentialId instead
 * - Cached API responses (cachedData, data, stats)
 * - Conversation history (messages)
 * - Timestamps (lastUpdated, lastFetched)
 * - Ephemeral state (loading, error states)
 * 
 * What gets kept:
 * - User configuration (URLs, hosts, ports, settings)
 * - Credential references (credentialId - reference to saved credential)
 * - Display preferences (modes, formats, enabled features)
 */

// Define allowed fields for each widget type (configuration only, no runtime data or direct credentials)
const ALLOWED_WIDGET_FIELDS: Record<string, string[]> = {
  'text': ['markdown'],
  'image': ['src', 'objectFit', 'alt'],
  'embed': ['url', 'sandbox'],
  'weather': ['location'], // Remove apiKey - widgets should use credentialId
  'clock': ['timezone', 'format24h', 'showTimezone'],
  'rss': ['feedUrl', 'maxItems', 'refreshInterval'],
  'uptime': ['target', 'interval', 'timeout'],
  'chatgpt': ['credentialId', 'model', 'systemPrompt'], // Remove apiKey and messages - use credentialId
  'home-assistant': ['url', 'credentialId', 'entities', 'refreshInterval'], // Remove token - use credentialId
  'comet-p8541': ['host', 'port', 'unitId', 'refreshInterval', 'enabledChannels', 'channelNames', 'temperatureUnit', 'displayMode', 'showAlarms', 'deviceName'],
  'mtnxml': ['feedUrl', 'refreshInterval', 'displayMode', 'showLifts', 'showTrails', 'showSnow', 'showWeather'],
  'envcanada': ['latitude', 'longitude', 'language', 'refreshInterval'],
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
