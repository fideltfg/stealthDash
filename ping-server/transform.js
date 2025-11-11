/**
 * Data transformation utilities for obscuring/abbreviating dashboard data
 * Reduces payload size and obscures internal structure
 */

// Property mapping: full name -> abbreviated name
const WIDGET_MAP = {
  // Core widget properties
  id: 'i',
  type: 't',
  position: 'p',
  size: 's',
  autoSize: 'a',
  z: 'z',
  content: 'c',
  meta: 'm',
  
  // Position/Size sub-properties
  x: 'x',
  y: 'y',
  w: 'w',
  h: 'h',
  width: 'wd',
  height: 'hg',
  
  // Meta properties
  title: 'tt',
  createdAt: 'ca',
  updatedAt: 'ua',
  
  // Common content properties
  credentialId: 'cid',
  refreshInterval: 'ri',
  displayMode: 'dm',
  host: 'ho',
  apiKey: 'ak',
  username: 'un',
  password: 'pw',
  showClients: 'sc',
  showAlerts: 'sa',
  showCharts: 'sch',
  showTime: 'st',
  maxItems: 'mi',
  maxEvents: 'me',
  daysAhead: 'da',
  
  // Widget-specific properties
  feedUrl: 'fu',
  target: 'tg',
  interval: 'iv',
  timeout: 'to',
  markdown: 'md',
  src: 'sr',
  objectFit: 'of',
  alt: 'al',
  url: 'ur',
  sandbox: 'sb',
  location: 'lo',
  timezone: 'tz',
  format24h: 'f24',
  showTimezone: 'stz',
  latitude: 'lat',
  longitude: 'lon',
  language: 'lg',
  deviceName: 'dn',
  port: 'po',
  unitId: 'uid',
  enabledChannels: 'ech',
  temperatureUnit: 'tu',
  showAlarms: 'sal',
  site: 'si',
  showLifts: 'sl',
  showTrails: 'str',
  showSnow: 'ssn',
  showWeather: 'sw',
  lastUpdated: 'lu',
  cachedData: 'cd'
};

// Create reverse mapping for expansion
const WIDGET_REVERSE_MAP = Object.fromEntries(
  Object.entries(WIDGET_MAP).map(([k, v]) => [v, k])
);

const DASHBOARD_STATE_MAP = {
  widgets: 'w',
  theme: 't',
  background: 'b',
  grid: 'g',
  zoom: 'z',
  viewport: 'v',
  version: 'vr'
};

const DASHBOARD_STATE_REVERSE_MAP = Object.fromEntries(
  Object.entries(DASHBOARD_STATE_MAP).map(([k, v]) => [v, k])
);

/**
 * Abbreviate object keys recursively
 */
function abbreviateObject(obj, map = WIDGET_MAP) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => abbreviateObject(item, map));
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = map[key] || key; // Use abbreviated key if mapping exists, otherwise keep original
    result[newKey] = abbreviateObject(value, map);
  }
  return result;
}

/**
 * Expand abbreviated keys back to full names - NON-RECURSIVE for widget objects
 */
function expandWidget(widget) {
  const expanded = {};
  
  // Expand top-level widget properties only
  for (const [key, value] of Object.entries(widget)) {
    const fullKey = WIDGET_REVERSE_MAP[key] || key;
    
    // Don't recursively expand nested objects (position, size, meta, content, autoSize)
    // These should keep their structure as-is
    expanded[fullKey] = value;
  }
  
  return expanded;
}

/**
 * Expand abbreviated keys back to full names recursively
 */
function expandObject(obj, reverseMap = WIDGET_REVERSE_MAP) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => expandObject(item, reverseMap));
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = reverseMap[key] || key; // Use full key if mapping exists, otherwise keep original
    result[newKey] = expandObject(value, reverseMap);
  }
  return result;
}

/**
 * Transform dashboard state for storage (abbreviate)
 */
function dashboardToStorage(dashboardState) {
  // First abbreviate the top-level dashboard state
  const abbreviated = abbreviateObject(dashboardState, DASHBOARD_STATE_MAP);
  
  // Then abbreviate each widget in the widgets array
  if (abbreviated.w && Array.isArray(abbreviated.w)) {
    abbreviated.w = abbreviated.w.map(widget => abbreviateObject(widget, WIDGET_MAP));
  }
  
  return abbreviated;
}

/**
 * Transform storage data back to dashboard state (expand)
 */
function storageToDashboard(storageData) {
  // Manually expand ONLY top-level dashboard properties (not widgets)
  const expanded = {
    widgets: [], // Will be filled below
    theme: storageData.t || storageData.theme || 'system',
    background: storageData.b || storageData.background || 'grid',
    grid: storageData.g || storageData.grid || 20,
    zoom: storageData.z || storageData.zoom || 1,
    viewport: storageData.v || storageData.viewport || { x: 0, y: 0 },
    version: storageData.vr || storageData.version || 1
  };
  
  // Expand the widgets array using NON-RECURSIVE expandWidget function
  const widgetsArray = storageData.w || storageData.widgets || [];
  if (Array.isArray(widgetsArray)) {
    expanded.widgets = widgetsArray.map(widget => expandWidget(widget));
  }
  
  return expanded;
}

/**
 * Transform multi-dashboard state for storage
 */
function multiDashboardToStorage(multiState) {
  const result = {
    dashboards: multiState.dashboards.map(dashboard => ({
      dashboardId: dashboard.dashboardId,
      name: dashboard.name,
      state: dashboardToStorage(dashboard.state),
      isActive: dashboard.isActive
    })),
    activeDashboardId: multiState.activeDashboardId,
    version: multiState.version
  };
  return result;
}

/**
 * Transform storage data back to multi-dashboard state
 */
function storageToMultiDashboard(storageData) {
  const result = {
    dashboards: storageData.dashboards.map(dashboard => ({
      dashboardId: dashboard.dashboardId,
      name: dashboard.name,
      state: storageToDashboard(dashboard.state),
      isActive: dashboard.isActive
    })),
    activeDashboardId: storageData.activeDashboardId,
    version: storageData.version
  };
  return result;
}

module.exports = {
  abbreviateObject,
  expandObject,
  dashboardToStorage,
  storageToDashboard,
  multiDashboardToStorage,
  storageToMultiDashboard,
  WIDGET_MAP,
  WIDGET_REVERSE_MAP,
  DASHBOARD_STATE_MAP,
  DASHBOARD_STATE_REVERSE_MAP
};
