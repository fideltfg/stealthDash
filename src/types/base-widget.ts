import type { Widget } from './types';

export interface WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void;
  configure?(widget: Widget): void; // Optional configuration method
  getHeaderButtons?(widget: Widget): HTMLElement[]; // Optional method to provide custom header buttons
}

// Plugin interface for self-registering widgets
export interface WidgetPlugin {
  type: string;
  name: string;
  icon: string;
  description?: string;
  renderer: WidgetRenderer;
  defaultSize?: { w: number; h: number };
  defaultContent?: any;
  hasSettings?: boolean; // Whether to show settings button
}

// Global widget registry
const widgetRegistry = new Map<string, WidgetPlugin>();

// Register a widget plugin
export function registerWidget(plugin: WidgetPlugin): void {
  widgetRegistry.set(plugin.type, plugin);
  //console.log(`✅ Registered widget: ${plugin.type} (${plugin.name})`);
}

// Get a specific widget plugin
export function getWidgetPlugin(type: string): WidgetPlugin | undefined {
  return widgetRegistry.get(type);
}

// Get the renderer for a widget type
export function getWidgetRenderer(type: string): WidgetRenderer | undefined {
  return widgetRegistry.get(type)?.renderer;
}

// Get all registered widget plugins
export function getAllWidgetPlugins(): WidgetPlugin[] {
  return Array.from(widgetRegistry.values());
}

// Get all registered widget types
export function getRegisteredWidgetTypes(): string[] {
  return Array.from(widgetRegistry.keys());
}
