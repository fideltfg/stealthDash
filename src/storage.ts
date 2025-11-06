import type { DashboardState, Dashboard, MultiDashboardState } from './types';
import { DEFAULT_GRID_SIZE, DEFAULT_ZOOM } from './types';

const STORAGE_KEY = 'dashboard.v1';
const MULTI_DASHBOARD_KEY = 'dashboards.v2';
const CURRENT_VERSION = 1;

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
    id: crypto.randomUUID(),
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

// Load multi-dashboard state (v2) or migrate from old format (v1)
export function loadMultiDashboardState(): MultiDashboardState {
  try {
    // Try to load new multi-dashboard format
    const stored = localStorage.getItem(MULTI_DASHBOARD_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as MultiDashboardState;
      return parsed;
    }

    // Try to migrate from old single-dashboard format
    const oldStored = localStorage.getItem(STORAGE_KEY);
    if (oldStored) {
      const oldState = JSON.parse(oldStored) as DashboardState;
      const dashboard: Dashboard = {
        id: crypto.randomUUID(),
        name: 'Main Dashboard',
        state: oldState,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const multiState: MultiDashboardState = {
        dashboards: [dashboard],
        activeDashboardId: dashboard.id,
        version: CURRENT_VERSION
      };
      
      // Save migrated state
      saveMultiDashboardState(multiState);
      
      // Remove old storage key
      localStorage.removeItem(STORAGE_KEY);
      
      return multiState;
    }

    return getDefaultMultiDashboardState();
  } catch (error) {
    console.error('Failed to load dashboard state:', error);
    return getDefaultMultiDashboardState();
  }
}

export function saveMultiDashboardState(state: MultiDashboardState): void {
  try {
    const toSave = { ...state, version: CURRENT_VERSION };
    localStorage.setItem(MULTI_DASHBOARD_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save dashboard state:', error);
  }
}

// Legacy functions for backward compatibility
export function loadState(): DashboardState {
  const multiState = loadMultiDashboardState();
  const activeDashboard = multiState.dashboards.find(d => d.id === multiState.activeDashboardId);
  return activeDashboard?.state || getDefaultState();
}

export function saveState(state: DashboardState): void {
  const multiState = loadMultiDashboardState();
  const activeDashboard = multiState.dashboards.find(d => d.id === multiState.activeDashboardId);
  
  if (activeDashboard) {
    activeDashboard.state = state;
    activeDashboard.updatedAt = Date.now();
    saveMultiDashboardState(multiState);
  }
}

export function resetState(): DashboardState {
  const multiState = getDefaultMultiDashboardState();
  saveMultiDashboardState(multiState);
  return multiState.dashboards[0].state;
}

// Debounced save
let saveTimeout: number | undefined;

export function debouncedSave(state: DashboardState, delay = 500): void {
  if (saveTimeout !== undefined) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    saveState(state);
    saveTimeout = undefined;
  }, delay);
}

// Dashboard management functions
export function createDashboard(name: string): Dashboard {
  const multiState = loadMultiDashboardState();
  const newDashboard: Dashboard = {
    id: crypto.randomUUID(),
    name,
    state: getDefaultState(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  multiState.dashboards.push(newDashboard);
  saveMultiDashboardState(multiState);
  
  return newDashboard;
}

export function deleteDashboard(dashboardId: string): void {
  const multiState = loadMultiDashboardState();
  
  // Don't delete if it's the last dashboard
  if (multiState.dashboards.length <= 1) {
    console.warn('Cannot delete the last dashboard');
    return;
  }
  
  multiState.dashboards = multiState.dashboards.filter(d => d.id !== dashboardId);
  
  // If we deleted the active dashboard, switch to the first one
  if (multiState.activeDashboardId === dashboardId) {
    multiState.activeDashboardId = multiState.dashboards[0].id;
  }
  
  saveMultiDashboardState(multiState);
}

export function renameDashboard(dashboardId: string, newName: string): void {
  const multiState = loadMultiDashboardState();
  const dashboard = multiState.dashboards.find(d => d.id === dashboardId);
  
  if (dashboard) {
    dashboard.name = newName;
    dashboard.updatedAt = Date.now();
    saveMultiDashboardState(multiState);
  }
}

export function switchDashboard(dashboardId: string): DashboardState | null {
  const multiState = loadMultiDashboardState();
  const dashboard = multiState.dashboards.find(d => d.id === dashboardId);
  
  if (dashboard) {
    multiState.activeDashboardId = dashboardId;
    saveMultiDashboardState(multiState);
    return dashboard.state;
  }
  
  return null;
}

export function getActiveDashboardId(): string {
  const multiState = loadMultiDashboardState();
  return multiState.activeDashboardId;
}

export function getAllDashboards(): Dashboard[] {
  const multiState = loadMultiDashboardState();
  return multiState.dashboards;
}
