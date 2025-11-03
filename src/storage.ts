import type { DashboardState } from './types';
import { DEFAULT_GRID_SIZE, DEFAULT_ZOOM } from './types';

const STORAGE_KEY = 'dashboard.v1';
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

export function loadState(): DashboardState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return getDefaultState();
    }

    const parsed = JSON.parse(stored) as any;
    
    // Add background property if missing (migration)
    if (!('background' in parsed)) {
      parsed.background = 'grid';
    }
    
    // Simple migration support
    if (parsed.version !== CURRENT_VERSION) {
      return migrateState(parsed as DashboardState);
    }

    return parsed as DashboardState;
  } catch (error) {
    console.error('Failed to load dashboard state:', error);
    return getDefaultState();
  }
}

export function saveState(state: DashboardState): void {
  try {
    const toSave = { ...state, version: CURRENT_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save dashboard state:', error);
  }
}

export function resetState(): DashboardState {
  localStorage.removeItem(STORAGE_KEY);
  return getDefaultState();
}

function migrateState(_oldState: DashboardState): DashboardState {
  // For version changes, reset to default with warning
  console.warn('Dashboard state version mismatch, resetting to default');
  return getDefaultState();
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
