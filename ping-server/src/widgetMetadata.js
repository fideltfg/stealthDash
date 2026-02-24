/**
 * Widget Metadata Registry
 * 
 * This file contains metadata for all available widgets.
 * It's used by the server to provide widget information to the client
 * without requiring the client to load all widget code.
 * 
 * When adding a new widget:
 * 1. Add its metadata here
 * 2. Add the widget module to src/widgets/types/index.ts
 */

const widgetMetadata = [
  {
    type: 'image',
    name: 'Image',
    icon: '🖼️',
    description: 'Display images from URLs',
    defaultSize: { w: 400, h: 400 },
    defaultContent: { src: '', objectFit: 'contain' },
    hasSettings: true
  },
  {
    type: 'embed',
    name: 'Embed',
    icon: '🌐',
    description: 'Embed external websites in an iframe',
    defaultSize: { w: 600, h: 400 },
    defaultContent: { url: '' },
    hasSettings: true
  },
  {
    type: 'weather',
    name: 'Weather',
    icon: '🌤️',
    description: 'Display weather information',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'clock',
    name: 'Clock',
    icon: '🕐',
    description: 'Display an analog or digital clock',
    defaultSize: { w: 400, h: 500 },
    defaultContent: { mode: 'analog' },
    hasSettings: true
  },
  {
    type: 'rss',
    name: 'RSS Feed',
    icon: '📰',
    description: 'Display RSS feed items',
    defaultSize: { w: 400, h: 500 },
    defaultContent: { url: '', maxItems: 10 },
    hasSettings: true
  },
  {
    type: 'uptime',
    name: 'Uptime Monitor',
    icon: '📊',
    description: 'Monitor website uptime and response times',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'comet-p8541',
    name: 'Comet P8541',
    icon: '🌡️',
    description: 'Display Comet P8541 sensor data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'home-assistant',
    name: 'Home Assistant',
    icon: '🏠',
    description: 'Display Home Assistant entities',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'chatgpt',
    name: 'ChatGPT',
    icon: '💬',
    description: 'Interactive ChatGPT conversation widget',
    defaultSize: { w: 500, h: 600 },
    defaultContent: {},
    hasSettings: false
  },
  {
    type: 'mtnxml',
    name: 'MTN XML',
    icon: '📡',
    description: 'Display MTN XML data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'envcanada',
    name: 'Environment Canada',
    icon: '🍁',
    description: 'Display Environment Canada weather data',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'pihole',
    name: 'Pi-hole',
    icon: '🛡️',
    description: 'Display Pi-hole statistics',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'google-calendar',
    name: 'Google Calendar',
    icon: '📅',
    description: 'Display Google Calendar events',
    defaultSize: { w: 400, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi',
    name: 'UniFi',
    icon: '📶',
    description: 'Display UniFi network statistics',
    defaultSize: { w: 400, h: 300 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi-protect',
    name: 'UniFi Protect',
    icon: '📹',
    description: 'View UniFi Protect cameras and motion detections',
    defaultSize: { w: 600, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'unifi-sensor',
    name: 'UniFi Environmental Sensors',
    icon: '🌡️',
    description: 'Monitor temperature, humidity, and light from USL-Environmental devices',
    defaultSize: { w: 400, h: 400 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'docker',
    name: 'Docker',
    icon: '🐋',
    description: 'Monitor and manage Docker containers',
    defaultSize: { w: 400, h: 500 },
    defaultContent: {},
    hasSettings: true
  },
  {
    type: 'gmail',
    name: 'Gmail',
    icon: '📧',
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
    type: 'vnc',
    name: 'VNC Remote Desktop',
    icon: '🖥️',
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

module.exports = { widgetMetadata };
