// Core type definitions for the dashboard
import type { Theme } from '../themes';

// Dynamic widget type - widgets register themselves via the plugin system
export type WidgetType = string;
export type { Theme };
export type BackgroundPattern = 'grid' | 'dots' | 'lines' | 'solid' | 'image' | 'video';

export interface BackgroundSettings {
  url?: string;
  opacity?: number; // 0-100
  blur?: number; // 0-10
  brightness?: number; // 0-200
  objectFit?: 'cover' | 'contain' | 'fill';
  playbackRate?: number; // for video (0.25-2.0)
  loop?: boolean; // for video
  muted?: boolean; // for video
}

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

export interface CometP8541Content {
  host: string;
  port?: number;
  unitId?: number;
  refreshInterval?: number;
  enabledChannels?: {
    temp1?: boolean;
    temp2?: boolean;
    temp3?: boolean;
    temp4?: boolean;
    humidity?: boolean;
    pressure?: boolean;
    dewPoint?: boolean;
  };
  temperatureUnit?: 'C' | 'F';
  showAlarms?: boolean;
}

export interface WeatherDashContent {
  latitude: number;
  longitude: number;
  timezone: string;
  locationName: string;
}

export interface SystemResourcesContent {
  host?: string;
  credentialId?: number;
  refreshInterval?: number;
  displayMode?: 'full' | 'compact';
  showPerCpu?: boolean;
  showContainers?: boolean;
  showDiskIO?: boolean;
  showAllFs?: boolean;
  showAllNet?: boolean;
}

export interface TasksContent {
  mode?: 'todoist' | 'local';
  todoistCredentialId?: number;
  todoistFilter?: string;
  refreshInterval?: number;
  sortBy?: 'priority' | 'due' | 'created';
  showCompleted?: boolean;
}

export interface SpeedtestContent {
  host?: string;
  credentialId?: number;
  refreshInterval?: number;
  showChart?: boolean;
  historyDays?: number;
}

export type WidgetContent = TextContent | ImageContent | DataContent | EmbedContent | WeatherContent | ClockContent | RssContent | UptimeContent | CometP8541Content | WeatherDashContent | SystemResourcesContent | TasksContent | SpeedtestContent;

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
  background: BackgroundPattern;
  backgroundSettings?: BackgroundSettings;
  grid: number;
  zoom: number;
  viewport: Viewport;
  hideHeadersWhenLocked?: boolean;
  version: number;
}

export interface Dashboard {
  id: string;
  name: string;
  state: DashboardState;
  createdAt: number;
  updatedAt: number;
}

export interface MultiDashboardState {
  dashboards: Dashboard[];
  activeDashboardId: string;
  version: number;
}

export interface HistoryState {
  past: DashboardState[];
  future: DashboardState[];
}

// Widget size constraints
// Reduced minimum size from 100x60 to 50x50 to allow creation of smaller widgets
// like compact clocks, icons, status indicators, and mini gauges
export const MIN_WIDGET_SIZE = { w: 50, h: 50 };
export const DEFAULT_WIDGET_SIZE = { w: 600, h: 400 };
export const DEFAULT_GRID_SIZE = 10;
export const DEFAULT_ZOOM = 1.0;
