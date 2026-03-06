import type { Widget, MultiDashboardState } from '../types/types';
import { getWidgetPlugin } from '../types/base-widget';

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
 * 
 * Each widget declares its own allowedFields in its WidgetPlugin export.
 */

/**
 * Sanitize a single widget's content
 */
function sanitizeWidgetContent(widget: Widget): any {
  const plugin = getWidgetPlugin(widget.type);
  const allowedFields = plugin?.allowedFields;

  // If widget type has no allowedFields, return empty object (safest approach)
  if (!allowedFields) {
    console.warn(`Widget type '${widget.type}' has no allowedFields - saving with empty content for safety`);
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
    dashboards: state.dashboards.map(dashboard => {
      // Strip zoom and viewport from the state before saving to server.
      // These are view-only preferences stored locally per tab.
      const { zoom, viewport, ...restState } = dashboard.state;
      return {
        ...dashboard,
        state: {
          ...restState,
          zoom: 1.0,
          viewport: { x: 0, y: 0 },
          widgets: dashboard.state.widgets.map(widget => sanitizeWidget(widget))
        }
      };
    })
  };
}
