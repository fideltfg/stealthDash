import type { DashboardState, Dashboard, MultiDashboardState } from '../types/types';
import { DEFAULT_GRID_SIZE, DEFAULT_ZOOM } from '../types/types';

const CURRENT_VERSION = 1;

// Generate UUID with fallback for older browsers
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getDefaultState(): DashboardState {
  return {
    widgets: [],
    theme: 'system',
    background: 'grid',
    grid: DEFAULT_GRID_SIZE,
    zoom: DEFAULT_ZOOM,
    viewport: { x: 0, y: 0 },
    version: CURRENT_VERSION
  };
}

export function getDefaultDashboard(): Dashboard {
  return {
    id: generateUUID(),
    name: 'Main Dashboard',
    state: getDefaultState(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function getDefaultMultiDashboardState(): MultiDashboardState {
  const defaultDashboard = getDefaultDashboard();
  return {
    dashboards: [defaultDashboard],
    activeDashboardId: defaultDashboard.id,
    version: CURRENT_VERSION
  };
}
