/**
 * Widget Metadata Registry
 * 
 * This file contains metadata for all available widgets.
 * It provides widget information to the client without requiring
 * the client to load all widget code.
 * 
 * When adding a new widget:
 * 1. Add its metadata here
 * 2. Add the widget module to src/widgets/types/index.ts
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

export const widgetMetadata: WidgetMetadataEntry[] = [
  {
    type: 'image',
    name: 'Image',
    icon: '<i class="fa-regular fa-image"></i>',
    description: 'Display images from URLs',
    defaultSize: { w: 400, h: 400 },
    defaultContent: { src: '', objectFit: 'contain' },
    hasSettings: true
  },
  {
    type: 'embed',
    name: 'Embed',
    icon: '<i class="fa-solid fa-globe"></i>',
    description: 'Embed external websites in an iframe',
    defaultSize: { w: 600, h: 400 },
    defaultContent: { url: '' },
    hasSettings: true
  },
  {
    type: 'weather',
    name: 'Weather',
    icon: '<i class="fa-solid fa-cloud-sun"></i>',
    description: 'Display weather information',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'clock',
    name: 'Clock',
    icon: '<i class="fa-regular fa-clock"></i>',
    description: 'Display an analog or digital clock',
    defaultSize: { w: 400, h: 500 },
    defaultContent: { mode: 'analog' },
    hasSettings: true
  },
  {
    type: 'rss',
    name: 'RSS Feed',
    icon: '<i class="fa-solid fa-rss"></i>',
    description: 'Display RSS feed items',
    defaultSize: { w: 400, h: 500 },
    defaultContent: { url: '', maxItems: 10 },
    hasSettings: true
  },
  {
    type: 'uptime',
    name: 'Uptime Monitor',
    icon: '<i class="fa-solid fa-chart-line"></i>',
    description: 'Monitor website uptime and response times',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'comet-p8541',
    name: 'Comet P8541',
    icon: '<i class="fa-solid fa-temperature-half"></i>',
    description: 'Display Comet P8541 sensor data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'home-assistant',
    name: 'Home Assistant',
    icon: '<i class="fa-solid fa-house"></i>',
    description: 'Display Home Assistant entities',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'chatgpt',
    name: 'ChatGPT',
    icon: '<i class="fa-solid fa-robot"></i>',
    description: 'Interactive ChatGPT conversation widget',
    defaultSize: { w: 500, h: 600 },
    defaultContent: {},
    hasSettings: false
  },
  {
    type: 'mtnxml',
    name: 'MTN XML',
    icon: '<i class="fa-solid fa-person-skiing"></i>',
    description: 'Display MTN XML data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'envcanada',
    name: 'Environment Canada',
    icon: '<i class="fa-brands fa-canadian-maple-leaf"></i>',
    description: 'Display Environment Canada weather data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'pihole',
    name: 'Pi-hole',
    icon: '<i class="fa-solid fa-shield-halved"></i>',
    description: 'Display Pi-hole statistics',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'google-calendar',
    name: 'Google Calendar',
    icon: '<i class="fa-solid fa-calendar-days"></i>',
    description: 'Display Google Calendar events',
    defaultSize: { w: 400, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi',
    name: 'UniFi',
    icon: '<i class="fa-solid fa-wifi"></i>',
    description: 'Display UniFi network statistics',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi-protect',
    name: 'UniFi Protect',
    icon: '<i class="fa-solid fa-video"></i>',
    description: 'View UniFi Protect cameras and motion detections',
    defaultSize: { w: 600, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi-sensor',
    name: 'UniFi Environmental Sensors',
    icon: '<i class="fa-solid fa-temperature-half"></i>',
    description: 'Monitor temperature, humidity, and light from USL-Environmental devices',
    defaultSize: { w: 400, h: 400 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'docker',
    name: 'Docker',
    icon: '<i class="fa-brands fa-docker"></i>',
    description: 'Monitor and manage Docker containers',
    defaultSize: { w: 400, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'gmail',
    name: 'Gmail',
    icon: '<i class="fa-solid fa-envelope"></i>',
    description: 'Display Gmail inbox with unread messages and quick actions',
    defaultSize: { w: 400, h: 600 },
    defaultContent: {
      labelIds: ['INBOX'],
      maxResults: 20,
      refreshInterval: 300
    },
    hasSettings: true
  },
  {
    type: 'weather-dash',
    name: 'Weather Dashboard',
    icon: '<i class="fa-solid fa-mountain-sun"></i>',
    description: 'Full weather dashboard with 24-hour hourly and 7-day daily forecasts',
    defaultSize: { w: 1200, h: 800 },
    defaultContent: { latitude: 0, longitude: 0, timezone: 'America/Edmonton', locationName: '' },
    hasSettings: true
  },
  {
    type: 'vnc',
    name: 'VNC Remote Desktop',
    icon: '<i class="fa-solid fa-desktop"></i>',
    description: 'Connect to remote VNC servers and display their desktops',
    defaultSize: { w: 800, h: 600 },
    defaultContent: {
      viewOnly: false,
      scaleMode: 'local',
      clipToWindow: true,
      showDotCursor: false,
      qualityLevel: 6,
      compressionLevel: 2,
      autoConnect: true,
      reconnectDelay: 5
    },
    hasSettings: true
  }
];
