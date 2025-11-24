import { registerWidget } from './base-widget';

/**
 * Lazy-loading widget registry
 * 
 * This module implements dynamic widget loading to improve initial page load performance.
 * 
 * HOW IT WORKS:
 * - Widgets are NOT imported/loaded at app startup
 * - Widget modules are loaded dynamically only when needed:
 *   1. When loading a dashboard (loads only widgets in that dashboard)
 *   2. When adding a new widget (loads that specific widget type)
 *   3. When opening the widget picker (loads all widgets for the selection UI)
 * 
 * BENEFITS:
 * - Faster initial page load (no preloading of unused widget code)
 * - Smaller initial JavaScript bundle
 * - Only download what you use
 * - Better user experience, especially on slower connections
 * 
 * ADDING NEW WIDGETS:
 * Just add the widget type to the widgetModules map below with its lazy import.
 */
const widgetModules: Record<string, () => Promise<any>> = {
  'image': () => import('../widgets/image'),
  'embed': () => import('../widgets/embed'),
  'weather': () => import('../widgets/weather'),
  'clock': () => import('../widgets/clock'),
  'rss': () => import('../widgets/rss'),
  'uptime': () => import('../widgets/uptime'),
  'comet-p8541': () => import('../widgets/comet-p8541'),
  'home-assistant': () => import('../widgets/home-assistant'),
  'chatgpt': () => import('../widgets/chatgpt'),
  'mtnxml': () => import('../widgets/mtnxml'),
  'envcanada': () => import('../widgets/envcanada'),
  'pihole': () => import('../widgets/pihole'),
  'google-calendar': () => import('../widgets/google-calendar'),
  'unifi': () => import('../widgets/unifi'),
  'unifi-protect': () => import('../widgets/unifi-protect'),
  'docker': () => import('../widgets/docker'),
};

// Track which widgets have been loaded
const loadedWidgets = new Set<string>();

// Load a specific widget dynamically
export async function loadWidgetModule(type: string): Promise<void> {
  if (loadedWidgets.has(type)) {
    return; // Already loaded
  }

  const loader = widgetModules[type];
  if (!loader) {
    console.warn(`⚠️  Unknown widget type: ${type}`);
    return;
  }

  try {
    const module = await loader();
    if (module.widget) {
      registerWidget(module.widget);
      loadedWidgets.add(type);
     // console.log(`📦 Lazy-loaded widget: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load widget ${type}:`, error);
  }
}

// Load multiple widgets at once
export async function loadWidgetModules(types: string[]): Promise<void> {
  const uniqueTypes = [...new Set(types)]; // Remove duplicates
  const unloadedTypes = uniqueTypes.filter(type => !loadedWidgets.has(type));
  
  if (unloadedTypes.length === 0) {
    return; // All already loaded
  }

  await Promise.all(unloadedTypes.map(type => loadWidgetModule(type)));
}

// Get list of available widget types (without loading them)
export function getAvailableWidgetTypes(): string[] {
  return Object.keys(widgetModules);
}

// Re-export for convenience
export { registerWidget, getWidgetPlugin, getWidgetRenderer, getAllWidgetPlugins, getRegisteredWidgetTypes } from './base-widget';
export type { WidgetPlugin, WidgetRenderer } from './base-widget';
