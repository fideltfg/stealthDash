import type { MultiDashboardState } from '../types';
import { authService } from './auth';
import { getDefaultMultiDashboardState } from '../storage';

/**
 * Dashboard storage service - server only (no localStorage).
 * Server storage is the single source of truth when authenticated.
 */
class DashboardStorageService {
  private saveTimeout: number | undefined;
  private lastSaveTime: number = 0;
  private readonly SAVE_DEBOUNCE_MS = 2000; // 2 seconds
  private readonly MIN_SAVE_INTERVAL_MS = 5000; // Minimum 5 seconds between saves

  /**
   * Load dashboard state from server (no localStorage fallback)
   */
  async loadDashboards(): Promise<MultiDashboardState> {
    if (authService.isAuthenticated()) {
      try {
        console.log('🔄 Loading dashboards from server...');
        const serverData = await authService.loadDashboard();
        
        if (serverData && serverData.dashboards && serverData.dashboards.length > 0) {
          console.log('✅ Loaded', serverData.dashboards.length, 'dashboards from server');
          return serverData;
        } else {
          console.log('⚠️  No dashboards on server, creating default');
          const defaultState = getDefaultMultiDashboardState();
          // Save the default to server
          await this.saveDashboards(defaultState, true);
          return defaultState;
        }
      } catch (error) {
        console.error('❌ Failed to load from server:', error);
        return getDefaultMultiDashboardState();
      }
    } else {
      console.log('⚠️  Not authenticated, returning default state');
      return getDefaultMultiDashboardState();
    }
  }

  /**
   * Save dashboard state to server only (no localStorage)
   */
  async saveDashboards(state: MultiDashboardState, immediate: boolean = false): Promise<void> {
    // Deduplicate dashboards before saving
    const dashboardMap = new Map();
    for (const dashboard of state.dashboards) {
      dashboardMap.set(dashboard.id, dashboard);
    }
    const uniqueDashboards = Array.from(dashboardMap.values());
    
    // Log if we found duplicates
    if (uniqueDashboards.length !== state.dashboards.length) {
      console.warn('⚠️  Found and removed', state.dashboards.length - uniqueDashboards.length, 'duplicate dashboards before saving');
    }
    
    const cleanState = {
      ...state,
      dashboards: uniqueDashboards
    };
    
    // Save to server if authenticated
    if (authService.isAuthenticated()) {
      if (immediate) {
        await this.saveToServerNow(cleanState);
      } else {
        this.debouncedSaveToServer(cleanState);
      }
    } else {
      console.warn('⚠️  Not authenticated, cannot save to server');
    }
  }

  /**
   * Debounced save to server to avoid excessive API calls
   */
  private debouncedSaveToServer(state: MultiDashboardState): void {
    // Clear existing timeout
    if (this.saveTimeout !== undefined) {
      clearTimeout(this.saveTimeout);
    }

    // Check if enough time has passed since last save
    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;
    
    if (timeSinceLastSave < this.MIN_SAVE_INTERVAL_MS) {
      // Too soon, schedule for later
      const delay = this.MIN_SAVE_INTERVAL_MS - timeSinceLastSave + this.SAVE_DEBOUNCE_MS;
      this.saveTimeout = window.setTimeout(() => {
        this.saveToServerNow(state);
        this.saveTimeout = undefined;
      }, delay);
    } else {
      // Enough time has passed, schedule with normal debounce
      this.saveTimeout = window.setTimeout(() => {
        this.saveToServerNow(state);
        this.saveTimeout = undefined;
      }, this.SAVE_DEBOUNCE_MS);
    }
  }

  /**
   * Immediate save to server
   */
  private async saveToServerNow(state: MultiDashboardState): Promise<void> {
    try {
      this.lastSaveTime = Date.now();
      const success = await authService.saveDashboard(state);
      
      if (!success) {
        console.warn('⚠️  Failed to save dashboards to server (saved to localStorage only)');
      }
    } catch (error) {
      console.error('❌ Error saving dashboards to server:', error);
    }
  }

  /**
   * Delete a dashboard from server only (no localStorage)
   */
  async deleteDashboard(dashboardId: string, state: MultiDashboardState): Promise<boolean> {
    // Delete from server if authenticated
    if (authService.isAuthenticated()) {
      try {
        const success = await authService.deleteDashboard(dashboardId);
        if (!success) {
          console.warn('⚠️  Failed to delete dashboard from server');
        }
        return success;
      } catch (error) {
        console.error('❌ Error deleting dashboard from server:', error);
        return false;
      }
    }
    
    return false; // Cannot delete without authentication
  }

  /**
   * Force synchronization with server
   */
  async syncWithServer(): Promise<boolean> {
    if (!authService.isAuthenticated()) {
      return false;
    }

    try {
      console.log('🔄 Syncing with server...');
      // Load fresh data from server
      await this.loadDashboards();
      console.log('✅ Sync complete');
      return true;
    } catch (error) {
      console.error('❌ Sync failed:', error);
      return false;
    }
  }
}

export const dashboardStorage = new DashboardStorageService();
