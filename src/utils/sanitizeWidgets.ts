import type { Widget, MultiDashboardState } from '../types/types';

/**
 * Sanitizes widget content before saving to remove sensitive data and runtime data.
 * Only configuration data needed to recreate the widget is kept.
 */

// Define allowed fields for each widget type (configuration only, no runtime data)
const ALLOWED_WIDGET_FIELDS: Record<string, string[]> = {
  'text': ['markdown'],
  'image': ['src', 'objectFit', 'alt'],
  'embed': ['url', 'sandbox'],
  'weather': ['location'], // Remove apiKey - widgets should use credentials
  'clock': ['timezone', 'format24h', 'showTimezone'],
  'rss': ['feedUrl', 'maxItems', 'refreshInterval'],
  'uptime': ['target', 'interval', 'timeout'],
  'chatgpt': ['model', 'systemPrompt'], // Remove apiKey and messages
  'home-assistant': ['url', 'entities', 'refreshInterval'], // Remove token
  'comet-p8541': ['host', 'port', 'unitId', 'refreshInterval', 'enabledChannels', 'channelNames', 'temperatureUnit', 'displayMode', 'showAlarms', 'deviceName'],
  'mtnxml': ['host', 'refreshInterval', 'displayMode'],
  'envcanada': ['provinceCode', 'cityCode', 'refreshInterval', 'displayMode'],
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
