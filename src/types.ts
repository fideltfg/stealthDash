// Core type definitions for the dashboard

export type WidgetType = 'text' | 'image' | 'data' | 'embed' | 'weather' | 'clock' | 'rss' | 'uptime';
export type Theme = 'light' | 'dark' | 'system';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface AutoSize {
  width: boolean;
  height: boolean;
}

export interface WidgetMeta {
  title?: string;
  createdAt: number;
  updatedAt: number;
}

// Widget content types
export interface TextContent {
  markdown: string;
}

export interface ImageContent {
  src: string;
  objectFit: 'contain' | 'cover';
  alt?: string;
}

export interface DataContent {
  json: unknown;
}

export interface EmbedContent {
  url: string;
  sandbox?: string[];
}

export interface WeatherContent {
  location: string;
  apiKey?: string;
}

export interface ClockContent {
  timezone: string;
  format24h?: boolean;
  showTimezone?: boolean;
}

export interface RssContent {
  feedUrl: string;
  maxItems?: number;
  refreshInterval?: number;
}

export interface UptimeContent {
  target: string;
  interval?: number; // seconds between pings
  timeout?: number; // milliseconds
}

export type WidgetContent = TextContent | ImageContent | DataContent | EmbedContent | WeatherContent | ClockContent | RssContent | UptimeContent;

export interface Widget {
  id: string;
  type: WidgetType;
  position: Vec2;
  size: Size;
  autoSize: AutoSize;
  z: number;
  content: WidgetContent;
  meta?: WidgetMeta;
}

export interface Viewport {
  x: number;
  y: number;
}

export interface DashboardState {
  widgets: Widget[];
  theme: Theme;
  grid: number;
  zoom: number;
  viewport: Viewport;
  version: number;
}

export interface HistoryState {
  past: DashboardState[];
  future: DashboardState[];
}

export const MIN_WIDGET_SIZE = { w: 100, h: 60 };
export const DEFAULT_WIDGET_SIZE = { w: 600, h: 400 };
export const DEFAULT_GRID_SIZE = 8;
export const DEFAULT_ZOOM = 1.0;
