/**
 * Widget Metadata Registry
 * 
 * Loads widget metadata from a JSON file generated at container startup
 * by scripts/generate-widget-metadata.js. This avoids duplicating metadata
 * and means adding a new widget only requires creating one file in src/widgets/.
 */

export interface WidgetMetadataEntry {
  type: string;
  name: string;
  icon: string;
  description: string;
  defaultSize: { w: number; h: number };
  defaultContent: Record<string, any>;
  hasSettings: boolean;
}

let cachedMetadata: WidgetMetadataEntry[] | null = null;

export async function loadWidgetMetadata(): Promise<WidgetMetadataEntry[]> {
  if (cachedMetadata) return cachedMetadata;

  const response = await fetch('/widget-metadata.json');
  if (!response.ok) {
    console.error('Failed to load widget-metadata.json:', response.status);
    return [];
  }
  cachedMetadata = await response.json();
  return cachedMetadata!;
}
