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
 * Just drop a new .ts file in src/widgets/ with an `export const widget` object.
 * It will be auto-discovered — no manual registration needed.
 */

// Auto-discover all widget modules via Vite's import.meta.glob (lazy by default)
const rawModules = import.meta.glob('../widgets/*.ts') as Record<string, () => Promise<any>>;
const widgetModules: Record<string, () => Promise<any>> = {};
for (const [path, loader] of Object.entries(rawModules)) {
  const name = path.replace('../widgets/', '').replace('.ts', '');
  if (name !== 'timezones') {
    widgetModules[name] = loader;
  }
}

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
   // console.log(`📦 Loading widget module: ${type}`);
    const module = await loader();
    if (module.widget) {
      registerWidget(module.widget);
      loadedWidgets.add(type);
     // console.log(`✅ Widget registered: ${type}`);
    } else {
      console.error(`❌ Widget module loaded but no 'widget' export found for type: ${type}`);
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
